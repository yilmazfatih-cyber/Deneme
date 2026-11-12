// Package sched, modelleri belleğe yükleyen/boşaltan zamanlayıcıdır.
//
// Kurallar (gerçek Ollama ile aynı fikir, server/sched.go):
//   - Aynı model için gelen istekler yüklü çalıştırıcıyı paylaşır (referans sayacı).
//   - Son istek bitince keep_alive süresi kadar bellekte bekler; süre dolunca boşaltılır.
//     keep_alive=0 hemen boşaltır, negatif değer sonsuza dek tutar.
//   - Aynı anda en fazla MaxLoaded model yüklü olabilir; yer yoksa boşta olan en eski model atılır,
//     boşta model de yoksa istek bir model serbest kalana kadar bekler.
//
// Fark: gerçek zamanlayıcı durumu tek bir goroutine'de tutar ve kanallarla konuşur (pendingReqCh,
// finishedReqCh, expiredCh, unloadedCh) ve GPU belleğine göre yerleşim hesaplar. Burada tek bir mutex var.
package sched

import (
	"context"
	"sort"
	"sync"
	"time"

	"miniollama/api"
	"miniollama/runner"
	"miniollama/store"
)

type Loader func(ctx context.Context, m *store.Model) (runner.Runner, error)

type Ref struct {
	Runner    runner.Runner
	Model     *store.Model
	refCount  int
	keepAlive time.Duration
	timer     *time.Timer
	expiresAt time.Time
	lastUsed  time.Time
}

type Scheduler struct {
	mu        sync.Mutex
	loaded    map[string]*Ref // anahtar: manifest özeti
	changed   chan struct{}   // her durum değişiminde kapatılıp yenilenir (yayın)
	load      Loader
	MaxLoaded int
	KeepAlive time.Duration // varsayılan (gerçekte OLLAMA_KEEP_ALIVE, 5 dakika)
	Loads     int           // test ve gözlem için: kaç kez yükleme yapıldı
}

func New(load Loader, maxLoaded int, keepAlive time.Duration) *Scheduler {
	return &Scheduler{loaded: map[string]*Ref{}, changed: make(chan struct{}), load: load, MaxLoaded: maxLoaded, KeepAlive: keepAlive}
}

// Acquire modeli (gerekirse yükleyerek) kullanıma verir. İş bitince dönen release çağrılmalıdır.
func (s *Scheduler) Acquire(ctx context.Context, m *store.Model, keepAlive *api.Duration) (*Ref, func(), error) {
	for {
		s.mu.Lock()
		ref, ok := s.loaded[m.Digest]
		if !ok && len(s.loaded) >= s.MaxLoaded && !s.evictIdleLocked() {
			wait := s.changed // yer yok: bir model serbest kalana kadar bekle
			s.mu.Unlock()
			select {
			case <-wait:
				continue
			case <-ctx.Done():
				return nil, nil, ctx.Err()
			}
		}
		if !ok {
			r, err := s.load(ctx, m) // basitlik için kilit altında yüklüyoruz
			if err != nil {
				s.mu.Unlock()
				return nil, nil, err
			}
			s.Loads++
			ref = &Ref{Runner: r, Model: m, keepAlive: s.KeepAlive}
			s.loaded[m.Digest] = ref
		}
		ref.refCount++
		if ref.timer != nil { // tekrar kullanılıyor: geri sayımı durdur
			ref.timer.Stop()
			ref.timer = nil
		}
		if keepAlive != nil {
			ref.keepAlive = keepAlive.Duration
		}
		s.mu.Unlock()
		var once sync.Once
		return ref, func() { once.Do(func() { s.release(ref) }) }, nil
	}
}

func (s *Scheduler) release(ref *Ref) {
	s.mu.Lock()
	defer s.mu.Unlock()
	ref.refCount--
	ref.lastUsed = time.Now()
	if ref.refCount > 0 {
		return
	}
	switch {
	case ref.keepAlive <= 0:
		s.unloadLocked(ref)
	case ref.keepAlive == api.Forever:
		ref.expiresAt = time.Time{}
	default:
		ref.expiresAt = time.Now().Add(ref.keepAlive)
		ref.timer = time.AfterFunc(ref.keepAlive, func() { s.expire(ref) })
	}
	s.broadcastLocked()
}

func (s *Scheduler) expire(ref *Ref) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ref.refCount > 0 || s.loaded[ref.Model.Digest] != ref {
		return // bu arada yeniden kullanılmaya başlanmış ya da zaten boşaltılmış
	}
	s.unloadLocked(ref)
}

// evictIdleLocked boşta olan (refCount=0) en eski kullanılmış modeli atar.
func (s *Scheduler) evictIdleLocked() bool {
	var victim *Ref
	for _, r := range s.loaded {
		if r.refCount == 0 && (victim == nil || r.lastUsed.Before(victim.lastUsed)) {
			victim = r
		}
	}
	if victim == nil {
		return false
	}
	s.unloadLocked(victim)
	return true
}

func (s *Scheduler) unloadLocked(ref *Ref) {
	if ref.timer != nil {
		ref.timer.Stop()
		ref.timer = nil
	}
	ref.Runner.Close()
	delete(s.loaded, ref.Model.Digest)
	s.broadcastLocked()
}

func (s *Scheduler) broadcastLocked() {
	close(s.changed)
	s.changed = make(chan struct{})
}

// Unload, "ollama stop" karşılığı: boşta ise modeli hemen boşaltır.
func (s *Scheduler) Unload(digest string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	ref, ok := s.loaded[digest]
	if !ok || ref.refCount > 0 {
		return false
	}
	s.unloadLocked(ref)
	return true
}

// Ps yüklü modelleri listeler (/api/ps).
func (s *Scheduler) Ps() []api.ProcessModelResponse {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []api.ProcessModelResponse{}
	for _, r := range s.loaded {
		out = append(out, api.ProcessModelResponse{Name: r.Model.Name.Short(), Size: r.Runner.Size(), ExpiresAt: r.expiresAt})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}
