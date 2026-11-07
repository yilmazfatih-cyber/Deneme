// Package reputation ingests call detail records and subscriber/third-party
// feedback, scores calling numbers with an explainable model (r1), applies the
// verified-identity protective floor and operator overrides, and publishes
// label changes.
package reputation

import (
	"context"
	"embed"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/prometheus/client_golang/prometheus"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Migrations holds the reputation schema (0400_reputation.sql).
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Deps are the dependencies of the reputation service. Notifier and Directory may be nil.
type Deps struct {
	Base      platform.Deps
	Notifier  core.Notifier
	Directory core.EntityDirectory
}

// Service implements core.ReputationReader and core.ReputationAdmin.
type Service struct {
	base     platform.Deps
	db       *platform.DB
	log      *slog.Logger
	notifier core.Notifier
	dir      core.EntityDirectory

	scoreMu sync.Mutex // serializes scoring runs

	demoMu       sync.Mutex
	demoEntities func(ctx context.Context) ([]string, error)

	mEvents   *prometheus.CounterVec
	mFeedback prometheus.Counter
	mScored   prometheus.Counter
	lastPrune time.Time
}

var (
	_ core.ReputationReader = (*Service)(nil)
	_ core.ReputationAdmin  = (*Service)(nil)
)

// New constructs the service.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, core.Errorf(core.ErrInvalid, "reputation: Base.DB is required")
	}
	log := d.Base.Log
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	s := &Service{base: d.Base, db: d.Base.DB, log: log.With("pkg", "reputation"), notifier: d.Notifier, dir: d.Directory}
	s.mEvents = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "enumaracle_reputation_events_total",
		Help: "Call events received by the reputation ingest, by result.",
	}, []string{"result"})
	s.mFeedback = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "enumaracle_reputation_feedback_total",
		Help: "Label, complaint and block feedback items stored.",
	})
	s.mScored = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "enumaracle_reputation_scored_total",
		Help: "Number scores computed.",
	})
	if reg := d.Base.Metrics; reg != nil {
		var err error
		if s.mEvents, err = register(reg, s.mEvents); err != nil {
			return nil, err
		}
		if s.mFeedback, err = register(reg, s.mFeedback); err != nil {
			return nil, err
		}
		if s.mScored, err = register(reg, s.mScored); err != nil {
			return nil, err
		}
	}
	return s, nil
}

// register adds c to reg, reusing an identical collector registered earlier.
func register[C prometheus.Collector](reg *prometheus.Registry, c C) (C, error) {
	if err := reg.Register(c); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errors.As(err, &are) {
			if ex, ok := are.ExistingCollector.(C); ok {
				return ex, nil
			}
		}
		return c, err
	}
	return c, nil
}

// SetDemoEntities installs an optional source of entity ids for SeedDemo
// (core.EntityDirectory cannot enumerate entities). cmd may pass a registry
// function; when unset SeedDemo discovers entities from the audit log.
func (s *Service) SetDemoEntities(f func(ctx context.Context) ([]string, error)) {
	s.demoMu.Lock()
	s.demoEntities = f
	s.demoMu.Unlock()
}

func (s *Service) now() time.Time { return s.base.Now() }

// Start runs the periodic scorer every Cfg.ScoreInterval until ctx is done.
// Each tick it expires overrides, rescores numbers with new events/feedback,
// refreshes scores older than an hour (so windows age) and prunes old events.
func (s *Service) Start(ctx context.Context) error {
	iv := s.base.Cfg.ScoreInterval
	if iv <= 0 {
		iv = time.Minute
	}
	t := time.NewTicker(iv)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			if n, err := s.tick(ctx); err != nil {
				if ctx.Err() != nil {
					return nil
				}
				s.log.Error("reputation scorer", "err", err)
			} else if n > 0 {
				s.log.Debug("reputation scorer", "scored", n)
			}
		}
	}
}

// tick performs one scorer pass and returns the number of scores written.
func (s *Service) tick(ctx context.Context) (int, error) {
	now := s.now()
	if err := s.expireOverrides(ctx, now); err != nil {
		return 0, err
	}
	n, err := s.rescoreDirty(ctx)
	if err != nil {
		return n, err
	}
	stale, err := s.staleTNs(ctx, now.Add(-staleAfter), staleBatch)
	if err != nil {
		return n, err
	}
	m, err := s.rescore(ctx, stale)
	n += m
	if err != nil {
		return n, err
	}
	if now.Sub(s.lastPrune) > time.Hour {
		s.lastPrune = now
		if err := s.prune(ctx, now); err != nil {
			return n, err
		}
	}
	return n, nil
}

const (
	staleAfter     = time.Hour
	staleBatch     = 500
	eventRetention = 35 * 24 * time.Hour
	dailyRetention = 90 * 24 * time.Hour
	window24h      = 24 * time.Hour
	window7d       = 7 * 24 * time.Hour
)

// trZone is Türkiye time (UTC+3, no DST since 2016) used for daily buckets.
var trZone = time.FixedZone("TRT", 3*3600)

func dayOf(t time.Time) string { return t.In(trZone).Format("2006-01-02") }
