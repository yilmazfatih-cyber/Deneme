package notify

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

func newRouter(t *testing.T) (*Service, *platform.Router) {
	t.Helper()
	s, _, _ := newTest(t)
	r := platform.NewRouter(platform.NewLogger("error"), nil)
	r.SetAuthenticator(platform.StaticAuth{
		"admin":   {Kind: "apikey", ID: "k-admin", Scopes: []core.Scope{core.ScopeAdmin}},
		"analyst": {Kind: "apikey", ID: "k-analyst", Scopes: []core.Scope{core.ScopeAdminRead, core.ScopeCarrierRead}},
		"carrier": {Kind: "apikey", ID: "k-carrier", Scopes: []core.Scope{core.ScopeCarrierRead, core.ScopeCarrierWrite}},
		"ent1":    {Kind: "apikey", ID: "k-e1", EntityID: "e1", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
		"ent1ro":  {Kind: "apikey", ID: "k-e1ro", EntityID: "e1", Scopes: []core.Scope{core.ScopeEnterpriseRead}},
		"ent2":    {Kind: "apikey", ID: "k-e2", EntityID: "e2", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
		"noent":   {Kind: "apikey", ID: "k-x", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
	})
	s.Mount(r)
	return s, r
}

func do(r http.Handler, method, path, bearer, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestHTTPScopesAndOwnership(t *testing.T) {
	s, r := newRouter(t)
	body := `{"url":"https://hooks.ornek.com.tr/enm","events":["number.status_changed"]}`

	w := do(r, "POST", "/v1/enterprise/webhooks", "ent1", body)
	if w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	var created struct {
		Webhook Webhook `json:"webhook"`
		Secret  string  `json:"secret"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil || created.Secret == "" ||
		created.Webhook.EntityID != "e1" || created.Webhook.OwnerKind != OwnerEntity {
		t.Fatal(w.Body, err)
	}
	id := created.Webhook.ID

	w = do(r, "POST", "/v1/admin/webhooks", "admin", `{"url":"https://ops.example.com/h","events":[]}`)
	if w.Code != 201 || !strings.Contains(w.Body.String(), `"owner_kind":"operator"`) {
		t.Fatal(w.Code, w.Body)
	}

	cases := []struct {
		method, path, bearer, body string
		want                       int
	}{
		{"GET", "/v1/enterprise/webhooks", "", "", 401},
		{"GET", "/v1/enterprise/webhooks", "carrier", "", 403},
		{"GET", "/v1/enterprise/webhooks", "admin", "", 403},
		{"GET", "/v1/enterprise/webhooks", "noent", "", 403},
		{"POST", "/v1/enterprise/webhooks", "noent", body, 403},
		{"POST", "/v1/enterprise/webhooks", "ent1ro", body, 403},
		{"POST", "/v1/enterprise/webhooks", "ent1", `{"url":"http://example.com/h"}`, 422},
		{"POST", "/v1/enterprise/webhooks", "ent1", `{"url":"https://10.0.0.1/h"}`, 422},
		{"POST", "/v1/enterprise/webhooks", "ent1", `{"url":"https://x.example.com","events":["nope"]}`, 422},
		{"POST", "/v1/enterprise/webhooks", "ent1", `{"url":"https://x.example.com","secret":"mine"}`, 422},
		{"GET", "/v1/enterprise/webhooks/" + id + "/deliveries", "ent2", "", 404},
		{"GET", "/v1/enterprise/webhooks/" + id + "/deliveries", "ent1ro", "", 200},
		{"DELETE", "/v1/enterprise/webhooks/" + id, "ent2", "", 404},
		{"DELETE", "/v1/enterprise/webhooks/" + id, "ent1ro", "", 403},
		{"GET", "/v1/admin/webhooks", "ent1", "", 403},
		{"GET", "/v1/admin/webhooks", "carrier", "", 403},
		{"GET", "/v1/admin/webhooks", "analyst", "", 200},
		{"POST", "/v1/admin/webhooks", "analyst", `{"url":"https://ops.example.com/h"}`, 403},
		{"DELETE", "/v1/admin/webhooks/" + id, "analyst", "", 403},
		{"GET", "/v1/admin/outbox", "analyst", "", 200},
		{"GET", "/v1/admin/outbox", "ent1", "", 403},
		{"GET", "/v1/admin/outbox", "", "", 401},
	}
	for _, c := range cases {
		if w := do(r, c.method, c.path, c.bearer, c.body); w.Code != c.want {
			t.Errorf("%s %s as %q: got %d want %d: %s", c.method, c.path, c.bearer, w.Code, c.want, w.Body)
		}
	}

	// Secrets never appear in listings.
	for _, c := range []struct{ path, bearer string }{{"/v1/enterprise/webhooks", "ent1"}, {"/v1/admin/webhooks", "admin"}} {
		w := do(r, "GET", c.path, c.bearer, "")
		if w.Code != 200 || strings.Contains(w.Body.String(), "secret") || strings.Contains(w.Body.String(), created.Secret) {
			t.Fatalf("%s leaks secret: %s", c.path, w.Body)
		}
	}
	var list struct{ Items []Webhook }
	w = do(r, "GET", "/v1/enterprise/webhooks", "ent2", "")
	if json.Unmarshal(w.Body.Bytes(), &list); len(list.Items) != 0 {
		t.Fatal("entity 2 sees entity 1 webhooks", w.Body)
	}
	w = do(r, "GET", "/v1/admin/webhooks", "admin", "")
	if json.Unmarshal(w.Body.Bytes(), &list); len(list.Items) != 2 {
		t.Fatal(w.Body)
	}

	// Deliveries are listed for the owner.
	if err := s.Notify(context.Background(), core.Event{Type: core.EventNumberStatusChanged, EntityID: "e1"}); err != nil {
		t.Fatal(err)
	}
	w = do(r, "GET", "/v1/enterprise/webhooks/"+id+"/deliveries", "ent1", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"pending"`) {
		t.Fatal(w.Body)
	}

	// Owner deletes; then it is gone. Audit rows were written.
	if w := do(r, "DELETE", "/v1/enterprise/webhooks/"+id, "ent1", ""); w.Code != 204 {
		t.Fatal(w.Code, w.Body)
	}
	if w := do(r, "DELETE", "/v1/enterprise/webhooks/"+id, "ent1", ""); w.Code != 404 {
		t.Fatal(w.Code)
	}
	ev, err := platform.ListAudit(context.Background(), s.base.DB, "webhook", "", 10)
	if err != nil || len(ev) != 3 {
		t.Fatal(ev, err)
	}
	for _, e := range ev {
		if strings.Contains(e.Detail, created.Secret) {
			t.Fatal("secret in audit log")
		}
	}

	// The stored secret is sealed, not plaintext.
	var sealed string
	_ = s.base.DB.QueryRowContext(context.Background(), `SELECT secret_sealed FROM notify_webhooks WHERE id = ?`, id).Scan(&sealed)
	if sealed == "" || strings.Contains(sealed, created.Secret) {
		t.Fatal("secret not sealed")
	}
}

func TestHTTPOutbox(t *testing.T) {
	s, r := newRouter(t)
	s.SetEmails(func(context.Context, string) (string, error) { return "a@b.com.tr", nil })
	_ = s.Notify(context.Background(), core.Event{Type: core.EventBrandingReviewed, EntityID: "e1"})
	w := do(r, "GET", "/v1/admin/outbox", "admin", "")
	var out struct {
		Items []map[string]any `json:"items"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil || len(out.Items) != 1 {
		t.Fatal(w.Body, err)
	}
	for _, k := range []string{"id", "to", "subject", "body", "created_at"} {
		if _, ok := out.Items[0][k]; !ok {
			t.Errorf("missing %s", k)
		}
	}
	if out.Items[0]["subject"] != "[Enumaracle] Marka görünümü incelemesi tamamlandı" {
		t.Fatal(out.Items[0]["subject"])
	}
}
