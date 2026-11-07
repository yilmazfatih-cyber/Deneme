package platform

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

func TestRebind(t *testing.T) {
	got := rebind("postgres", "SELECT * FROM t WHERE a = ? AND b = '?' AND c = ?")
	if got != "SELECT * FROM t WHERE a = $1 AND b = '?' AND c = $2" {
		t.Fatal(got)
	}
	if rebind("sqlite", "a = ?") != "a = ?" {
		t.Fatal("sqlite must not rebind")
	}
}

func TestMigrateAndAudit(t *testing.T) {
	ctx := context.Background()
	extra := fstest.MapFS{"migrations/0900_x.sql": {Data: []byte("CREATE TABLE x (id TEXT PRIMARY KEY);\nINSERT INTO x (id) VALUES ('a');\n")}}
	d, err := NewTestDeps(ctx, extra)
	if err != nil {
		t.Fatal(err)
	}
	if err := d.DB.Migrate(ctx, extra); err != nil { // idempotent
		t.Fatal(err)
	}
	var n int
	if err := d.DB.QueryRowContext(ctx, `SELECT COUNT(*) FROM x`).Scan(&n); err != nil || n != 1 {
		t.Fatal(n, err)
	}
	actx := core.WithPrincipal(ctx, core.Principal{Kind: "user", ID: "u1"})
	if err := Audit(actx, d.DB, "entity.verify", "entity", "e1", map[string]string{"note": "ok"}); err != nil {
		t.Fatal(err)
	}
	ev, err := ListAudit(ctx, d.DB, "entity", "", 10)
	if err != nil || len(ev) != 1 || ev[0].ActorID != "u1" {
		t.Fatal(ev, err)
	}
}

func TestSealer(t *testing.T) {
	s, _ := NewSealer(make([]byte, 32))
	c, _ := s.Seal([]byte("secret"), "k1")
	if p, err := s.Open(c, "k1"); err != nil || string(p) != "secret" {
		t.Fatal(err)
	}
	if _, err := s.Open(c, "k2"); err == nil {
		t.Fatal("aad must bind")
	}
}

func TestRouterAuthScopesCSRF(t *testing.T) {
	r := NewRouter(NewLogger("error"), nil)
	r.SetAuthenticator(StaticAuth{
		"adm": {Kind: "apikey", ID: "k", Scopes: []core.Scope{core.ScopeAdmin}},
		"usr": {Kind: "user", ID: "u", Scopes: []core.Scope{core.ScopeAdmin}, CSRF: "tok"},
	})
	r.Handle("POST", "/v1/admin/x/{id}", core.ScopeAdmin, func(w http.ResponseWriter, req *http.Request) error {
		return WriteJSON(w, 200, map[string]string{"id": req.PathValue("id")})
	})
	r.Handle("GET", "/v1/public", "", func(w http.ResponseWriter, req *http.Request) error {
		return core.Invalid("tn", "bad")
	})
	do := func(method, path, bearer, csrf string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader("{}"))
		if bearer != "" {
			req.Header.Set("Authorization", "Bearer "+bearer)
		}
		if csrf != "" {
			req.Header.Set(CSRFHeader, csrf)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	cases := []struct {
		method, path, bearer, csrf string
		want                       int
	}{
		{"POST", "/v1/admin/x/1", "", "", 401},
		{"POST", "/v1/admin/x/1", "bad", "", 401},
		{"POST", "/v1/admin/x/1", "adm", "", 200},
		{"POST", "/v1/admin/x/1", "usr", "", 403},
		{"POST", "/v1/admin/x/1", "usr", "tok", 200},
		{"GET", "/v1/public", "", "", 422},
	}
	for _, c := range cases {
		if w := do(c.method, c.path, c.bearer, c.csrf); w.Code != c.want {
			t.Errorf("%s %s bearer=%s: got %d want %d: %s", c.method, c.path, c.bearer, w.Code, c.want, w.Body)
		}
	}
}
