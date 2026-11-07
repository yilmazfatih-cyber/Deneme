package reputation

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

func newRouter(env *testEnv) *platform.Router {
	r := platform.NewRouter(platform.NewLogger("error"), nil)
	r.SetAuthenticator(platform.StaticAuth{
		"carrier":   {Kind: "apikey", ID: "k-carrier", Name: "Taşıyıcı A", Scopes: []core.Scope{core.ScopeCarrierRead, core.ScopeCarrierWrite}},
		"carrierro": {Kind: "apikey", ID: "k-ro", Scopes: []core.Scope{core.ScopeCarrierRead}},
		"ent1":      {Kind: "apikey", ID: "k-e1", EntityID: "e1", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
		"ent2":      {Kind: "apikey", ID: "k-e2", EntityID: "e2", Scopes: []core.Scope{core.ScopeEnterpriseRead}},
		"noent":     {Kind: "apikey", ID: "k-x", Scopes: []core.Scope{core.ScopeEnterpriseRead}},
		"admin":     {Kind: "apikey", ID: "k-admin", Scopes: []core.Scope{core.ScopeAdmin}},
		"analyst":   {Kind: "apikey", ID: "k-an", Scopes: []core.Scope{core.ScopeAdminRead, core.ScopeCarrierRead}},
	})
	env.svc.Mount(r)
	return r
}

func call(r http.Handler, method, path, token, ctype, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func eventsJSON(rows []EventInput) string {
	b, _ := json.Marshal(map[string]any{"events": rows})
	return string(b)
}

func TestHTTPScopes(t *testing.T) {
	env := newEnv(t)
	r := newRouter(env)
	ev := eventsJSON(genRows(tnBank, pattern{n: 30, hours: 24, answerRate: 0.8}, t0))
	if _, err := env.svc.IngestEvents(context.Background(), "x", genRows(tnShop, pattern{n: 5, hours: 5}, t0)); err != nil {
		t.Fatal(err)
	}
	if _, err := env.svc.IngestEvents(context.Background(), "x", genRows(tnRange1, pattern{n: 5, hours: 5}, t0)); err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		method, path, token, ctype, body string
		want                             int
	}{
		{"POST", "/v1/carrier/events", "", "application/json", ev, 401},
		{"POST", "/v1/carrier/events", "ent1", "application/json", ev, 403},
		{"POST", "/v1/carrier/events", "carrierro", "application/json", ev, 403},
		{"POST", "/v1/carrier/events", "admin", "application/json", ev, 403},
		{"POST", "/v1/carrier/events", "carrier", "application/json", ev, 200},
		{"POST", "/v1/carrier/events", "carrier", "application/json", `{"events":[],"x":1}`, 422},
		{"POST", "/v1/carrier/labels", "carrier", "", `{"tn":"08501112233","kind":"complaint","reason":"ısrarlı"}`, 201},
		{"POST", "/v1/carrier/labels", "carrier", "", `{"tn":"08501112233","kind":"x"}`, 422},
		{"POST", "/v1/carrier/labels", "analyst", "", `{"tn":"08501112233","kind":"block"}`, 403},
		{"POST", "/v1/admin/reputation/recompute", "analyst", "", "", 403},
		{"POST", "/v1/admin/reputation/recompute", "admin", "", "", 200},
		{"GET", "/v1/carrier/reputation/+908501112233", "carrierro", "", "", 200},
		{"GET", "/v1/carrier/reputation/08501112233", "analyst", "", "", 200},
		{"GET", "/v1/carrier/reputation/+908509999999", "carrier", "", "", 404},
		{"GET", "/v1/carrier/reputation/abc", "carrier", "", "", 422},
		{"GET", "/v1/carrier/reputation/+908501112233", "ent1", "", "", 403},
		{"GET", "/v1/enterprise/reputation/+908501112233", "ent1", "", "", 200},
		{"GET", "/v1/enterprise/reputation/+908501112233", "ent2", "", "", 403},
		{"GET", "/v1/enterprise/reputation/+908501112233", "noent", "", "", 403},
		{"GET", "/v1/enterprise/reputation/+908501112233", "admin", "", "", 403},
		{"GET", "/v1/enterprise/reputation/+902125550199", "ent1", "", "", 404},
		{"GET", "/v1/enterprise/reputation", "noent", "", "", 403},
		{"GET", "/v1/enterprise/reputation", "carrier", "", "", 403},
		{"GET", "/v1/admin/reputation", "analyst", "", "", 200},
		{"GET", "/v1/admin/reputation?label=bogus", "analyst", "", "", 422},
		{"GET", "/v1/admin/reputation", "ent1", "", "", 403},
		{"GET", "/v1/admin/reputation/+908501112233", "analyst", "", "", 200},
		{"GET", "/v1/admin/reputation/+908509999999", "analyst", "", "", 404},
		{"GET", "/v1/admin/reputation-stats", "analyst", "", "", 200},
		{"POST", "/v1/admin/reputation/+908501112233/override", "analyst", "", `{"label":"spam","reason":"x","until":"2026-11-10T00:00:00Z"}`, 403},
		{"POST", "/v1/admin/reputation/+908501112233/override", "admin", "", `{"label":"spam","reason":"x","until":"yarın"}`, 422},
		{"POST", "/v1/admin/reputation/+908501112233/override", "admin", "", `{"label":"spam","reason":"dolandırıcılık","until":"2026-11-10T00:00:00Z"}`, 200},
		{"DELETE", "/v1/admin/reputation/+908501112233/override", "analyst", "", "", 403},
		{"DELETE", "/v1/admin/reputation/+908501112233/override", "admin", "", "", 200},
		{"DELETE", "/v1/admin/reputation/+908509999999/override", "admin", "", "", 404},
	}
	for _, c := range cases {
		w := call(r, c.method, c.path, c.token, c.ctype, c.body)
		if w.Code != c.want {
			t.Errorf("%s %s as %q: got %d want %d: %s", c.method, c.path, c.token, w.Code, c.want, w.Body)
		}
	}
	ev2, _ := platform.ListAudit(context.Background(), env.svc.db, "number", tnBank, 10)
	if len(ev2) != 2 || ev2[0].ActorID != "k-admin" {
		t.Fatalf("override audit %+v", ev2)
	}
}

func TestHTTPEventsResponseAndCSV(t *testing.T) {
	env := newEnv(t)
	r := newRouter(env)
	csvBody := "orig_tn,dest_tn,started_at,disposition,duration_sec,verstat\n" +
		"+908501112233,+905321234567,2026-11-07T10:00:00Z,answered,65,TN-Validation-Passed\n" +
		"+908501112233,+905321234567,2026-11-07T10:00:00Z,teleported,65,\n"
	w := call(r, "POST", "/v1/carrier/events", "carrier", "text/csv; charset=utf-8", csvBody)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	var res IngestResult
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatal(err)
	}
	if res.Accepted != 1 || res.Rejected != 1 || res.Errors[0].Index != 1 || !strings.Contains(res.Errors[0].Message, "sonuç (disposition)") {
		t.Fatalf("%+v", res)
	}
	var src string
	_ = env.svc.db.QueryRowContext(context.Background(), `SELECT source_id FROM call_events`).Scan(&src)
	if src != "k-carrier" {
		t.Fatalf("source id = principal id, got %q", src)
	}
	w = call(r, "POST", "/v1/carrier/labels", "carrier", "", `{"tn":"08501112233","kind":"label","label":"spam","confidence":0.8}`)
	var fb core.LabelFeedback
	_ = json.Unmarshal(w.Body.Bytes(), &fb)
	if w.Code != 201 || fb.SourceID != "k-carrier" || fb.SourceName != "Taşıyıcı A" || fb.Label != core.LabelSpam || fb.TN != tnBank {
		t.Fatalf("%d %+v", w.Code, fb)
	}
	// JSON problem for bad rows still returns 200 with an empty errors array when all is fine
	w = call(r, "POST", "/v1/carrier/events", "carrier", "application/json",
		eventsJSON(genRows(tnBank, pattern{n: 2, hours: 1}, t0)))
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"errors":[]`) {
		t.Fatal(w.Code, w.Body)
	}
}

func TestHTTPEnterpriseIsolation(t *testing.T) {
	env := newEnv(t)
	r := newRouter(env)
	ctx := context.Background()
	for _, tn := range []string{tnBank, tnRange0, tnRange1, tnShop, tnSpam} {
		mustIngest(t, env.svc, genRows(tn, pattern{n: 25, hours: 24, answerRate: 0.7}, t0))
	}
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	list := func(token string) []core.Score {
		w := call(r, "GET", "/v1/enterprise/reputation", token, "", "")
		if w.Code != 200 {
			t.Fatal(w.Code, w.Body)
		}
		var body struct{ Items []core.Score }
		if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
			t.Fatal(err)
		}
		return body.Items
	}
	got := map[string]int{}
	for _, s := range list("ent1") {
		got[s.TN] = s.Score
	}
	if len(got) != 3 || got[tnBank] == 0 || got[tnRange0] == 0 || got[tnRange1] == 0 {
		t.Fatalf("e1 must see its single number and range members with data only: %v", got)
	}
	items := list("ent2")
	if len(items) != 1 || items[0].TN != tnShop {
		t.Fatalf("e2: %+v", items)
	}
	// e2 cannot read e1's range member or unregistered numbers
	for _, tn := range []string{tnRange1, tnSpam} {
		if w := call(r, "GET", "/v1/enterprise/reputation/"+tn, "ent2", "", ""); w.Code != 403 {
			t.Errorf("%s: %d", tn, w.Code)
		}
	}
	if w := call(r, "GET", "/v1/enterprise/reputation/"+tnRange1, "ent1", "", ""); w.Code != 200 {
		t.Errorf("own range member: %d %s", w.Code, w.Body)
	}
	// a single number without data is listed as unknown
	env.dir.nums = append(env.dir.nums, core.Number{ID: "n5", EntityID: "e2", RangeStart: "+903125551111", RangeEnd: "+903125551111", Status: core.NumberActive})
	items = list("ent2")
	if len(items) != 2 || items[1].Score != -1 || items[1].Label != core.LabelUnknown {
		t.Fatalf("placeholder: %+v", items)
	}
}

func TestHTTPAdminDetail(t *testing.T) {
	env := newEnv(t)
	r := newRouter(env)
	ctx := context.Background()
	mustIngest(t, env.svc, genRows(tnSpam, pattern{n: 48, hours: 48, answerRate: 0.5, shortRate: 0.5}, t0))
	if _, err := env.svc.AddFeedback(ctx, "c", "C", FeedbackInput{TN: tnSpam, Kind: "complaint"}); err != nil {
		t.Fatal(err)
	}
	if _, err := env.svc.Recompute(ctx); err != nil {
		t.Fatal(err)
	}
	w := call(r, "GET", "/v1/admin/reputation/"+tnSpam, "analyst", "", "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	var body struct {
		Score    core.Score
		Feedback []core.LabelFeedback
		Daily    []DailyStat
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Score.TN != tnSpam || len(body.Feedback) != 1 || len(body.Daily) != 14 {
		t.Fatalf("%+v", body)
	}
	var calls, complaints int64
	for _, d := range body.Daily {
		calls += d.Calls
		complaints += d.Complaints
	}
	if calls != 48 || complaints != 1 || body.Daily[13].Day != "2026-11-07" {
		t.Fatalf("daily %+v", body.Daily)
	}
	w = call(r, "GET", "/v1/admin/reputation-stats", "analyst", "", "")
	var st Stats
	_ = json.Unmarshal(w.Body.Bytes(), &st)
	if st.Events24h != 24 || st.Feedback7d != 1 || len(st.Labels) != 4 {
		t.Fatalf("%+v", st)
	}
	w = call(r, "POST", "/v1/admin/reputation/"+tnSpam+"/override", "admin", "",
		`{"label":"spam","reason":"dolandırıcılık","until":"`+t0.Add(time.Hour).Format(time.RFC3339)+`"}`)
	var sc core.Score
	_ = json.Unmarshal(w.Body.Bytes(), &sc)
	if w.Code != 200 || sc.Label != core.LabelSpam || sc.OverrideLabel != core.LabelSpam {
		t.Fatalf("%d %+v", w.Code, sc)
	}
	w = call(r, "GET", "/v1/admin/reputation?label=spam", "analyst", "", "")
	if !strings.Contains(w.Body.String(), tnSpam) {
		t.Fatal(w.Body)
	}
}
