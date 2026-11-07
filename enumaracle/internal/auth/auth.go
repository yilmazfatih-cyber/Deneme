// Package auth owns portal users, cookie sessions, API keys, login
// throttling and the admin audit endpoint. Service implements
// core.Authenticator and core.Accounts.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"embed"
	"encoding/base32"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Migrations holds the auth schema (users, sessions, api_keys).
//
//go:embed migrations/*.sql
var Migrations embed.FS

// Tunables.
const (
	SessionTTL        = 12 * time.Hour   // absolute session lifetime
	lastSeenEvery     = time.Minute      // sliding last_seen_at write granularity
	lastUsedEvery     = time.Minute      // API key last_used_at write granularity
	DefaultRateRPS    = 50               // API key token bucket default
	maxRateRPS        = 10000            // upper bound accepted on key creation
	LoginMaxFailures  = 5                // failures per email+IP ...
	LoginWindow       = 15 * time.Minute // ... within this window -> 429
	MinPasswordLength = 10
	maxPasswordBytes  = 1024
	cleanupEvery      = 10 * time.Minute
)

// Deps are the constructor inputs of auth.
type Deps struct {
	Base platform.Deps
}

// Service implements core.Authenticator and core.Accounts and serves the auth routes.
type Service struct {
	base   platform.Deps
	db     *platform.DB
	params Argon2Params
	dummy  string // hash verified for unknown emails to keep login timing uniform

	mu      sync.Mutex
	fails   map[string][]time.Time // email|ip -> failure times in window
	buckets map[string]*bucket     // api key id -> token bucket
}

var (
	_ core.Authenticator = (*Service)(nil)
	_ core.Accounts      = (*Service)(nil)
)

// New constructs the service.
func New(d Deps) (*Service, error) {
	if d.Base.DB == nil {
		return nil, errors.New("auth: Base.DB is required")
	}
	s := &Service{base: d.Base, db: d.Base.DB, params: DefaultArgon2,
		fails: map[string][]time.Time{}, buckets: map[string]*bucket{}}
	dummy, err := HashPassword(randomToken(16), s.params)
	if err != nil {
		return nil, err
	}
	s.dummy = dummy
	return s, nil
}

func (s *Service) now() time.Time { return s.base.Now() }

func (s *Service) logWarn(msg string, args ...any) {
	if s.base.Log != nil {
		s.base.Log.Warn(msg, args...)
	}
}

// Mount registers every auth route.
func (s *Service) Mount(r *platform.Router) {
	r.Handle("POST", "/auth/login", "", s.handleLogin)
	r.Handle("POST", "/auth/logout", "", s.handleLogout)
	r.Handle("GET", "/auth/me", "", s.handleMe)

	r.Handle("GET", "/v1/admin/users", core.ScopeAdminRead, s.handleListUsers)
	r.Handle("POST", "/v1/admin/users", core.ScopeAdmin, s.handleCreateUser)
	r.Handle("POST", "/v1/admin/users/{id}/active", core.ScopeAdmin, s.handleSetActive)

	r.Handle("GET", "/v1/admin/apikeys", core.ScopeAdminRead, s.handleAdminListKeys)
	r.Handle("POST", "/v1/admin/apikeys", core.ScopeAdmin, s.handleAdminCreateKey)
	r.Handle("DELETE", "/v1/admin/apikeys/{id}", core.ScopeAdmin, s.handleAdminRevokeKey)

	r.Handle("GET", "/v1/enterprise/apikeys", core.ScopeEnterpriseRead, s.handleEntListKeys)
	r.Handle("POST", "/v1/enterprise/apikeys", core.ScopeEnterpriseWrite, s.handleEntCreateKey)
	r.Handle("DELETE", "/v1/enterprise/apikeys/{id}", core.ScopeEnterpriseWrite, s.handleEntRevokeKey)

	r.Handle("GET", "/v1/admin/audit", core.ScopeAdminRead, s.handleAudit)
}

// Start periodically deletes expired sessions and prunes in-memory throttle state.
func (s *Service) Start(ctx context.Context) error {
	t := time.NewTicker(cleanupEvery)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case <-t.C:
			s.cleanup(ctx)
		}
	}
}

func (s *Service) cleanup(ctx context.Context) {
	now := s.now()
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= ?`, platform.TS(now)); err != nil {
		s.logWarn("auth: session cleanup failed", "err", err)
	}
	s.mu.Lock()
	for k, v := range s.fails {
		if len(pruneFails(v, now)) == 0 {
			delete(s.fails, k)
		}
	}
	s.mu.Unlock()
}

// ---------------------------------------------------------------- helpers

// randomToken returns n random bytes, base64url without padding.
func randomToken(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand never fails on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

var b32 = base32.NewEncoding("abcdefghijklmnopqrstuvwxyz234567").WithPadding(base32.NoPadding)

// randomBase32 returns n random lowercase base32 characters (n multiple of 8).
func randomBase32(n int) string {
	b := make([]byte, n*5/8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return b32.EncodeToString(b)
}

func sha256Hex(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

// withActor returns ctx carrying principal p (keeps request id / ip of ctx).
func withActor(ctx context.Context, p core.Principal) context.Context {
	return core.WithPrincipal(ctx, p)
}

func userPrincipal(u core.User, csrf string) core.Principal {
	scopes := append([]core.Scope{}, core.RoleScopes[u.Role]...)
	return core.Principal{Kind: "user", ID: u.ID, Name: u.Name, Role: u.Role, EntityID: u.EntityID,
		Scopes: scopes, CSRF: csrf}
}
