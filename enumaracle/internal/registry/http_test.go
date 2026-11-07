package registry

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type httpEnv struct {
	*env
	srv  *httptest.Server
	ent1 core.Entity
	ent2 core.Entity
}

func newHTTPEnv(t *testing.T) *httpEnv {
	t.Helper()
	e := newEnv(t)
	ent1 := e.entity(t, core.EntityVerified)
	ent2 := e.entity(t, core.EntityPending)
	r := platform.NewRouter(e.svc.log, nil)
	r.SetAuthenticator(platform.StaticAuth{
		"admin":   {Kind: "apikey", ID: "k-admin", Scopes: core.RoleScopes[core.RoleOperatorAdmin]},
		"analyst": {Kind: "apikey", ID: "k-analyst", Scopes: core.RoleScopes[core.RoleOperatorAnalyst]},
		"carrier": {Kind: "apikey", ID: "k-carrier", Scopes: []core.Scope{core.ScopeCarrierRead}},
		"ent1":    {Kind: "apikey", ID: "k-ent1", EntityID: ent1.ID, Scopes: core.RoleScopes[core.RoleEnterpriseOwner]},
		"ent1ro":  {Kind: "apikey", ID: "k-ent1ro", EntityID: ent1.ID, Scopes: core.RoleScopes[core.RoleEnterpriseUser]},
		"ent2":    {Kind: "apikey", ID: "k-ent2", EntityID: ent2.ID, Scopes: core.RoleScopes[core.RoleEnterpriseOwner]},
		// An operator key that was (wrongly) granted enterprise scopes but has no entity.
		"opent": {Kind: "apikey", ID: "k-opent", Scopes: append([]core.Scope{core.ScopeAdminRead}, core.RoleScopes[core.RoleEnterpriseOwner]...)},
		// Enterprise scopes without an entity id.
		"noent": {Kind: "apikey", ID: "k-noent", Scopes: core.RoleScopes[core.RoleEnterpriseOwner]},
	})
	e.svc.Mount(r)
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return &httpEnv{env: e, srv: srv, ent1: ent1, ent2: ent2}
}

func (h *httpEnv) do(t *testing.T, token, method, path string, body any, out any) int {
	t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, h.srv.URL+path, rd)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if out != nil && res.StatusCode < 300 && len(raw) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			t.Fatalf("%s %s: %v: %s", method, path, err, raw)
		}
	}
	if res.StatusCode >= 400 {
		if ct := res.Header.Get("Content-Type"); ct != "application/problem+json; charset=utf-8" {
			t.Errorf("%s %s: content type %q", method, path, ct)
		}
	}
	return res.StatusCode
}

func TestHTTPScopes(t *testing.T) {
	h := newHTTPEnv(t)
	cases := []struct {
		token, method, path string
		body                any
		want                int
	}{
		{"", "GET", "/v1/enterprise/entity", nil, 401},
		{"", "GET", "/v1/admin/entities", nil, 401},
		{"", "GET", "/v1/carrier/lookup/+908500000000", nil, 401},
		{"ent1", "GET", "/v1/enterprise/entity", nil, 200},
		{"ent1", "GET", "/v1/admin/entities", nil, 403},
		{"ent1", "GET", "/v1/admin/stats", nil, 403},
		{"ent1", "GET", "/v1/carrier/lookup/+908500000000", nil, 403},
		{"ent1ro", "POST", "/v1/enterprise/numbers", map[string]any{"tn": "08501234567", "use_case": "delivery"}, 403},
		{"admin", "GET", "/v1/enterprise/entity", nil, 403}, // operators have no enterprise scope
		{"opent", "GET", "/v1/enterprise/numbers", nil, 403},
		{"noent", "GET", "/v1/enterprise/numbers", nil, 403},
		{"noent", "POST", "/v1/enterprise/branding", map[string]any{"display_name": "X"}, 403},
		{"analyst", "GET", "/v1/admin/entities", nil, 200},
		{"analyst", "GET", "/v1/admin/stats", nil, 200},
		{"analyst", "POST", "/v1/admin/entities/" + h.ent2.ID + "/decision", map[string]any{"to_status": "in_review"}, 403},
		{"carrier", "GET", "/v1/carrier/lookup/+908500000000", nil, 200},
		{"carrier", "GET", "/v1/admin/numbers", nil, 403},
		{"admin", "GET", "/v1/carrier/lookup/0850%20000%2000%2000", nil, 200},
		{"admin", "GET", "/v1/carrier/lookup/abc", nil, 422},
		{"admin", "GET", "/v1/admin/entities?status=bogus", nil, 422},
		{"admin", "GET", "/v1/admin/entities/nope", nil, 404},
	}
	for _, c := range cases {
		if got := h.do(t, c.token, c.method, c.path, c.body, nil); got != c.want {
			t.Errorf("%s %s %s: %d, want %d", c.token, c.method, c.path, got, c.want)
		}
	}
}

func TestHTTPEnterpriseIsolation(t *testing.T) {
	h := newHTTPEnv(t)
	var n1 core.Number
	if c := h.do(t, "ent1", "POST", "/v1/enterprise/numbers", map[string]any{"tn": "0850 222 04 44", "use_case": "customer_service"}, &n1); c != 201 {
		t.Fatal(c)
	}
	if n1.RangeStart != "+908502220444" || n1.EntityID != h.ent1.ID || n1.Status != core.NumberPending {
		t.Fatalf("%+v", n1)
	}
	var n2 core.Number
	if c := h.do(t, "ent2", "POST", "/v1/enterprise/numbers", map[string]any{"range_start": "02123350000", "range_end": "02123350099", "use_case": "delivery"}, &n2); c != 201 {
		t.Fatal(c)
	}
	// Overlap with another entity's number → 409.
	if c := h.do(t, "ent1", "POST", "/v1/enterprise/numbers", map[string]any{"tn": "0212 335 00 10", "use_case": "delivery"}, nil); c != 409 {
		t.Fatal(c)
	}
	// Range > 10 000 → 422.
	if c := h.do(t, "ent1", "POST", "/v1/enterprise/numbers", map[string]any{"range_start": "03120000000", "range_end": "03120099999", "use_case": "delivery"}, nil); c != 422 {
		t.Fatal(c)
	}

	var list items[core.Number]
	h.do(t, "ent1", "GET", "/v1/enterprise/numbers", nil, &list)
	if len(list.Items) != 1 || list.Items[0].ID != n1.ID {
		t.Fatalf("ent1 sees %+v", list.Items)
	}
	h.do(t, "ent2", "GET", "/v1/enterprise/numbers", nil, &list)
	if len(list.Items) != 1 || list.Items[0].ID != n2.ID {
		t.Fatalf("ent2 sees %+v", list.Items)
	}
	// ent2 cannot touch ent1's number.
	if c := h.do(t, "ent2", "PUT", "/v1/enterprise/numbers/"+n1.ID, map[string]any{"use_case": "marketing", "call_reason": "x"}, nil); c != 404 {
		t.Fatal(c)
	}
	if c := h.do(t, "ent2", "DELETE", "/v1/enterprise/numbers/"+n1.ID, nil, nil); c != 404 {
		t.Fatal(c)
	}
	// Own update works.
	var upd core.Number
	if c := h.do(t, "ent1", "PUT", "/v1/enterprise/numbers/"+n1.ID, map[string]any{"use_case": "delivery", "call_reason": "Kargonuz yola çıktı"}, &upd); c != 200 || upd.CallReason != "Kargonuz yola çıktı" {
		t.Fatal(c, upd)
	}
	// Branding of another entity cannot be attached or edited.
	var b2 core.Branding
	if c := h.do(t, "ent2", "POST", "/v1/enterprise/branding", map[string]any{"display_name": "Pazarsepeti", "is_default": true}, &b2); c != 201 || b2.Status != core.BrandingPending {
		t.Fatal(c, b2)
	}
	if c := h.do(t, "ent1", "PUT", "/v1/enterprise/numbers/"+n1.ID, map[string]any{"use_case": "delivery", "call_reason": "", "branding_id": b2.ID}, nil); c != 422 {
		t.Fatal(c)
	}
	if c := h.do(t, "ent1", "PUT", "/v1/enterprise/branding/"+b2.ID, map[string]any{"display_name": "Ele geçirildi", "is_default": true}, nil); c != 404 {
		t.Fatal(c)
	}
	var bl items[core.Branding]
	h.do(t, "ent1", "GET", "/v1/enterprise/branding", nil, &bl)
	if len(bl.Items) != 0 {
		t.Fatal("ent1 sees foreign branding")
	}
	// Unknown fields are rejected.
	if c := h.do(t, "ent1", "POST", "/v1/enterprise/numbers", map[string]any{"tn": "08501111111", "use_case": "delivery", "entity_id": h.ent2.ID}, nil); c != 422 {
		t.Fatal(c)
	}
	// Release → 204, then the number is released.
	if c := h.do(t, "ent1", "DELETE", "/v1/enterprise/numbers/"+n1.ID, nil, nil); c != 204 {
		t.Fatal(c)
	}
	h.do(t, "ent1", "GET", "/v1/enterprise/numbers", nil, &list)
	if list.Items[0].Status != core.NumberReleased {
		t.Fatal(list.Items[0].Status)
	}
}

func TestHTTPWorkflow(t *testing.T) {
	h := newHTTPEnv(t)

	// Public signup.
	var su SignupResult
	body := map[string]any{"legal_name": "Yeni Lojistik A.Ş.", "trade_name": "Yeni Lojistik", "vkn": nextVKN(),
		"sector": "Lojistik", "city": "Kocaeli", "contact_name": "Ali Veli", "contact_email": "ali@yeni.example",
		"contact_phone": "+90 262 111 22 33", "password": "uzun-bir-parola"}
	if c := h.do(t, "", "POST", "/v1/signup", body, &su); c != 201 || su.Entity.Status != core.EntityPending || su.User.EntityID != su.Entity.ID {
		t.Fatal(c, su)
	}
	if c := h.do(t, "", "POST", "/v1/signup", body, nil); c != 409 {
		t.Fatal("duplicate signup", c)
	}
	good := nextVKN()
	body["vkn"] = good[:9] + string('0'+(good[9]-'0'+1)%10) // wrong check digit
	body["contact_email"] = "baska@yeni.example"
	if c := h.do(t, "", "POST", "/v1/signup", body, nil); c != 422 {
		t.Fatal("bad vkn", c)
	}

	// Enterprise ent2 (pending): documents, edit, submit.
	var doc core.EntityDocument
	if c := h.do(t, "ent2", "POST", "/v1/enterprise/entity/documents", map[string]any{"kind": "tax_certificate",
		"file_name": "vergi.pdf", "mime_type": "application/pdf", "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", "size_bytes": 2048}, &doc); c != 201 {
		t.Fatal(c)
	}
	in := entityInput(h.ent2.VKN)
	in.TradeName = "Güncel Ad"
	var ent core.Entity
	if c := h.do(t, "ent2", "PUT", "/v1/enterprise/entity", in, &ent); c != 200 || ent.TradeName != "Güncel Ad" {
		t.Fatal(c, ent)
	}
	if c := h.do(t, "ent2", "POST", "/v1/enterprise/entity/submit", nil, &ent); c != 200 || ent.Status != core.EntityInReview || ent.SubmittedAt == nil {
		t.Fatal(c, ent)
	}
	if c := h.do(t, "ent2", "POST", "/v1/enterprise/entity/submit", nil, nil); c != 409 {
		t.Fatal("double submit", c)
	}
	if c := h.do(t, "ent2", "PUT", "/v1/enterprise/entity", in, nil); c != 409 {
		t.Fatal("edit in review", c)
	}

	// Admin: list, detail, decide.
	var el itemsTotal[core.Entity]
	h.do(t, "admin", "GET", "/v1/admin/entities?status=in_review", nil, &el)
	if el.Total != 1 || el.Items[0].ID != h.ent2.ID {
		t.Fatal(el)
	}
	h.do(t, "admin", "GET", "/v1/admin/entities?q=g%C3%BCncel", nil, &el)
	if el.Total != 1 {
		t.Fatal("search", el.Total)
	}
	if c := h.do(t, "admin", "POST", "/v1/admin/entities/"+h.ent2.ID+"/decision", map[string]any{"to_status": "suspended", "note": "x"}, nil); c != 409 {
		t.Fatal(c)
	}
	if c := h.do(t, "admin", "POST", "/v1/admin/entities/"+h.ent2.ID+"/decision", map[string]any{"to_status": "verified", "note": "Belgeler tamam", "risk_tier": "low"}, &ent); c != 200 || ent.Status != core.EntityVerified || ent.VettedBy != "k-admin" {
		t.Fatal(c, ent)
	}
	var created core.Entity
	if c := h.do(t, "admin", "POST", "/v1/admin/entities", entityInput(nextVKN()), &created); c != 201 || created.Status != core.EntityPending {
		t.Fatal(c)
	}

	// Number + branding lifecycle through the admin API, observed via lookup.
	var n core.Number
	h.do(t, "ent2", "POST", "/v1/enterprise/numbers", map[string]any{"tn": "+90 850 333 00 00", "use_case": "delivery"}, &n)
	var b core.Branding
	h.do(t, "ent2", "POST", "/v1/enterprise/branding", map[string]any{"display_name": "Hızlıyol Kargo", "call_reason": "Kargonuz yola çıktı",
		"logo_url": "https://cdn.example/logo.png", "is_default": true}, &b)
	var lr core.LookupResult
	h.do(t, "carrier", "GET", "/v1/carrier/lookup/08503330000", nil, &lr)
	if !lr.Found || lr.Verified || lr.Attest != core.AttestC {
		t.Fatal(lr)
	}
	if c := h.do(t, "admin", "POST", "/v1/admin/numbers/"+n.ID+"/status", map[string]any{"status": "active", "carrier_confirmed": true}, &n); c != 200 || n.Status != core.NumberActive {
		t.Fatal(c, n)
	}
	var bl items[core.Branding]
	h.do(t, "admin", "GET", "/v1/admin/branding?status=pending_review", nil, &bl)
	if len(bl.Items) != 1 {
		t.Fatal(bl)
	}
	if c := h.do(t, "admin", "POST", "/v1/admin/branding/"+b.ID+"/review", map[string]any{"status": "approved", "note": ""}, &b); c != 200 || b.Status != core.BrandingApproved {
		t.Fatal(c, b)
	}
	var batch items[core.LookupResult]
	if c := h.do(t, "carrier", "POST", "/v1/carrier/lookup", map[string]any{"tns": []string{"+908503330000", "+905000000000"}}, &batch); c != 200 || len(batch.Items) != 2 {
		t.Fatal(c, batch)
	}
	got := batch.Items[0]
	if !got.Verified || got.Attest != core.AttestA || got.DisplayName != "Hızlıyol Kargo" || got.CallReason != "Kargonuz yola çıktı" || got.LogoURL == "" {
		t.Fatalf("%+v", got)
	}
	if batch.Items[1].Found || batch.Items[1].Attest != "" {
		t.Fatalf("%+v", batch.Items[1])
	}
	tooMany := make([]string, 101)
	for i := range tooMany {
		tooMany[i] = "+908503330000"
	}
	if c := h.do(t, "carrier", "POST", "/v1/carrier/lookup", map[string]any{"tns": tooMany}, nil); c != 422 {
		t.Fatal(c)
	}

	// Admin detail, number list and stats.
	var det EntityDetail
	if c := h.do(t, "analyst", "GET", "/v1/admin/entities/"+h.ent2.ID, nil, &det); c != 200 {
		t.Fatal(c)
	}
	if len(det.Documents) != 1 || len(det.Decisions) != 2 || len(det.Numbers) != 1 || len(det.Branding) != 1 {
		t.Fatalf("%+v", det)
	}
	var nl itemsTotal[core.Number]
	h.do(t, "admin", "GET", "/v1/admin/numbers?status=active&entity_id="+h.ent2.ID, nil, &nl)
	if nl.Total != 1 {
		t.Fatal(nl)
	}
	var st Stats
	h.do(t, "admin", "GET", "/v1/admin/stats", nil, &st)
	if st.Entities["verified"] != 2 || st.Entities["pending"] != 2 || st.Numbers["active"] != 1 || st.Branding["approved"] != 1 {
		t.Fatalf("%+v", st)
	}
	if h.notif.count(core.EventNumberStatusChanged) != 1 || h.notif.count(core.EventBrandingReviewed) != 1 {
		t.Fatal("events")
	}
	// Every state change is audited.
	for _, kind := range []string{"entity", "number", "branding"} {
		if ev, _ := platform.ListAudit(h.ctx, h.svc.db, kind, "", 100); len(ev) == 0 {
			t.Errorf("no audit rows for %s", kind)
		}
	}
}
