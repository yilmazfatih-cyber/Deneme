package pki

import (
	"context"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/passport"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// ---- fakes

type fakeDir struct {
	ents  map[string]core.Entity
	nums  []core.Number
	brand map[string]core.Branding // entity id -> approved default branding
}

func (f *fakeDir) GetEntity(_ context.Context, id string) (core.Entity, error) {
	e, ok := f.ents[id]
	if !ok {
		return e, core.Errorf(core.ErrNotFound, "entity")
	}
	return e, nil
}

func (f *fakeDir) NumberOwner(_ context.Context, tn string) (core.Number, core.Entity, error) {
	for _, n := range f.nums {
		if n.Status != core.NumberReleased && n.Contains(tn) {
			return n, f.ents[n.EntityID], nil
		}
	}
	return core.Number{}, core.Entity{}, core.Errorf(core.ErrNotFound, "number")
}

func (f *fakeDir) NumbersOf(_ context.Context, id string) ([]core.Number, error) {
	var out []core.Number
	for _, n := range f.nums {
		if n.EntityID == id && n.Status != core.NumberReleased {
			out = append(out, n)
		}
	}
	return out, nil
}

func (f *fakeDir) ApprovedBranding(_ context.Context, n core.Number) (core.Branding, bool, error) {
	b, ok := f.brand[n.EntityID]
	return b, ok, nil
}

type fakeLookup struct{ d *fakeDir }

func (l fakeLookup) Lookup(ctx context.Context, tn string) (core.LookupResult, error) {
	r := core.LookupResult{TN: tn, Score: -1, Label: core.LabelUnknown}
	n, e, err := l.d.NumberOwner(ctx, tn)
	if err != nil {
		return r, nil
	}
	r.Found, r.EntityID, r.EntityName, r.NumberStatus = true, e.ID, e.TradeName, n.Status
	r.Verified = e.Status == core.EntityVerified && n.Status == core.NumberActive
	switch {
	case r.Verified && n.CarrierConfirmed:
		r.Attest = core.AttestA
	case r.Verified:
		r.Attest = core.AttestB
	default:
		r.Attest = core.AttestC
	}
	if b, ok, _ := l.d.ApprovedBranding(ctx, n); ok && r.Verified {
		r.DisplayName, r.LogoURL, r.CallReason = b.DisplayName, b.LogoURL, b.CallReason
	}
	return r, nil
}

type recNotifier struct{ events []core.Event }

func (r *recNotifier) Notify(_ context.Context, e core.Event) error {
	r.events = append(r.events, e)
	return nil
}

// ---- fixture

const (
	entOK      = "ent-verified"
	entPending = "ent-pending"
	tnBranded  = "+905321234567"
	tnRangeIn  = "+902125550042"
	tnPending  = "+905329999999"
	tnOther    = "+905551112233"
)

type fixture struct {
	svc    *Service
	dir    *fakeDir
	notif  *recNotifier
	offset time.Duration
	base   platform.Deps
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	base, err := platform.NewTestDeps(ctx, Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { base.DB.Close() })
	f := &fixture{notif: &recNotifier{}}
	start := time.Now().UTC()
	base.Clock = func() time.Time { return start.Add(f.offset) }
	f.base = base
	f.dir = &fakeDir{
		ents: map[string]core.Entity{
			entOK:      {ID: entOK, LegalName: "Acme Lojistik A.Ş.", TradeName: "Acme Kargo", Status: core.EntityVerified},
			entPending: {ID: entPending, LegalName: "Beta Ltd.", TradeName: "Beta", Status: core.EntityInReview},
		},
		nums: []core.Number{
			{ID: "n1", EntityID: entOK, RangeStart: tnBranded, RangeEnd: tnBranded, Count: 1, Status: core.NumberActive, CarrierConfirmed: true},
			{ID: "n2", EntityID: entOK, RangeStart: "+902125550000", RangeEnd: "+902125550099", Count: 100, Status: core.NumberActive},
			{ID: "n3", EntityID: entOK, RangeStart: tnPending, RangeEnd: tnPending, Count: 1, Status: core.NumberPending},
			{ID: "n4", EntityID: entOK, RangeStart: "+905320000000", RangeEnd: "+905320000000", Count: 1, Status: core.NumberReleased},
			{ID: "n5", EntityID: entPending, RangeStart: "+905440000000", RangeEnd: "+905440000000", Count: 1, Status: core.NumberActive},
		},
		brand: map[string]core.Branding{entOK: {ID: "b1", EntityID: entOK, DisplayName: "Acme Kargo",
			LogoURL: "https://acme.example/logo.png", CallReason: "Teslimat bilgisi", Status: core.BrandingApproved}},
	}
	svc, err := New(Deps{Base: base, Directory: f.dir, Lookup: fakeLookup{f.dir}, Notifier: f.notif})
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Init(ctx); err != nil {
		t.Fatal(err)
	}
	f.svc = svc
	return f
}

func checks(r core.VerifyResult) map[string]bool {
	m := map[string]bool{}
	for _, c := range r.Checks {
		m[c.Name] = c.OK
	}
	return m
}

// ---- tests

func TestInitIdempotentAndSealedKeys(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if err := f.svc.Init(ctx); err != nil {
		t.Fatal(err)
	}
	certs, err := f.svc.ListCertificates(ctx)
	if err != nil {
		t.Fatal(err)
	}
	kinds := map[core.CertKind]int{}
	for _, c := range certs {
		kinds[c.Kind]++
		if !strings.HasPrefix(c.X5U, "http://test.local/certs/"+c.ID+".pem") {
			t.Fatalf("x5u %s", c.X5U)
		}
	}
	if !reflect.DeepEqual(kinds, map[core.CertKind]int{core.CertRoot: 1, core.CertIntermediate: 1, core.CertSP: 1}) {
		t.Fatalf("kinds %v", kinds)
	}
	var sp core.Certificate
	for _, c := range certs {
		if c.Kind == core.CertSP {
			sp = c
		}
	}
	if sp.SPC != "1001" || !reflect.DeepEqual(sp.TNAuthList, []core.TNEntry{{SPC: "1001"}}) {
		t.Fatalf("sp %+v", sp)
	}
	if d := sp.NotAfter.Sub(sp.NotBefore); d < 364*24*time.Hour || d > 366*24*time.Hour {
		t.Fatalf("sp validity %v", d)
	}
	// The TNAuthList in the X.509 certificate decodes to the same entries.
	b, _ := pem.Decode([]byte(sp.PEM))
	xc, err := x509.ParseCertificate(b.Bytes)
	if err != nil {
		t.Fatal(err)
	}
	ents, err := passport.TNAuthListFromCert(xc)
	if err != nil || !reflect.DeepEqual(ents, sp.TNAuthList) {
		t.Fatalf("%v %+v", err, ents)
	}
	// Keys are sealed with AAD = key id: swapping ciphertexts between rows fails.
	rows, err := f.base.DB.QueryContext(ctx, `SELECT id, sealed_private FROM pki_keys`)
	if err != nil {
		t.Fatal(err)
	}
	var ids, sealed []string
	for rows.Next() {
		var id, s string
		_ = rows.Scan(&id, &s)
		ids, sealed = append(ids, id), append(sealed, s)
	}
	rows.Close()
	if len(ids) != 3 {
		t.Fatalf("keys %d", len(ids))
	}
	if _, err := f.base.DB.ExecContext(ctx, `UPDATE pki_keys SET sealed_private = ? WHERE id = ?`, sealed[0], ids[1]); err != nil {
		t.Fatal(err)
	}
	fresh, _ := New(Deps{Base: f.base})
	if _, err := fresh.loadKey(ctx, f.base.DB, ids[1]); err == nil {
		t.Fatal("swapped sealed key opened")
	}
	if _, err := fresh.loadKey(ctx, f.base.DB, ids[0]); err != nil {
		t.Fatal(err)
	}
	// No private material in the public listing.
	js, _ := json.Marshal(certs)
	if strings.Contains(string(js), "PRIVATE") || strings.Contains(string(js), "sealed") {
		t.Fatal("private material leaked")
	}
}

func TestSignVerifyFlow(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	res, err := f.svc.Sign(ctx, core.SignRequest{OrigTN: "0532 123 45 67", DestTN: tnOther})
	if err != nil {
		t.Fatal(err)
	}
	if res.Attest != core.AttestA || res.OrigID == "" || res.CertID == "" || !strings.Contains(res.Identity, ";ppt=shaken") {
		t.Fatalf("%+v", res)
	}
	v, err := f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, FromTN: tnBranded, ToTN: "05551112233"})
	if err != nil {
		t.Fatal(err)
	}
	if v.Verstat != core.VerstatPassed || v.CertID != res.CertID || v.Attest != core.AttestA || v.OrigID != res.OrigID {
		t.Fatalf("%+v", v)
	}
	for _, n := range passport.CheckOrder {
		if !checks(v)[n] {
			t.Fatalf("check %s missing/false: %+v", n, v.Checks)
		}
	}
	// Bare compact JWS is accepted too.
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Passport, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatPassed {
		t.Fatalf("%+v", v)
	}
	// Attest from lookup: B for verified but unconfirmed; C for unknown; explicit wins.
	r2, _ := f.svc.Sign(ctx, core.SignRequest{OrigTN: tnRangeIn, DestTN: tnOther})
	r3, _ := f.svc.Sign(ctx, core.SignRequest{OrigTN: "+903125550000", DestTN: tnOther})
	r4, _ := f.svc.Sign(ctx, core.SignRequest{OrigTN: "+903125550000", DestTN: tnOther, Attest: core.AttestB})
	if r2.Attest != core.AttestB || r3.Attest != core.AttestC || r4.Attest != core.AttestB {
		t.Fatalf("attest %s %s %s", r2.Attest, r3.Attest, r4.Attest)
	}
	// Operator SP cert (SPC) covers any TN.
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: r3.Identity, FromTN: "+903125550000", ToTN: tnOther})
	if v.Verstat != core.VerstatPassed {
		t.Fatalf("%+v", v)
	}
	// Wrong dest.
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, FromTN: tnBranded, ToTN: "+905551112234"})
	if v.Verstat != core.VerstatFailed || checks(v)["dest_match"] {
		t.Fatalf("%+v", v)
	}
	// Expired iat: verify 2 minutes later.
	f.offset = 2 * time.Minute
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatFailed || checks(v)["iat_fresh"] || !checks(v)["signature"] {
		t.Fatalf("%+v", v)
	}
	f.offset = 0
	// Garbage → No-TN-Validation; invalid TN → 422.
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: "", FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatNone {
		t.Fatalf("%+v", v)
	}
	if _, err := f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, FromTN: "abc", ToTN: tnOther}); !errors.Is(err, core.ErrInvalid) {
		t.Fatalf("err %v", err)
	}
	// x5u pointing outside the local store is never fetched.
	ext := strings.ReplaceAll(res.Identity, "http://test.local", "https://evil.example")
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: ext, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat == core.VerstatPassed || checks(v)["x5u_fetch"] {
		t.Fatalf("%+v", v)
	}
	// Input validation on sign.
	for _, bad := range []core.SignRequest{{OrigTN: "x", DestTN: tnOther}, {OrigTN: tnBranded, DestTN: tnOther, Attest: "D"},
		{OrigTN: tnBranded, DestTN: tnOther, OrigID: "not-a-uuid"}} {
		if _, err := f.svc.Sign(ctx, bad); !errors.Is(err, core.ErrInvalid) {
			t.Fatalf("%+v: %v", bad, err)
		}
	}
	// Revoked SP cert → Failed; signing then has no SP cert until rotation.
	if _, err := f.svc.RevokeCertificate(ctx, res.CertID, "keyCompromise"); err != nil {
		t.Fatal(err)
	}
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatFailed || checks(v)["not_revoked"] {
		t.Fatalf("%+v", v)
	}
	if _, err := f.svc.Sign(ctx, core.SignRequest{OrigTN: tnBranded, DestTN: tnOther}); !errors.Is(err, core.ErrState) {
		t.Fatalf("sign without SP: %v", err)
	}
	if _, err := f.svc.RevokeCertificate(ctx, res.CertID, "again"); !errors.Is(err, core.ErrState) {
		t.Fatalf("double revoke: %v", err)
	}
	nc, err := f.svc.RotateSP(ctx)
	if err != nil {
		t.Fatal(err)
	}
	res2, err := f.svc.Sign(ctx, core.SignRequest{OrigTN: tnBranded, DestTN: tnOther})
	if err != nil || res2.CertID != nc.ID {
		t.Fatalf("%+v %v", res2, err)
	}
	// Rotating again supersedes the previous SP cert.
	nc2, _ := f.svc.RotateSP(ctx)
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res2.Identity, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatFailed {
		t.Fatalf("superseded cert still passes: %+v", v)
	}
	res3, _ := f.svc.Sign(ctx, core.SignRequest{OrigTN: tnBranded, DestTN: tnOther})
	if res3.CertID != nc2.ID {
		t.Fatal("rotation not used")
	}
	// The root cannot be revoked.
	certs, _ := f.svc.ListCertificates(ctx)
	for _, c := range certs {
		if c.Kind == core.CertRoot {
			if _, err := f.svc.RevokeCertificate(ctx, c.ID, "x"); !errors.Is(err, core.ErrState) {
				t.Fatalf("root revoke: %v", err)
			}
		}
	}
}

func TestDelegateIssuance(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if _, err := f.svc.IssueDelegate(ctx, entPending); !errors.Is(err, core.ErrState) {
		t.Fatalf("unverified entity: %v", err)
	}
	if _, err := f.svc.IssueDelegate(ctx, ""); !errors.Is(err, core.ErrForbidden) {
		t.Fatalf("no entity: %v", err)
	}
	c, err := f.svc.IssueDelegate(ctx, entOK)
	if err != nil {
		t.Fatal(err)
	}
	want := []core.TNEntry{{TN: "905321234567"}, {Start: "902125550000", Count: 100}}
	if c.Kind != core.CertDelegate || c.EntityID != entOK || !reflect.DeepEqual(c.TNAuthList, want) {
		t.Fatalf("%+v", c)
	}
	if d := c.NotAfter.Sub(c.NotBefore); d < 89*24*time.Hour || d > 91*24*time.Hour {
		t.Fatalf("validity %v", d)
	}
	b, _ := pem.Decode([]byte(c.PEM))
	xc, _ := x509.ParseCertificate(b.Bytes)
	got, err := passport.TNAuthListFromCert(xc)
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("%v %+v", err, got)
	}
	if len(f.notif.events) == 0 || f.notif.events[len(f.notif.events)-1].Type != core.EventCertificateIssued ||
		f.notif.events[len(f.notif.events)-1].EntityID != entOK {
		t.Fatalf("events %+v", f.notif.events)
	}
	list, _ := f.svc.EntityCertificates(ctx, entOK)
	if len(list) != 1 || list[0].ID != c.ID {
		t.Fatalf("%+v", list)
	}
	if other, _ := f.svc.EntityCertificates(ctx, entPending); len(other) != 0 {
		t.Fatal("leak across entities")
	}
	audit, _ := platform.ListAudit(ctx, f.base.DB, "certificate", c.ID, 10)
	if len(audit) == 0 {
		t.Fatal("no audit")
	}
	// Entity with no active numbers.
	f.dir.ents["ent-empty"] = core.Entity{ID: "ent-empty", TradeName: "Boş", Status: core.EntityVerified}
	if _, err := f.svc.IssueDelegate(ctx, "ent-empty"); !errors.Is(err, core.ErrState) {
		t.Fatalf("no numbers: %v", err)
	}
}

func TestRCD(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	// Carrier sign with rcd from approved branding.
	res, err := f.svc.Sign(ctx, core.SignRequest{OrigTN: tnBranded, DestTN: tnOther, WithRCD: true})
	if err != nil {
		t.Fatal(err)
	}
	if res.RCDIdentity == "" || !strings.Contains(res.RCDIdentity, ";ppt=rcd") {
		t.Fatalf("%+v", res)
	}
	v, _ := f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, RCDIdentity: res.RCDIdentity, FromTN: tnBranded, ToTN: tnOther})
	want := core.RCDClaims{Nam: "Acme Kargo", Icn: "https://acme.example/logo.png", Crn: "Teslimat bilgisi"}
	if v.Verstat != core.VerstatPassed || !v.RCDVerified || v.RCD == nil || *v.RCD != want {
		t.Fatalf("%+v", v)
	}
	// No approved branding → 422.
	if _, err := f.svc.Sign(ctx, core.SignRequest{OrigTN: "+903125550000", DestTN: tnOther, WithRCD: true}); !errors.Is(err, core.ErrInvalid) {
		t.Fatalf("unbranded: %v", err)
	}
	// Enterprise rcd needs a delegate cert first.
	if _, err := f.svc.SignRCD(ctx, entOK, tnBranded, tnOther); !errors.Is(err, core.ErrState) {
		t.Fatalf("no delegate: %v", err)
	}
	dc, err := f.svc.IssueDelegate(ctx, entOK)
	if err != nil {
		t.Fatal(err)
	}
	er, err := f.svc.SignRCD(ctx, entOK, tnBranded, tnOther)
	if err != nil {
		t.Fatal(err)
	}
	if er.CertID != dc.ID || er.Identity != "" || er.RCDIdentity == "" {
		t.Fatalf("%+v", er)
	}
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, RCDIdentity: er.RCDIdentity, FromTN: tnBranded, ToTN: tnOther})
	if v.Verstat != core.VerstatPassed || !v.RCDVerified || v.RCD.Nam != "Acme Kargo" {
		t.Fatalf("%+v", v)
	}
	// Numbers outside the delegate's TNAuthList are refused.
	if _, err := f.svc.SignRCD(ctx, entOK, tnPending, tnOther); !errors.Is(err, core.ErrForbidden) {
		t.Fatalf("pending number: %v", err)
	}
	// A number suspended after issuance: signing refused, verification of rcd fails.
	f.dir.nums[0].Status = core.NumberSuspended
	if _, err := f.svc.SignRCD(ctx, entOK, tnBranded, tnOther); !errors.Is(err, core.ErrForbidden) {
		t.Fatalf("suspended number: %v", err)
	}
	v, _ = f.svc.Verify(ctx, core.VerifyRequest{Identity: res.Identity, RCDIdentity: er.RCDIdentity, FromTN: tnBranded, ToTN: tnOther})
	if v.RCDVerified || v.RCD != nil {
		t.Fatalf("%+v", v)
	}
}

func TestHTTP(t *testing.T) {
	f := newFixture(t)
	r := platform.NewRouter(platform.NewLogger("error"), nil)
	r.SetAuthenticator(platform.StaticAuth{
		"cr":    {Kind: "apikey", ID: "k1", Scopes: []core.Scope{core.ScopeCarrierRead}},
		"cw":    {Kind: "apikey", ID: "k2", Scopes: []core.Scope{core.ScopeCarrierRead, core.ScopeCarrierWrite}},
		"ar":    {Kind: "apikey", ID: "k3", Scopes: []core.Scope{core.ScopeAdminRead}},
		"adm":   {Kind: "apikey", ID: "k4", Scopes: []core.Scope{core.ScopeAdmin}},
		"ent":   {Kind: "apikey", ID: "k5", EntityID: entOK, Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
		"opent": {Kind: "apikey", ID: "k6", Scopes: []core.Scope{core.ScopeEnterpriseRead, core.ScopeEnterpriseWrite}},
	})
	f.svc.Mount(r)
	do := func(method, path, tok, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		if tok != "" {
			req.Header.Set("Authorization", "Bearer "+tok)
		}
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w
	}
	signBody := `{"orig_tn":"+905321234567","dest_tn":"+905551112233","with_rcd":true}`
	if w := do("POST", "/v1/carrier/sign", "", signBody); w.Code != 401 {
		t.Fatalf("anon sign %d", w.Code)
	}
	if w := do("POST", "/v1/carrier/sign", "cr", signBody); w.Code != 403 {
		t.Fatalf("read-only sign %d", w.Code)
	}
	w := do("POST", "/v1/carrier/sign", "cw", signBody)
	if w.Code != 200 {
		t.Fatalf("sign %d %s", w.Code, w.Body)
	}
	var sr core.SignResult
	_ = json.Unmarshal(w.Body.Bytes(), &sr)
	if w := do("POST", "/v1/carrier/sign", "cw", `{"orig_tn":"x","dest_tn":"y","bogus":1}`); w.Code != 422 {
		t.Fatalf("bad body %d", w.Code)
	}
	vb, _ := json.Marshal(core.VerifyRequest{Identity: sr.Identity, RCDIdentity: sr.RCDIdentity, FromTN: "+905321234567", ToTN: "+905551112233"})
	if w := do("POST", "/v1/carrier/verify", "ent", string(vb)); w.Code != 403 {
		t.Fatalf("enterprise verify %d", w.Code)
	}
	w = do("POST", "/v1/carrier/verify", "cr", string(vb))
	var vr core.VerifyResult
	_ = json.Unmarshal(w.Body.Bytes(), &vr)
	if w.Code != 200 || vr.Verstat != core.VerstatPassed || !vr.RCDVerified {
		t.Fatalf("verify %d %s", w.Code, w.Body)
	}
	// Public x5u download: leaf + intermediate.
	file := strings.TrimPrefix(sr.X5U, "http://test.local")
	w = do("GET", file, "", "")
	if w.Code != 200 || w.Header().Get("Content-Type") != "application/x-pem-file" ||
		strings.Count(w.Body.String(), "BEGIN CERTIFICATE") != 2 || strings.Contains(w.Body.String(), "PRIVATE") {
		t.Fatalf("certs %d %q %s", w.Code, w.Header().Get("Content-Type"), w.Body)
	}
	for _, bad := range []string{"/certs/%2e%2e%2fetc%2fpasswd", "/certs/0000000A-0000-0000-0000-000000000000.pem", "/certs/abc.pem", "/certs/00000000-0000-0000-0000-000000000000.pem"} {
		if w := do("GET", bad, "", ""); w.Code != 404 {
			t.Fatalf("%s -> %d", bad, w.Code)
		}
	}
	// Admin.
	if w := do("GET", "/v1/admin/pki/certificates", "cw", ""); w.Code != 403 {
		t.Fatalf("carrier admin list %d", w.Code)
	}
	w = do("GET", "/v1/admin/pki/certificates", "ar", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"items"`) {
		t.Fatalf("admin list %d", w.Code)
	}
	if w := do("POST", "/v1/admin/pki/rotate-sp", "ar", ""); w.Code != 403 {
		t.Fatalf("analyst rotate %d", w.Code)
	}
	w = do("POST", "/v1/admin/pki/rotate-sp", "adm", "")
	var nc core.Certificate
	_ = json.Unmarshal(w.Body.Bytes(), &nc)
	if w.Code != 200 || nc.Kind != core.CertSP {
		t.Fatalf("rotate %d %s", w.Code, w.Body)
	}
	if w := do("POST", "/v1/admin/pki/certificates/"+nc.ID+"/revoke", "adm", `{}`); w.Code != 422 {
		t.Fatalf("revoke without reason %d", w.Code)
	}
	if w := do("POST", "/v1/admin/pki/certificates/"+nc.ID+"/revoke", "adm", `{"reason":"test"}`); w.Code != 200 {
		t.Fatalf("revoke %d %s", w.Code, w.Body)
	}
	// Enterprise.
	if w := do("POST", "/v1/enterprise/certificates", "opent", ""); w.Code != 403 {
		t.Fatalf("no entity issue %d", w.Code)
	}
	if w := do("POST", "/v1/enterprise/certificates", "cw", ""); w.Code != 403 {
		t.Fatalf("carrier issue %d", w.Code)
	}
	if w := do("POST", "/v1/enterprise/certificates", "ent", ""); w.Code != 201 {
		t.Fatalf("issue %d %s", w.Code, w.Body)
	}
	w = do("GET", "/v1/enterprise/certificates", "ent", "")
	if w.Code != 200 || strings.Count(w.Body.String(), `"kind":"delegate"`) != 1 {
		t.Fatalf("ent list %d %s", w.Code, w.Body)
	}
	w = do("POST", "/v1/enterprise/rcd/sign", "ent", `{"orig_tn":"+905321234567","dest_tn":"+905551112233"}`)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"rcd_identity"`) {
		t.Fatalf("rcd sign %d %s", w.Code, w.Body)
	}
	if w := do("POST", "/v1/enterprise/rcd/sign", "cw", `{"orig_tn":"+905321234567","dest_tn":"+905551112233"}`); w.Code != 403 {
		t.Fatalf("carrier rcd sign %d", w.Code)
	}
}
