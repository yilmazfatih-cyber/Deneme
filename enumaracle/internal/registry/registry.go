// Package registry owns the identity side of Enumaracle: vetted entities (KYC),
// their KYC documents and vetting history, the telephone numbers and ranges
// they register, their branding (display name, logo, call reason), public
// signup, and the call-time lookup service used by carriers, ENUM and PKI.
package registry

import (
	"context"
	"embed"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Migrations holds the registry schema (0100_registry.sql).
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Deps are the registry's dependencies. Notifier and Accounts may be nil:
// a nil Notifier discards events, a nil Accounts makes signup fail.
type Deps struct {
	Base     platform.Deps
	Notifier core.Notifier
	Accounts core.Accounts
}

// Service implements core.LookupService and core.EntityDirectory and serves
// every registry HTTP route.
type Service struct {
	base     platform.Deps
	db       *platform.DB
	log      *slog.Logger
	notifier core.Notifier
	accounts core.Accounts

	repMu sync.RWMutex
	rep   core.ReputationReader

	cache *lookupCache
}

var (
	_ core.LookupService   = (*Service)(nil)
	_ core.EntityDirectory = (*Service)(nil)
)

// New builds the registry service.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, errors.New("registry: Base.DB is required")
	}
	s := &Service{
		base:     d.Base,
		db:       d.Base.DB,
		log:      d.Base.Log,
		notifier: d.Notifier,
		accounts: d.Accounts,
		cache:    newLookupCache(d.Base.Cfg.LookupTTL),
	}
	if s.log == nil {
		s.log = slog.New(slog.DiscardHandler)
	}
	if s.notifier == nil {
		s.notifier = core.NopNotifier{}
	}
	return s, nil
}

// SetReputation installs the reputation reader used by Lookup (nil = no scores).
func (s *Service) SetReputation(r core.ReputationReader) {
	s.repMu.Lock()
	s.rep = r
	s.repMu.Unlock()
	s.cache.invalidate()
}

func (s *Service) reputation() core.ReputationReader {
	s.repMu.RLock()
	defer s.repMu.RUnlock()
	return s.rep
}

// Start prunes expired lookup cache entries until ctx is done.
func (s *Service) Start(ctx context.Context) error {
	if s.cache.ttl <= 0 {
		return nil
	}
	go func() {
		t := time.NewTicker(time.Minute)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				s.cache.prune(s.base.Now())
			}
		}
	}()
	return nil
}

func (s *Service) now() time.Time { return s.base.Now() }

// ---------------------------------------------------------------- events

type quietKey struct{}

// quiet suppresses event publication (used by the demo seed).
func quiet(ctx context.Context) context.Context { return context.WithValue(ctx, quietKey{}, true) }

func (s *Service) emit(ctx context.Context, typ, entityID string, data any) {
	if q, _ := ctx.Value(quietKey{}).(bool); q {
		return
	}
	e := core.Event{ID: core.NewID(), Type: typ, At: s.now(), EntityID: entityID, Data: data}
	if err := s.notifier.Notify(ctx, e); err != nil {
		s.log.Warn("registry: notify failed", "type", typ, "entity_id", entityID, "err", err)
	}
}

// ---------------------------------------------------------------- lookup cache

const maxCacheEntries = 100_000

type cacheEntry struct {
	res core.LookupResult
	exp time.Time
}

// lookupCache is a TTL cache keyed by normalized TN. Every registry write
// calls invalidate, which bumps a generation counter so that a lookup that
// started before the write cannot store its (stale) result afterwards.
type lookupCache struct {
	ttl time.Duration
	mu  sync.Mutex
	gen uint64
	m   map[string]cacheEntry
}

func newLookupCache(ttl time.Duration) *lookupCache {
	return &lookupCache{ttl: ttl, m: map[string]cacheEntry{}}
}

func (c *lookupCache) get(tn string, now time.Time) (core.LookupResult, bool) {
	if c.ttl <= 0 {
		return core.LookupResult{}, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	e, ok := c.m[tn]
	if !ok || !now.Before(e.exp) {
		return core.LookupResult{}, false
	}
	return e.res, true
}

func (c *lookupCache) generation() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.gen
}

func (c *lookupCache) put(tn string, res core.LookupResult, gen uint64, now time.Time) {
	if c.ttl <= 0 {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if gen != c.gen {
		return
	}
	if len(c.m) >= maxCacheEntries {
		c.m = map[string]cacheEntry{}
	}
	c.m[tn] = cacheEntry{res: res, exp: now.Add(c.ttl)}
}

func (c *lookupCache) invalidate() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.gen++
	if len(c.m) > 0 {
		c.m = map[string]cacheEntry{}
	}
}

func (c *lookupCache) prune(now time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for k, e := range c.m {
		if !now.Before(e.exp) {
			delete(c.m, k)
		}
	}
}

func (c *lookupCache) size() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.m)
}
