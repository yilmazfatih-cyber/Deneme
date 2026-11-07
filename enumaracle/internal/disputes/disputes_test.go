package disputes

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type fakeDir struct{ owners map[string]string } // tn -> entity id

func (f fakeDir) GetEntity(_ context.Context, id string) (core.Entity, error) {
	return core.Entity{ID: id}, nil
}
func (f fakeDir) NumberOwner(_ context.Context, tn string) (core.Number, core.Entity, error) {
	if e, ok := f.owners[tn]; ok {
		return core.Number{RangeStart: tn, RangeEnd: tn, EntityID: e}, core.Entity{ID: e}, nil
	}
	return core.Number{}, core.Entity{}, core.Errorf(core.ErrNotFound, "number")
}
func (f fakeDir) NumbersOf(context.Context, string) ([]core.Number, error) { return nil, nil }
func (f fakeDir) ApprovedBranding(context.Context, core.Number) (core.Branding, bool, error) {
	return core.Branding{}, false, nil
}

type override struct {
	TN     string
	Label  core.ReputationLabel
	Reason string
	By     string
	Until  time.Time
}

type fakeRep struct {
	calls []override
	err   error
}

func (f *fakeRep) SetOverride(_ context.Context, tn string, l core.ReputationLabel, reason, by string, until time.Time) error {
	if f.err != nil {
		return f.err
	}
	f.calls = append(f.calls, override{tn, l, reason, by, until})
	return nil
}

type fakeNtf struct {
	mu     sync.Mutex
	events []core.Event
}

func (f *fakeNtf) Notify(_ context.Context, e core.Event) error {
	f.mu.Lock()
	f.events = append(f.events, e)
	f.mu.Unlock()
	return nil
}

type env struct {
	t    *testing.T
	s    *Service
	r    *platform.Router
	rep  *fakeRep
	ntf  *fakeNtf
	deps platform.Deps
}

var principals = platform.StaticAuth{
	"ent-a":  {Kind: "apikey", ID: "key-a", EntityID: "ent-a", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
	"ent-b":  {Kind: "apikey", ID: "key-b", EntityID: "ent-b", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
	"admin":  {Kind: "apikey", ID: "admin-1", Role: core.RoleOperatorAdmin, Scopes: []core.Scope{core.ScopeAdmin}},
	"noent":  {Kind: "apikey", ID: "key-x", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
	"reader": {Kind: "apikey", ID: "ent-reader", EntityID: "ent-a", Scopes: []core.Scope{core.ScopeEnterpriseRead}},
}

func newEnv(t *testing.T, withDir bool) *env {
	t.Helper()
	d, err := platform.NewTestDeps(context.Background(), Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.DB.Close() })
	e := &env{t: t, rep: &fakeRep{}, ntf: &fakeNtf{}, deps: d}
	deps := Deps{Base: d, Notifier: e.ntf, Reputation: e.rep}
	if withDir {
		deps.Directory = fakeDir{owners: map[string]string{"+905321112233": "ent-a", "+905321112244": "ent-b"}}
	}
	if e.s, err = New(deps); err != nil {
		t.Fatal(err)
	}
	e.r = platform.NewRouter(slog.New(slog.DiscardHandler), nil)
	e.r.SetAuthenticator(principals)
	e.s.Mount(e.r)
	return e
}

func (e *env) do(method, path, token string, body any) *httptest.ResponseRecorder {
	e.t.Helper()
	var b []byte
	if body != nil {
		b, _ = json.Marshal(body)
	}
	r := httptest.NewRequest(method, path, bytes.NewReader(b))
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	w := httptest.NewRecorder()
	e.r.ServeHTTP(w, r)
	return w
}

func dec[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("%s: %v", w.Body, err)
	}
	return v
}

func (e *env) create(token, tn, kind string) core.Dispute {
	e.t.Helper()
	w := e.do("POST", "/v1/enterprise/disputes", token, map[string]string{"tn": tn, "kind": kind, "title": "Yanlış etiket", "description": "Numaramız spam görünüyor"})
	if w.Code != 201 {
		e.t.Fatalf("create %d %s", w.Code, w.Body)
	}
	return dec[core.Dispute](e.t, w)
}

func TestCanTransition(t *testing.T) {
	O, I, R, X := core.DisputeOpen, core.DisputeInReview, core.DisputeResolved, core.DisputeRejected
	legal := map[[2]core.DisputeStatus]bool{{O, I}: true, {O, R}: true, {O, X}: true, {I, R}: true, {I, X}: true}
	all := []core.DisputeStatus{O, I, R, X}
	for _, a := range all {
		for _, b := range all {
			if CanTransition(a, b) != legal[[2]core.DisputeStatus{a, b}] {
				t.Errorf("%s -> %s", a, b)
			}
		}
	}
}

func TestOwnershipAndCreate(t *testing.T) {
	e := newEnv(t, true)
	d := e.create("ent-a", "0532 111 22 33", "label")
	if d.TN != "+905321112233" || d.EntityID != "ent-a" || d.Status != core.DisputeOpen || d.OpenedBy != "key-a" {
		t.Fatal(d)
	}
	if len(e.ntf.events) != 1 || e.ntf.events[0].Type != core.EventDisputeCreated || e.ntf.events[0].EntityID != "ent-a" {
		t.Fatal(e.ntf.events)
	}
	body := func(tn string) map[string]string {
		return map[string]string{"tn": tn, "kind": "label", "title": "x"}
	}
	// Another entity's number and an unknown number: same 403.
	if w := e.do("POST", "/v1/enterprise/disputes", "ent-a", body("+905321112244")); w.Code != 403 {
		t.Fatal("foreign tn", w.Code)
	}
	if w := e.do("POST", "/v1/enterprise/disputes", "ent-a", body("+905329999999")); w.Code != 403 {
		t.Fatal("unknown tn", w.Code)
	}
	if w := e.do("POST", "/v1/enterprise/disputes", "ent-a", map[string]string{"tn": "abc", "kind": "zzz", "title": ""}); w.Code != 422 {
		t.Fatal("validation", w.Code)
	}
	if w := e.do("POST", "/v1/enterprise/disputes", "noent", body("+905321112233")); w.Code != 403 {
		t.Fatal("no entity", w.Code)
	}
	if w := e.do("POST", "/v1/enterprise/disputes", "reader", body("+905321112233")); w.Code != 403 {
		t.Fatal("read-only scope", w.Code)
	}
	if w := e.do("GET", "/v1/enterprise/disputes", "admin", nil); w.Code != 403 {
		t.Fatal("operator on enterprise route", w.Code)
	}
	// Entity B cannot see or comment on A's dispute.
	if w := e.do("GET", "/v1/enterprise/disputes/"+d.ID, "ent-b", nil); w.Code != 404 {
		t.Fatal("cross-entity get", w.Code)
	}
	if w := e.do("POST", "/v1/enterprise/disputes/"+d.ID+"/comments", "ent-b", map[string]string{"body": "x"}); w.Code != 404 {
		t.Fatal("cross-entity comment", w.Code)
	}
	if l := dec[struct{ Items []core.Dispute }](t, e.do("GET", "/v1/enterprise/disputes", "ent-b", nil)); len(l.Items) != 0 {
		t.Fatal("cross-entity list", l)
	}
	if l := dec[struct{ Items []core.Dispute }](t, e.do("GET", "/v1/enterprise/disputes", "ent-a", nil)); len(l.Items) != 1 {
		t.Fatal("own list", l)
	}
	// Audit row.
	ev, _ := platform.ListAudit(context.Background(), e.deps.DB, "dispute", d.ID, 10)
	if len(ev) != 1 || ev[0].Action != "dispute.create" {
		t.Fatal(ev)
	}
}

func TestNilDirectoryRefuses(t *testing.T) {
	e := newEnv(t, false)
	if w := e.do("POST", "/v1/enterprise/disputes", "ent-a", map[string]string{"tn": "+905321112233", "kind": "label", "title": "x"}); w.Code != 403 {
		t.Fatal(w.Code)
	}
}

func TestInternalCommentVisibility(t *testing.T) {
	e := newEnv(t, true)
	d := e.create("ent-a", "+905321112233", "branding")
	if w := e.do("POST", "/v1/enterprise/disputes/"+d.ID+"/comments", "ent-a", map[string]string{"body": "Belgeler ekte"}); w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	if w := e.do("POST", "/v1/admin/disputes/"+d.ID+"/comments", "admin", map[string]any{"body": "GİZLİ not", "internal": true}); w.Code != 201 {
		t.Fatal(w.Code, w.Body)
	}
	w := e.do("POST", "/v1/admin/disputes/"+d.ID+"/comments", "admin", map[string]any{"body": "İnceliyoruz", "internal": false})
	if c := dec[core.DisputeComment](t, w); c.AuthorRole != core.RoleOperatorAdmin || c.Internal {
		t.Fatal(c)
	}
	ent := e.do("GET", "/v1/enterprise/disputes/"+d.ID, "ent-a", nil)
	if strings.Contains(ent.Body.String(), "GİZLİ") || len(dec[detail](t, ent).Comments) != 2 {
		t.Fatal("enterprise sees internal", ent.Body)
	}
	if adm := dec[detail](t, e.do("GET", "/v1/admin/disputes/"+d.ID, "admin", nil)); len(adm.Comments) != 3 {
		t.Fatal("admin comments", adm.Comments)
	}
	// Internal notes produce no event (events can reach the entity's webhooks).
	for _, ev := range e.ntf.events {
		b, _ := json.Marshal(ev)
		if strings.Contains(string(b), "GİZLİ") {
			t.Fatal("internal note leaked via event")
		}
	}
	// Enterprise cannot forge internal flag (unknown field -> 422 via DisallowUnknownFields).
	if w := e.do("POST", "/v1/enterprise/disputes/"+d.ID+"/comments", "ent-a", map[string]any{"body": "x", "internal": true}); w.Code != 422 {
		t.Fatal("enterprise internal", w.Code)
	}
}

func TestStateMachineAndClearLabel(t *testing.T) {
	e := newEnv(t, true)
	d := e.create("ent-a", "+905321112233", "label")
	st := func(id string, body map[string]any) *httptest.ResponseRecorder {
		return e.do("POST", "/v1/admin/disputes/"+id+"/status", "admin", body)
	}
	if w := st(d.ID, map[string]any{"status": "open"}); w.Code != 422 {
		t.Fatal("to open", w.Code)
	}
	if w := st(d.ID, map[string]any{"status": "in_review"}); w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	if w := st(d.ID, map[string]any{"status": "in_review"}); w.Code != 409 {
		t.Fatal("in_review twice", w.Code)
	}
	// clear_label on reject is invalid; no override applied.
	if w := st(d.ID, map[string]any{"status": "rejected", "clear_label": true}); w.Code != 422 || len(e.rep.calls) != 0 {
		t.Fatal("clear on reject", w.Code)
	}
	// Failing reputation service leaves the dispute untouched.
	e.rep.err = errors.New("boom")
	if w := st(d.ID, map[string]any{"status": "resolved", "clear_label": true}); w.Code != 500 {
		t.Fatal("rep failure", w.Code)
	}
	e.rep.err = nil
	before := time.Now()
	w := st(d.ID, map[string]any{"status": "resolved", "resolution": "Kurum doğrulandı", "clear_label": true})
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body)
	}
	got := dec[core.Dispute](t, w)
	if got.Status != core.DisputeResolved || got.ResolvedBy != "admin-1" || got.ResolvedAt == nil || got.Resolution != "Kurum doğrulandı" {
		t.Fatal(got)
	}
	if len(e.rep.calls) != 1 {
		t.Fatal(e.rep.calls)
	}
	c := e.rep.calls[0]
	if c.TN != "+905321112233" || c.Label != core.LabelClean || c.Reason != "Kurum doğrulandı" || c.By != "admin-1" ||
		c.Until.Before(before.Add(ClearLabelFor-time.Minute)) || c.Until.After(time.Now().Add(ClearLabelFor+time.Minute)) {
		t.Fatal(c)
	}
	// Terminal: every further transition and enterprise comments -> 409.
	for _, s := range []string{"in_review", "resolved", "rejected"} {
		if w := st(d.ID, map[string]any{"status": s}); w.Code != 409 {
			t.Fatal("terminal", s, w.Code)
		}
	}
	if w := e.do("POST", "/v1/enterprise/disputes/"+d.ID+"/comments", "ent-a", map[string]string{"body": "x"}); w.Code != 409 {
		t.Fatal("comment on closed", w.Code)
	}
	// Events: created + in_review + resolved.
	var updated int
	for _, ev := range e.ntf.events {
		if ev.Type == core.EventDisputeUpdated {
			updated++
		}
	}
	if updated != 2 {
		t.Fatal("updated events", updated)
	}

	// open -> rejected directly; clear_label on a non-label dispute is invalid.
	d2 := e.create("ent-a", "+905321112233", "branding")
	if w := st(d2.ID, map[string]any{"status": "resolved", "clear_label": true}); w.Code != 422 {
		t.Fatal("clear on branding", w.Code)
	}
	if w := st(d2.ID, map[string]any{"status": "rejected", "resolution": "Gerekçe yok"}); w.Code != 200 {
		t.Fatal(w.Code)
	}
	d3 := e.create("ent-a", "+905321112233", "other")
	if w := st(d3.ID, map[string]any{"status": "resolved"}); w.Code != 200 {
		t.Fatal("open->resolved", w.Code)
	}
	if w := st("missing", map[string]any{"status": "resolved"}); w.Code != 404 {
		t.Fatal("missing", w.Code)
	}

	// Admin filter.
	l := dec[struct{ Items []core.Dispute }](t, e.do("GET", "/v1/admin/disputes?status=rejected", "admin", nil))
	if len(l.Items) != 1 || l.Items[0].ID != d2.ID {
		t.Fatal(l)
	}
	if w := e.do("GET", "/v1/admin/disputes?status=bogus", "admin", nil); w.Code != 422 {
		t.Fatal(w.Code)
	}
	if w := e.do("GET", "/v1/admin/disputes", "ent-a", nil); w.Code != 403 {
		t.Fatal("enterprise on admin", w.Code)
	}
	ev, _ := platform.ListAudit(context.Background(), e.deps.DB, "dispute", d.ID, 10)
	if len(ev) < 3 {
		t.Fatal("audit", ev)
	}
}

func TestNilReputation(t *testing.T) {
	d, _ := platform.NewTestDeps(context.Background(), Migrations)
	defer d.DB.Close()
	s, _ := New(Deps{Base: d, Directory: fakeDir{owners: map[string]string{"+905321112233": "ent-a"}}})
	ctx := core.WithPrincipal(context.Background(), principals["ent-a"])
	dp, err := s.Create(ctx, "ent-a", NewDispute{TN: "+905321112233", Kind: "label", Title: "t"})
	if err != nil {
		t.Fatal(err)
	}
	actx := core.WithPrincipal(context.Background(), principals["admin"])
	if _, err := s.SetStatus(actx, dp.ID, StatusChange{Status: core.DisputeResolved, ClearLabel: true}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	if got, err := s.SetStatus(actx, dp.ID, StatusChange{Status: core.DisputeResolved}); err != nil || got.Status != core.DisputeResolved {
		t.Fatal(got, err)
	}
}
