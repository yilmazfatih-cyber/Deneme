// Package pki runs the pilot STI-CA of Enumaracle: sealed P-256 signing keys,
// a self-signed root, an intermediate, the operator SP certificate carrying a
// TNAuthList with the operator SPC, RFC 9060 delegate certificates for
// verified enterprises, and PASSporT (shaken + rcd) signing and verification
// against the local certificate store only.
package pki

import (
	"context"
	"crypto/ecdsa"
	"crypto/x509"
	"embed"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

//go:embed migrations/*.sql
var Migrations embed.FS

// Validity periods of the pilot STI-CA.
const (
	RootValidity         = 10 * 365 * 24 * time.Hour
	IntermediateValidity = 5 * 365 * 24 * time.Hour
	SPValidity           = 365 * 24 * time.Hour
	DelegateValidity     = 90 * 24 * time.Hour
	// SPRenewBefore: Start renews the operator SP certificate this long before it expires.
	SPRenewBefore = 30 * 24 * time.Hour
)

// Certificate statuses. A rotated SP certificate is revoked with reason "superseded".
const (
	StatusActive  = "active"
	StatusRevoked = "revoked"
)

// Deps are the dependencies of the pki service. Directory, Lookup and Notifier may be nil.
type Deps struct {
	Base      platform.Deps
	Directory core.EntityDirectory
	Lookup    core.LookupService
	Notifier  core.Notifier
}

// Service implements the pilot STI-CA and PASSporT signing/verification.
type Service struct {
	d   Deps
	db  *platform.DB
	log *slog.Logger

	mu    sync.Mutex
	keys  map[string]*ecdsa.PrivateKey // key id -> unsealed key (process memory only)
	certs map[string]*x509.Certificate // cert id -> parsed certificate (immutable)
}

// New constructs the service. Call Init before signing.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, errors.New("pki: Base.DB is required")
	}
	if d.Base.Sealer == nil {
		return nil, errors.New("pki: Base.Sealer is required")
	}
	if d.Base.Cfg.SPC == "" {
		return nil, errors.New("pki: Cfg.SPC is required")
	}
	log := d.Base.Log
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	return &Service{d: d, db: d.Base.DB, log: log,
		keys: map[string]*ecdsa.PrivateKey{}, certs: map[string]*x509.Certificate{}}, nil
}

func (s *Service) now() time.Time { return s.d.Base.Now() }

// Init creates the root, intermediate and operator SP certificate when no
// usable one exists. It is idempotent.
func (s *Service) Init(ctx context.Context) error {
	ctx = core.WithPrincipal(ctx, core.SystemPrincipal)
	return s.db.InTx(ctx, func(tx *platform.Tx) error {
		_, inter, err := s.ensureCA(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := s.activeCert(ctx, tx, core.CertSP, "", inter.ID); err == nil {
			return nil
		} else if !errors.Is(err, core.ErrNotFound) {
			return err
		}
		_, err = s.issueSP(ctx, tx, inter)
		return err
	})
}

// Start renews the operator SP certificate shortly before expiry. It returns
// when ctx is cancelled.
func (s *Service) Start(ctx context.Context) error {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			if err := s.renewIfNeeded(ctx); err != nil {
				s.log.Error("pki: SP renewal failed", "err", err)
			}
		}
	}
}

func (s *Service) renewIfNeeded(ctx context.Context) error {
	sp, err := s.activeCert(ctx, s.db, core.CertSP, "", "")
	if err == nil && sp.NotAfter.Sub(s.now()) > SPRenewBefore {
		return nil
	}
	if err != nil && !errors.Is(err, core.ErrNotFound) {
		return err
	}
	_, err = s.RotateSP(core.WithPrincipal(ctx, core.SystemPrincipal))
	return err
}

func (s *Service) notify(ctx context.Context, typ, entityID string, data any) {
	if s.d.Notifier == nil {
		return
	}
	if err := s.d.Notifier.Notify(ctx, core.Event{ID: core.NewID(), Type: typ, At: s.now(), EntityID: entityID, Data: data}); err != nil {
		s.log.Warn("pki: notify failed", "type", typ, "err", err)
	}
}
