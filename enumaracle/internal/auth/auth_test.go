package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time          { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Advance(d time.Duration) { c.mu.Lock(); c.t = c.t.Add(d); c.mu.Unlock() }

type env struct {
	t     *testing.T
	s     *Service
	r     *platform.Router
	clock *fakeClock
	deps  platform.Deps
}

func newEnv(t *testing.T) *env {
	t.Helper()
	ctx := context.Background()
	d, err := platform.NewTestDeps(ctx, Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.DB.Close() })
	clk := &fakeClock{t: time.Date(2026, 3, 1, 10, 0, 0, 0, time.UTC)}
	d.Clock = clk.Now
	s, err := New(Deps{Base: d})
	if err != nil {
		t.Fatal(err)
	}
	r := platform.NewRouter(slog.New(slog.DiscardHandler), nil)
	r.SetAuthenticator(s)
	s.Mount(r)
	return &env{t: t, s: s, r: r, clock: clk, deps: d}
}

type req struct {
	method, path string
	body         any
	cookie       string
	csrf         string
	bearer       string
	ip           string
}

func (e *env) do(q req) *httptest.ResponseRecorder {
	e.t.Helper()
	var b []byte
	if q.body != nil {
		b, _ = json.Marshal(q.body)
	}
	hr := httptest.NewRequest(q.method, q.path, bytes.NewReader(b))
	if q.ip != "" {
		hr.RemoteAddr = q.ip + ":1234"
	}
	if q.cookie != "" {
		hr.AddCookie(&http.Cookie{Name: platform.SessionCookie, Value: q.cookie})
	}
	if q.csrf != "" {
		hr.Header.Set(platform.CSRFHeader, q.csrf)
	}
	if q.bearer != "" {
		hr.Header.Set("Authorization", "Bearer "+q.bearer)
	}
	w := httptest.NewRecorder()
	e.r.ServeHTTP(w, hr)
	return w
}

func (e *env) user(email, pw string, role core.Role, entity string) core.User {
	e.t.Helper()
	u, err := e.s.CreateUser(context.Background(), core.NewUser{Email: email, Name: "Test Kişi", Password: pw, Role: role, EntityID: entity})
	if err != nil {
		e.t.Fatal(err)
	}
	return u
}

// login returns (cookie, csrf).
func (e *env) login(email, pw string) (string, string) {
	e.t.Helper()
	w := e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": email, "password": pw}})
	if w.Code != 200 {
		e.t.Fatalf("login %d %s", w.Code, w.Body)
	}
	var out struct {
		CSRF string `json:"csrf_token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	for _, c := range w.Result().Cookies() {
		if c.Name == platform.SessionCookie {
			return c.Value, out.CSRF
		}
	}
	e.t.Fatal("no cookie")
	return "", ""
}

func decode[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("decode %s: %v", w.Body, err)
	}
	return v
}

// ---------------------------------------------------------------- password

func TestPasswordHashVerify(t *testing.T) {
	h, err := HashPassword("doğru-parola-123", DefaultArgon2)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$m=19456,t=2,p=1$") || strings.Count(h, "$") != 5 {
		t.Fatalf("encoding %q", h)
	}
	p, salt, key, err := DecodeHash(h)
	if err != nil || p.Memory != 19456 || p.Time != 2 || p.Threads != 1 || len(salt) != 16 || len(key) != 32 {
		t.Fatal(p, len(salt), len(key), err)
	}
	if !VerifyPassword("doğru-parola-123", h) || VerifyPassword("yanlış-parola-123", h) {
		t.Fatal("verify")
	}
	h2, _ := HashPassword("doğru-parola-123", DefaultArgon2)
	if h2 == h {
		t.Fatal("salt must be random")
	}
	// Parameters are read from the hash, not from the current defaults.
	low := Argon2Params{Memory: 1024, Time: 1, Threads: 1, SaltLen: 16, KeyLen: 32}
	h3, _ := HashPassword("pw-1234567890", low)
	if !strings.Contains(h3, "m=1024,t=1,p=1") || !VerifyPassword("pw-1234567890", h3) {
		t.Fatal("custom params")
	}
	for _, bad := range []string{"", "$argon2i$v=19$m=1024,t=1,p=1$c2FsdHNhbHQ$a2V5a2V5a2V5a2V5a2V5", strings.Replace(h, "m=19456", "m=99999999", 1), h[:len(h)-10] + "!!!"} {
		if VerifyPassword("doğru-parola-123", bad) {
			t.Fatalf("accepted %q", bad)
		}
	}
}

// ---------------------------------------------------------------- users

func TestCreateUserValidation(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	e.user("Ali@Example.com", "uzun-parola-1", core.RoleOperatorAnalyst, "")
	_, err := e.s.CreateUser(ctx, core.NewUser{Email: " ali@example.COM ", Name: "X", Password: "uzun-parola-1", Role: core.RoleOperatorAnalyst})
	if !errors.Is(err, core.ErrConflict) {
		t.Fatal("dup email", err)
	}
	_, err = e.s.CreateUser(ctx, core.NewUser{Email: "b@example.com", Name: "X", Password: "kısa", Role: core.RoleOperatorAnalyst})
	var ve *core.ValidationError
	if !errors.As(err, &ve) || ve.Fields[0].Field != "password" {
		t.Fatal("short password", err)
	}
	_, err = e.s.CreateUser(ctx, core.NewUser{Email: "c@example.com", Name: "X", Password: "uzun-parola-1", Role: core.RoleEnterpriseOwner})
	if !errors.Is(err, core.ErrInvalid) {
		t.Fatal("enterprise without entity", err)
	}
	_, err = e.s.CreateUser(ctx, core.NewUser{Email: "d@example.com", Name: "X", Password: "uzun-parola-1", Role: "root"})
	if !errors.Is(err, core.ErrInvalid) {
		t.Fatal("bad role", err)
	}
}

func TestBootstrapIdempotent(t *testing.T) {
	e := newEnv(t)
	ctx := context.Background()
	if err := e.s.Bootstrap(ctx); err != nil {
		t.Fatal(err)
	}
	if err := e.s.Bootstrap(ctx); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = e.deps.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM users WHERE role = 'operator_admin'`).Scan(&n)
	if n != 1 {
		t.Fatal("admins", n)
	}
	e.login("admin@test.local", "Admin-Pass-123")

	// Generated password: logged once at WARN and usable.
	e2 := newEnv(t)
	var buf bytes.Buffer
	e2.s.base.Log = slog.New(slog.NewJSONHandler(&buf, nil))
	e2.s.base.Cfg.AdminPassword = ""
	if err := e2.s.Bootstrap(ctx); err != nil {
		t.Fatal(err)
	}
	_ = e2.s.Bootstrap(ctx)
	if strings.Count(buf.String(), `"level":"WARN"`) != 1 {
		t.Fatalf("expected one WARN line: %s", buf.String())
	}
	var line struct{ Password string }
	_ = json.Unmarshal(bytes.TrimSpace(buf.Bytes()), &line)
	if len(line.Password) < 20 {
		t.Fatal("password not logged")
	}
	e2.login("admin@test.local", line.Password)
}

// ---------------------------------------------------------------- login / sessions

func TestLoginSessionCSRFLogout(t *testing.T) {
	e := newEnv(t)
	u := e.user("op@example.com", "uzun-parola-1", core.RoleOperatorAdmin, "")

	w := e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": "OP@example.com", "password": "uzun-parola-1"}})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	var ck *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == platform.SessionCookie {
			ck = c
		}
	}
	if ck == nil || !ck.HttpOnly || ck.SameSite != http.SameSiteLaxMode || ck.Path != "/" || ck.Secure || ck.MaxAge != 12*3600 {
		t.Fatalf("cookie %+v", ck)
	}
	lr := decode[loginResp](t, w)
	if lr.User.ID != u.ID || lr.CSRFToken == "" || lr.User.LastLoginAt == nil {
		t.Fatal(lr)
	}
	// The raw token is never stored.
	var n int
	_ = e.deps.DB.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM sessions WHERE token_hash = ? OR csrf_token = ?`, ck.Value, ck.Value).Scan(&n)
	if n != 0 {
		t.Fatal("raw token stored")
	}

	me := e.do(req{method: "GET", path: "/auth/me", cookie: ck.Value})
	if me.Code != 200 {
		t.Fatal(me.Code, me.Body)
	}
	mr := decode[struct {
		User   core.User    `json:"user"`
		CSRF   string       `json:"csrf_token"`
		Scopes []core.Scope `json:"scopes"`
	}](t, me)
	if mr.User.Email != "op@example.com" || mr.CSRF != lr.CSRFToken || len(mr.Scopes) != 4 {
		t.Fatal(mr)
	}

	// Scope enforcement + CSRF on unsafe methods.
	if w := e.do(req{method: "GET", path: "/v1/admin/users", cookie: ck.Value}); w.Code != 200 {
		t.Fatal("list users", w.Code)
	}
	body := map[string]any{"email": "new@example.com", "name": "Yeni", "password": "uzun-parola-2", "role": "operator_analyst"}
	if w := e.do(req{method: "POST", path: "/v1/admin/users", cookie: ck.Value, body: body}); w.Code != 403 {
		t.Fatal("missing csrf must be 403", w.Code)
	}
	if w := e.do(req{method: "POST", path: "/v1/admin/users", cookie: ck.Value, csrf: "wrong", body: body}); w.Code != 403 {
		t.Fatal("wrong csrf must be 403", w.Code)
	}
	if w := e.do(req{method: "POST", path: "/v1/admin/users", cookie: ck.Value, csrf: lr.CSRFToken, body: body}); w.Code != 201 {
		t.Fatal("create user", w.Code, w.Body)
	}

	// Logout invalidates the session server-side.
	if w := e.do(req{method: "POST", path: "/auth/logout", cookie: ck.Value, csrf: lr.CSRFToken}); w.Code != 204 {
		t.Fatal("logout", w.Code)
	}
	if w := e.do(req{method: "GET", path: "/auth/me", cookie: ck.Value}); w.Code != 401 {
		t.Fatal("me after logout", w.Code)
	}
	if w := e.do(req{method: "GET", path: "/v1/admin/users", cookie: ck.Value}); w.Code != 401 {
		t.Fatal("stale cookie on protected route", w.Code)
	}
	// A stale cookie does not block a new login.
	if w := e.do(req{method: "POST", path: "/auth/login", cookie: ck.Value, body: map[string]string{"email": "op@example.com", "password": "uzun-parola-1"}}); w.Code != 200 {
		t.Fatal("login with stale cookie", w.Code, w.Body)
	}
}

func TestSessionFixationAndExpiry(t *testing.T) {
	e := newEnv(t)
	e.user("ent@example.com", "uzun-parola-1", core.RoleEnterpriseOwner, "ent-1")
	c1, csrf1 := e.login("ent@example.com", "uzun-parola-1")
	// Logging in again while holding c1 issues a new token and kills c1.
	w := e.do(req{method: "POST", path: "/auth/login", cookie: c1, csrf: csrf1, body: map[string]string{"email": "ent@example.com", "password": "uzun-parola-1"}})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	c2 := w.Result().Cookies()[0].Value
	if c2 == c1 {
		t.Fatal("token must rotate")
	}
	if w := e.do(req{method: "GET", path: "/auth/me", cookie: c1}); w.Code != 401 {
		t.Fatal("old session alive", w.Code)
	}
	me := e.do(req{method: "GET", path: "/auth/me", cookie: c2})
	if me.Code != 200 || !strings.Contains(me.Body.String(), `"entity_id":"ent-1"`) {
		t.Fatal(me.Code, me.Body)
	}
	// Sliding last_seen, absolute 12 h expiry.
	e.clock.Advance(11 * time.Hour)
	if w := e.do(req{method: "GET", path: "/auth/me", cookie: c2}); w.Code != 200 {
		t.Fatal("before expiry", w.Code)
	}
	var seen string
	_ = e.deps.DB.QueryRowContext(context.Background(), `SELECT last_seen_at FROM sessions`).Scan(&seen)
	if !platform.ParseTS(seen).Equal(e.clock.Now()) {
		t.Fatal("last_seen not updated", seen)
	}
	e.clock.Advance(time.Hour)
	if w := e.do(req{method: "GET", path: "/auth/me", cookie: c2}); w.Code != 401 {
		t.Fatal("after 12h", w.Code)
	}
}

func TestLoginFailureAndThrottle(t *testing.T) {
	e := newEnv(t)
	e.user("op@example.com", "uzun-parola-1", core.RoleOperatorAnalyst, "")
	bad := e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": "op@example.com", "password": "yanlis-parola"}})
	unknown := e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": "nobody@example.com", "password": "yanlis-parola"}})
	if bad.Code != 401 || unknown.Code != 401 {
		t.Fatal(bad.Code, unknown.Code)
	}
	detail := func(w *httptest.ResponseRecorder) string { return decode[platform.Problem](t, w).Detail }
	if detail(bad) != detail(unknown) {
		t.Fatalf("user enumeration: %q vs %q", detail(bad), detail(unknown))
	}
	// 4 more failures from the same IP -> locked, even with the right password.
	for i := 0; i < 4; i++ {
		e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": "op@example.com", "password": "yanlis-parola"}})
	}
	ok := map[string]string{"email": "op@example.com", "password": "uzun-parola-1"}
	if w := e.do(req{method: "POST", path: "/auth/login", body: ok}); w.Code != 429 {
		t.Fatal("throttle", w.Code)
	}
	// Other IP is unaffected.
	if w := e.do(req{method: "POST", path: "/auth/login", body: ok, ip: "198.51.100.7"}); w.Code != 200 {
		t.Fatal("other ip", w.Code)
	}
	e.clock.Advance(15*time.Minute + time.Second)
	if w := e.do(req{method: "POST", path: "/auth/login", body: ok}); w.Code != 200 {
		t.Fatal("after window", w.Code, w.Body)
	}
	// Audit rows for success and failure.
	ev, _ := platform.ListAudit(context.Background(), e.deps.DB, "", "", 100)
	var succ, fail int
	for _, a := range ev {
		switch a.Action {
		case "auth.login_success":
			succ++
		case "auth.login_failure":
			fail++
		}
	}
	if succ != 2 || fail < 6 {
		t.Fatal(succ, fail)
	}
}

func TestInactiveUser(t *testing.T) {
	e := newEnv(t)
	e.user("admin@example.com", "uzun-parola-1", core.RoleOperatorAdmin, "")
	u := e.user("ent@example.com", "uzun-parola-1", core.RoleEnterpriseUser, "ent-1")
	ac, acsrf := e.login("admin@example.com", "uzun-parola-1")
	uc, _ := e.login("ent@example.com", "uzun-parola-1")
	w := e.do(req{method: "POST", path: "/v1/admin/users/" + u.ID + "/active", cookie: ac, csrf: acsrf, body: map[string]bool{"active": false}})
	if w.Code != 200 || decode[core.User](t, w).Active {
		t.Fatal(w.Code, w.Body)
	}
	if w := e.do(req{method: "GET", path: "/auth/me", cookie: uc}); w.Code != 401 {
		t.Fatal("deactivated session", w.Code)
	}
	if w := e.do(req{method: "POST", path: "/auth/login", body: map[string]string{"email": "ent@example.com", "password": "uzun-parola-1"}}); w.Code != 401 {
		t.Fatal("inactive login", w.Code)
	}
	// Cannot deactivate oneself.
	admin := decode[struct {
		User core.User `json:"user"`
	}](t, e.do(req{method: "GET", path: "/auth/me", cookie: ac}))
	if w := e.do(req{method: "POST", path: "/v1/admin/users/" + admin.User.ID + "/active", cookie: ac, csrf: acsrf, body: map[string]bool{"active": false}}); w.Code != 409 {
		t.Fatal("self deactivate", w.Code)
	}
}

// ---------------------------------------------------------------- api keys

func TestAPIKeys(t *testing.T) {
	e := newEnv(t)
	e.user("admin@example.com", "uzun-parola-1", core.RoleOperatorAdmin, "")
	ac, acsrf := e.login("admin@example.com", "uzun-parola-1")

	w := e.do(req{method: "POST", path: "/v1/admin/apikeys", cookie: ac, csrf: acsrf,
		body: map[string]any{"name": "Taşıyıcı SBC", "owner_kind": "operator", "scopes": []string{"carrier:read"}, "rate_rps": 2}})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	kr := decode[keyResp](t, w)
	if len(kr.Secret) != 45 || !strings.HasPrefix(kr.Secret, "enm_"+kr.APIKey.Prefix+"_") || kr.APIKey.RateRPS != 2 {
		t.Fatal(kr)
	}
	var stored int
	_ = e.deps.DB.QueryRowContext(context.Background(), `SELECT COUNT(*) FROM api_keys WHERE key_hash = ?`, sha256Hex(kr.Secret)).Scan(&stored)
	if stored != 1 || strings.Contains(e.do(req{method: "GET", path: "/v1/admin/apikeys", cookie: ac}).Body.String(), kr.Secret) {
		t.Fatal("secret storage")
	}

	// Auth with the key; scopes enforced; CSRF not required for bearer.
	if w := e.do(req{method: "GET", path: "/v1/admin/apikeys", bearer: kr.Secret}); w.Code != 403 {
		t.Fatal("carrier key on admin route", w.Code)
	}
	p, err := e.s.Authenticate(context.Background(), "", kr.Secret)
	if err != nil || p.Kind != "apikey" || p.ID != kr.APIKey.ID || !p.Has(core.ScopeCarrierRead) || p.EntityID != "" {
		t.Fatal(p, err)
	}
	// Rate limit: bucket of 2 already spent 2 (request + Authenticate) -> 429.
	if w := e.do(req{method: "GET", path: "/v1/admin/apikeys", bearer: kr.Secret}); w.Code != 429 {
		t.Fatal("rate limit", w.Code)
	}
	e.clock.Advance(time.Second)
	if _, err := e.s.Authenticate(context.Background(), "", kr.Secret); err != nil {
		t.Fatal("refill", err)
	}
	var lastUsed string
	_ = e.deps.DB.QueryRowContext(context.Background(), `SELECT last_used_at FROM api_keys WHERE id = ?`, kr.APIKey.ID).Scan(&lastUsed)
	if lastUsed == "" {
		t.Fatal("last_used_at")
	}

	// Tampered secret / unknown / malformed -> 401.
	for _, b := range []string{kr.Secret[:len(kr.Secret)-1] + "a", "enm_aaaaaaaa_" + strings.Repeat("b", 32), "garbage"} {
		if b == kr.Secret {
			continue
		}
		if _, err := e.s.Authenticate(context.Background(), "", b); !errors.Is(err, core.ErrUnauthorized) {
			t.Fatal(b, err)
		}
	}

	// Revoke -> 401.
	if w := e.do(req{method: "DELETE", path: "/v1/admin/apikeys/" + kr.APIKey.ID, cookie: ac, csrf: acsrf}); w.Code != 204 {
		t.Fatal("revoke", w.Code)
	}
	if _, err := e.s.Authenticate(context.Background(), "", kr.Secret); !errors.Is(err, core.ErrUnauthorized) {
		t.Fatal("revoked key accepted", err)
	}

	// Expiry -> 401.
	exp := e.clock.Now().Add(time.Hour)
	w = e.do(req{method: "POST", path: "/v1/admin/apikeys", cookie: ac, csrf: acsrf,
		body: map[string]any{"name": "Geçici", "owner_kind": "operator", "scopes": []string{"admin:read"}, "expires_at": exp}})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	tmp := decode[keyResp](t, w)
	if w := e.do(req{method: "GET", path: "/v1/admin/audit", bearer: tmp.Secret}); w.Code != 200 || !strings.Contains(w.Body.String(), "apikey.create") {
		t.Fatal("admin:read key", w.Code)
	}
	e.clock.Advance(time.Hour)
	if w := e.do(req{method: "GET", path: "/v1/admin/audit", bearer: tmp.Secret}); w.Code != 401 {
		t.Fatal("expired key", w.Code)
	}

	// Operator keys cannot carry enterprise scopes; entity keys only enterprise scopes.
	for _, b := range []map[string]any{
		{"name": "x", "owner_kind": "operator", "scopes": []string{"enterprise:read"}},
		{"name": "x", "owner_kind": "entity", "owner_id": "ent-1", "scopes": []string{"admin"}},
		{"name": "x", "owner_kind": "entity", "scopes": []string{"enterprise:read"}},
		{"name": "x", "owner_kind": "operator", "scopes": []string{}},
	} {
		if w := e.do(req{method: "POST", path: "/v1/admin/apikeys", cookie: ac, csrf: acsrf, body: b}); w.Code != 422 {
			t.Fatal(b, w.Code)
		}
	}
	// Admin-issued entity key -> principal carries the entity id.
	w = e.do(req{method: "POST", path: "/v1/admin/apikeys", cookie: ac, csrf: acsrf,
		body: map[string]any{"name": "Kurum", "owner_kind": "entity", "owner_id": "ent-9", "scopes": []string{"enterprise:read"}}})
	ek := decode[keyResp](t, w)
	if p, err := e.s.Authenticate(context.Background(), "", ek.Secret); err != nil || p.EntityID != "ent-9" {
		t.Fatal(p, err)
	}
}

func TestEnterpriseKeys(t *testing.T) {
	e := newEnv(t)
	e.user("owner@a.com", "uzun-parola-1", core.RoleEnterpriseOwner, "ent-a")
	e.user("owner@b.com", "uzun-parola-1", core.RoleEnterpriseOwner, "ent-b")
	ca, csrfA := e.login("owner@a.com", "uzun-parola-1")
	cb, csrfB := e.login("owner@b.com", "uzun-parola-1")

	for _, sc := range [][]string{{"admin"}, {"admin:read"}, {"carrier:read"}, {"enterprise:read", "carrier:write"}} {
		if w := e.do(req{method: "POST", path: "/v1/enterprise/apikeys", cookie: ca, csrf: csrfA, body: map[string]any{"name": "x", "scopes": sc}}); w.Code != 422 {
			t.Fatal(sc, w.Code, w.Body)
		}
	}
	w := e.do(req{method: "POST", path: "/v1/enterprise/apikeys", cookie: ca, csrf: csrfA, body: map[string]any{"name": "CRM", "scopes": []string{"enterprise:read", "enterprise:write"}}})
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	k := decode[keyResp](t, w)
	if k.APIKey.OwnerKind != "entity" || k.APIKey.OwnerID != "ent-a" || k.APIKey.RateRPS != DefaultRateRPS {
		t.Fatal(k.APIKey)
	}
	// The key works on enterprise routes and lists only its own entity's keys.
	if w := e.do(req{method: "GET", path: "/v1/enterprise/apikeys", bearer: k.Secret}); w.Code != 200 || !strings.Contains(w.Body.String(), k.APIKey.ID) {
		t.Fatal(w.Code, w.Body)
	}
	if w := e.do(req{method: "GET", path: "/v1/enterprise/apikeys", cookie: cb}); strings.Contains(w.Body.String(), k.APIKey.ID) {
		t.Fatal("cross-entity listing")
	}
	// Other entity cannot revoke it; enterprise cannot use admin routes.
	if w := e.do(req{method: "DELETE", path: "/v1/enterprise/apikeys/" + k.APIKey.ID, cookie: cb, csrf: csrfB}); w.Code != 404 {
		t.Fatal("cross-entity revoke", w.Code)
	}
	if w := e.do(req{method: "GET", path: "/v1/admin/apikeys", cookie: ca}); w.Code != 403 {
		t.Fatal("enterprise on admin route", w.Code)
	}
	if w := e.do(req{method: "DELETE", path: "/v1/enterprise/apikeys/" + k.APIKey.ID, cookie: ca, csrf: csrfA}); w.Code != 204 {
		t.Fatal("own revoke", w.Code)
	}
	if w := e.do(req{method: "GET", path: "/v1/enterprise/apikeys", bearer: k.Secret}); w.Code != 401 {
		t.Fatal("revoked", w.Code)
	}
}
