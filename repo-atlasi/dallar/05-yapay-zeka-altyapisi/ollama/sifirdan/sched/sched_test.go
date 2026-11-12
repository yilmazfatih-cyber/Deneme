package sched

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"miniollama/api"
	"miniollama/runner"
	"miniollama/store"
)

type sahte struct{ kapandi atomic.Bool }

func (f *sahte) Generate(context.Context, string, runner.Options, func(string) error) (runner.Result, error) {
	return runner.Result{}, nil
}
func (f *sahte) Size() int64  { return 1 }
func (f *sahte) Close() error { f.kapandi.Store(true); return nil }

func model(ad string) *store.Model {
	n, _ := store.ParseName(ad)
	return &store.Model{Name: n, Digest: ad}
}

func yeni(max int, keep time.Duration) (*Scheduler, map[string]*sahte) {
	yuklenen := map[string]*sahte{}
	return New(func(_ context.Context, m *store.Model) (runner.Runner, error) {
		f := &sahte{}
		yuklenen[m.Digest] = f
		return f, nil
	}, max, keep), yuklenen
}

func sure(d time.Duration) *api.Duration { return &api.Duration{Duration: d} }

func TestAyniModelPaylasilir(t *testing.T) {
	s, _ := yeni(2, time.Minute)
	_, rel1, _ := s.Acquire(context.Background(), model("a"), nil)
	_, rel2, _ := s.Acquire(context.Background(), model("a"), nil)
	rel1()
	rel2()
	rel2() // iki kez çağırmak zarar vermez
	if s.Loads != 1 || len(s.Ps()) != 1 {
		t.Fatalf("yükleme=%d yüklü=%d", s.Loads, len(s.Ps()))
	}
}

func TestKeepAliveSifirHemenBosaltir(t *testing.T) {
	s, y := yeni(2, time.Minute)
	_, rel, _ := s.Acquire(context.Background(), model("a"), sure(0))
	rel()
	if len(s.Ps()) != 0 || !y["a"].kapandi.Load() {
		t.Fatal("keep_alive=0 sonrası model bellekte kalmamalı")
	}
}

func TestSureDolunca(t *testing.T) {
	s, y := yeni(2, time.Minute)
	_, rel, _ := s.Acquire(context.Background(), model("a"), sure(30*time.Millisecond))
	rel()
	if ps := s.Ps(); len(ps) != 1 || ps[0].ExpiresAt.IsZero() {
		t.Fatalf("hemen boşaltılmamalı ve bitiş zamanı olmalı: %+v", ps)
	}
	deadline := time.Now().Add(2 * time.Second)
	for len(s.Ps()) != 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if !y["a"].kapandi.Load() {
		t.Fatal("süre dolunca boşaltılmalıydı")
	}
}

func TestKullanimdaykenSureIslemez(t *testing.T) {
	s, _ := yeni(2, time.Minute)
	_, rel, _ := s.Acquire(context.Background(), model("a"), sure(10*time.Millisecond))
	rel()
	_, rel2, _ := s.Acquire(context.Background(), model("a"), nil) // zamanlayıcı durdurulur
	time.Sleep(40 * time.Millisecond)
	if len(s.Ps()) != 1 {
		t.Fatal("kullanımdaki model boşaltıldı")
	}
	rel2()
}

func TestYerYoksaBostakiAtilir(t *testing.T) {
	s, y := yeni(1, time.Minute)
	_, rel, _ := s.Acquire(context.Background(), model("a"), nil)
	rel()
	_, rel2, _ := s.Acquire(context.Background(), model("b"), nil)
	defer rel2()
	if !y["a"].kapandi.Load() || len(s.Ps()) != 1 || s.Ps()[0].Name != "b:latest" {
		t.Fatalf("a atılıp b yüklenmeliydi: %+v", s.Ps())
	}
}

func TestMesgulseBekler(t *testing.T) {
	s, _ := yeni(1, time.Minute)
	_, rel, _ := s.Acquire(context.Background(), model("a"), nil)
	bitti := make(chan struct{})
	go func() {
		_, rel2, err := s.Acquire(context.Background(), model("b"), nil)
		if err == nil {
			rel2()
		}
		close(bitti)
	}()
	select {
	case <-bitti:
		t.Fatal("a kullanımdayken b yüklenmemeliydi")
	case <-time.After(30 * time.Millisecond):
	}
	rel()
	select {
	case <-bitti:
	case <-time.After(time.Second):
		t.Fatal("a serbest kalınca b yüklenmeliydi")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	_, relB, _ := s.Acquire(context.Background(), model("b"), nil)
	defer relB()
	if _, _, err := s.Acquire(ctx, model("c"), nil); err == nil {
		t.Fatal("bağlam süresi dolunca bekleme hata ile bitmeli")
	}
}

func TestKeepAliveJSON(t *testing.T) {
	for in, want := range map[string]time.Duration{`"5m"`: 5 * time.Minute, `30`: 30 * time.Second, `-1`: api.Forever, `"0"`: 0} {
		var d api.Duration
		if err := d.UnmarshalJSON([]byte(in)); err != nil || d.Duration != want {
			t.Errorf("%s -> %v %v", in, d.Duration, err)
		}
	}
}
