package auth

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// API key owner kinds.
const (
	OwnerOperator = "operator"
	OwnerEntity   = "entity"
)

const (
	keyPrefixLen = 8
	keySecretLen = 32
)

var (
	operatorKeyScopes   = []core.Scope{core.ScopeCarrierRead, core.ScopeCarrierWrite, core.ScopeAdminRead, core.ScopeAdmin}
	enterpriseKeyScopes = []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}
)

// NewAPIKey is the input of CreateAPIKey.
type NewAPIKey struct {
	Name      string
	OwnerKind string // operator|entity
	OwnerID   string // entity id for owner_kind=entity
	Scopes    []core.Scope
	RateRPS   int // 0 = DefaultRateRPS
	ExpiresAt *time.Time
}

type keyRow struct {
	core.APIKey
	hash string
}

const keyCols = `id, prefix, name, owner_kind, owner_id, scopes, rate_rps, expires_at, last_used_at, revoked_at, created_at`

func scanKey(sc interface{ Scan(...any) error }, withHash bool) (keyRow, error) {
	var k keyRow
	var scopes, expires, lastUsed, revoked, created string
	dest := []any{&k.ID, &k.Prefix, &k.Name, &k.OwnerKind, &k.OwnerID, &scopes, &k.RateRPS, &expires, &lastUsed, &revoked, &created}
	if withHash {
		dest = append(dest, &k.hash)
	}
	if err := sc.Scan(dest...); err != nil {
		return k, err
	}
	k.Scopes = []core.Scope{}
	if err := json.Unmarshal([]byte(scopes), &k.Scopes); err != nil {
		return k, err
	}
	k.ExpiresAt = platform.ParseTSPtr(expires)
	k.LastUsedAt = platform.ParseTSPtr(lastUsed)
	k.RevokedAt = platform.ParseTSPtr(revoked)
	k.CreatedAt = platform.ParseTS(created)
	return k, nil
}

func inScopes(s core.Scope, set []core.Scope) bool {
	for _, x := range set {
		if x == s {
			return true
		}
	}
	return false
}

// CreateAPIKey validates and stores a key. The returned secret is the full
// key `enm_<prefix8>_<secret32>`; it is never stored and cannot be recovered.
// Requested scopes must fit the owner kind (operator: carrier:*, admin:read,
// admin; entity: enterprise:*) and, except for operator-issued entity keys,
// must be held by the caller.
func (s *Service) CreateAPIKey(ctx context.Context, in NewAPIKey) (core.APIKey, string, error) {
	caller := core.PrincipalFrom(ctx)
	in.Name = strings.TrimSpace(in.Name)
	v := &core.ValidationError{}
	if in.Name == "" || utf8.RuneCountInString(in.Name) > 100 {
		v.Add("name", "ad 1-100 karakter olmalı")
	}
	var allowed []core.Scope
	switch in.OwnerKind {
	case OwnerOperator:
		allowed = operatorKeyScopes
		if in.OwnerID != "" {
			v.Add("owner_id", "operatör anahtarında sahip kimliği olmaz")
		}
	case OwnerEntity:
		allowed = enterpriseKeyScopes
		if strings.TrimSpace(in.OwnerID) == "" {
			v.Add("owner_id", "kuruluş anahtarı için kuruluş gerekli")
		}
	default:
		v.Add("owner_kind", "operator veya entity olmalı")
	}
	// The caller must hold every scope it grants, except an operator admin
	// issuing an entity key (operators never hold enterprise:* themselves).
	needHeld := in.OwnerKind == OwnerOperator || caller.EntityID != ""
	scopes := []core.Scope{}
	if len(in.Scopes) == 0 {
		v.Add("scopes", "en az bir yetki seçin")
	}
	for _, sc := range in.Scopes {
		if inScopes(sc, scopes) {
			continue
		}
		switch {
		case allowed != nil && !inScopes(sc, allowed):
			v.Add("scopes", "bu anahtar türü için izin verilmeyen yetki: "+string(sc))
		case needHeld && !caller.Has(sc):
			v.Add("scopes", "sahip olmadığınız yetkiyi veremezsiniz: "+string(sc))
		}
		scopes = append(scopes, sc)
	}
	if in.RateRPS == 0 {
		in.RateRPS = DefaultRateRPS
	}
	if in.RateRPS < 1 || in.RateRPS > maxRateRPS {
		v.Add("rate_rps", "saniyelik istek sınırı 1-10000 olmalı")
	}
	now := s.now()
	if in.ExpiresAt != nil && !in.ExpiresAt.After(now) {
		v.Add("expires_at", "bitiş zamanı gelecekte olmalı")
	}
	if err := v.Err(); err != nil {
		return core.APIKey{}, "", err
	}
	scopesJSON, _ := json.Marshal(scopes)
	k := core.APIKey{ID: core.NewID(), Name: in.Name, OwnerKind: in.OwnerKind, OwnerID: in.OwnerID,
		Scopes: scopes, RateRPS: in.RateRPS, CreatedAt: now}
	if in.ExpiresAt != nil {
		t := in.ExpiresAt.UTC()
		k.ExpiresAt = &t
	}
	var secret string
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		for attempt := 0; ; attempt++ {
			k.Prefix = randomBase32(keyPrefixLen)
			secret = "enm_" + k.Prefix + "_" + randomBase32(keySecretLen)
			_, err := tx.ExecContext(ctx, `INSERT INTO api_keys (id, prefix, key_hash, name, owner_kind, owner_id, scopes, rate_rps, expires_at, last_used_at, revoked_at, created_by, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`,
				k.ID, k.Prefix, sha256Hex(secret), k.Name, k.OwnerKind, k.OwnerID, string(scopesJSON), k.RateRPS,
				platform.TSPtr(k.ExpiresAt), caller.ID, platform.TS(now))
			if platform.IsUniqueViolation(err) && attempt < 3 {
				continue
			}
			if err != nil {
				return err
			}
			break
		}
		return platform.Audit(ctx, tx, "apikey.create", "apikey", k.ID, map[string]any{
			"name": k.Name, "prefix": k.Prefix, "owner_kind": k.OwnerKind, "owner_id": k.OwnerID,
			"scopes": k.Scopes, "rate_rps": k.RateRPS})
	})
	if err != nil {
		return core.APIKey{}, "", err
	}
	return k, secret, nil
}

// ListAPIKeys returns keys (newest first). ownerKind/ownerID "" = all.
func (s *Service) ListAPIKeys(ctx context.Context, ownerKind, ownerID string) ([]core.APIKey, error) {
	q := `SELECT ` + keyCols + ` FROM api_keys`
	var args []any
	if ownerKind != "" {
		q += ` WHERE owner_kind = ? AND owner_id = ?`
		args = append(args, ownerKind, ownerID)
	}
	rows, err := s.db.QueryContext(ctx, q+` ORDER BY created_at DESC`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.APIKey{}
	for rows.Next() {
		k, err := scanKey(rows, false)
		if err != nil {
			return nil, err
		}
		out = append(out, k.APIKey)
	}
	return out, rows.Err()
}

// RevokeAPIKey revokes a key. When ownerKind is non-empty the key must belong
// to that owner (otherwise ErrNotFound, so other owners' keys are not revealed).
// Revoking an already revoked key is a no-op.
func (s *Service) RevokeAPIKey(ctx context.Context, id, ownerKind, ownerID string) error {
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		k, err := scanKey(tx.QueryRowContext(ctx, `SELECT `+keyCols+` FROM api_keys WHERE id = ?`, id), false)
		if err != nil {
			return platform.NotFound(err, "API anahtarı")
		}
		if ownerKind != "" && (k.OwnerKind != ownerKind || k.OwnerID != ownerID) {
			return core.Errorf(core.ErrNotFound, "API anahtarı")
		}
		if k.RevokedAt != nil {
			return nil
		}
		if _, err := tx.ExecContext(ctx, `UPDATE api_keys SET revoked_at = ? WHERE id = ?`, platform.TS(s.now()), id); err != nil {
			return err
		}
		return platform.Audit(ctx, tx, "apikey.revoke", "apikey", id, map[string]any{"prefix": k.Prefix, "name": k.Name})
	})
	if err != nil {
		return err
	}
	s.mu.Lock()
	delete(s.buckets, id)
	s.mu.Unlock()
	return nil
}

var errBadKey = core.Errorf(core.ErrUnauthorized, "geçersiz API anahtarı")

// parseKey splits enm_<prefix8>_<secret32>.
func parseKey(k string) (prefix string, ok bool) {
	if len(k) != 4+keyPrefixLen+1+keySecretLen || !strings.HasPrefix(k, "enm_") || k[4+keyPrefixLen] != '_' {
		return "", false
	}
	return k[4 : 4+keyPrefixLen], true
}

func (s *Service) apiKeyPrincipal(ctx context.Context, bearer string) (core.Principal, error) {
	prefix, ok := parseKey(bearer)
	if !ok {
		return core.Principal{}, errBadKey
	}
	k, err := scanKey(s.db.QueryRowContext(ctx, `SELECT `+keyCols+`, key_hash FROM api_keys WHERE prefix = ?`, prefix), true)
	if errors.Is(err, sql.ErrNoRows) {
		return core.Principal{}, errBadKey
	}
	if err != nil {
		return core.Principal{}, err
	}
	if subtle.ConstantTimeCompare([]byte(sha256Hex(bearer)), []byte(k.hash)) != 1 {
		return core.Principal{}, errBadKey
	}
	now := s.now()
	if k.RevokedAt != nil || (k.ExpiresAt != nil && !k.ExpiresAt.After(now)) {
		return core.Principal{}, errBadKey
	}
	if !s.allow(k.ID, k.RateRPS, now) {
		return core.Principal{}, core.Errorf(core.ErrRateLimited, "API anahtarı istek sınırı aşıldı")
	}
	if k.LastUsedAt == nil || now.Sub(*k.LastUsedAt) >= lastUsedEvery {
		if _, err := s.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at = ? WHERE id = ?`, platform.TS(now), k.ID); err != nil {
			return core.Principal{}, err
		}
	}
	p := core.Principal{Kind: "apikey", ID: k.ID, Name: k.Name, Scopes: k.Scopes}
	if k.OwnerKind == OwnerEntity {
		p.EntityID = k.OwnerID
	}
	return p, nil
}

// ---------------------------------------------------------------- rate limit

// bucket is a token bucket with capacity = rate (one second of burst).
type bucket struct {
	tokens float64
	last   time.Time
}

func (s *Service) allow(id string, rps int, now time.Time) bool {
	if rps <= 0 {
		rps = DefaultRateRPS
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	b := s.buckets[id]
	if b == nil {
		b = &bucket{tokens: float64(rps), last: now}
		s.buckets[id] = b
	}
	if el := now.Sub(b.last).Seconds(); el > 0 {
		b.tokens += el * float64(rps)
		if b.tokens > float64(rps) {
			b.tokens = float64(rps)
		}
		b.last = now
	}
	if b.tokens < 1 {
		return false
	}
	b.tokens--
	return true
}
