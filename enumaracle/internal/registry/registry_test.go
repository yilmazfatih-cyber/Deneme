package registry

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// ---------------------------------------------------------------- fakes

type fakeAccounts struct {
	mu    sync.Mutex
	users []core.NewUser
	fail  error
}

func (f *fakeAccounts) CreateUser(_ context.Context, u core.NewUser) (core.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail != nil {
		return core.User{}, f.fail
	}
	for _, x := range f.users {
		if x.Email == u.Email {
			return core.User{}, core.Errorf(core.ErrConflict, "e-posta zaten kayıtlı")
		}
	}
	f.users = append(f.users, u)
	return core.User{ID: core.NewID(), Email: u.Email, Name: u.Name, Role: u.Role, EntityID: u.EntityID, Active: true}, nil
}

type fakeNotifier struct {
	mu     sync.Mutex
	events []core.Event
}

func (f *fakeNotifier) Notify(_ context.Context, e core.Event) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.events = append(f.events, e)
	return nil
}

func (f *fakeNotifier) count(typ string) int {
	f.mu.Lock()
	defer f.mu.Unlock()
	n := 0
	for _, e := range f.events {
		if e.Type == typ {
			n++
		}
	}
	return n
}

type fakeRep map[string]core.Score

func (f fakeRep) ScoreFor(_ context.Context, tn string) (core.Score, bool, error) {
	s, ok := f[tn]
	return s, ok, nil
}

// ---------------------------------------------------------------- helpers

type env struct {
	svc   *Service
	acc   *fakeAccounts
	notif *fakeNotifier
	ctx   context.Context // admin principal
}

func newEnv(t *testing.T, mutate ...func(*platform.Deps)) *env {
	t.Helper()
	ctx := context.Background()
	base, err := platform.NewTestDeps(ctx, Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { base.DB.Close() })
	for _, m := range mutate {
		m(&base)
	}
	acc, notif := &fakeAccounts{}, &fakeNotifier{}
	svc, err := New(Deps{Base: base, Notifier: notif, Accounts: acc})
	if err != nil {
		t.Fatal(err)
	}
	admin := core.Principal{Kind: "user", ID: "admin-1", Role: core.RoleOperatorAdmin, Scopes: core.RoleScopes[core.RoleOperatorAdmin]}
	return &env{svc: svc, acc: acc, notif: notif, ctx: core.WithPrincipal(ctx, admin)}
}

var vknSeq = 100000000

func nextVKN() string {
	vknSeq++
	return VKNWithCheck(fmt.Sprintf("%09d", vknSeq))
}

func entityInput(vkn string) EntityInput {
	return EntityInput{LegalName: "Örnek Ticaret A.Ş.", TradeName: "Örnek", VKN: vkn, Sector: "Perakende",
		City: "İstanbul", ContactName: "Ayşe Şahin", ContactEmail: "ayse@ornek.example", ContactPhone: "0532 123 45 67"}
}

func (e *env) entity(t *testing.T, status core.EntityStatus) core.Entity {
	t.Helper()
	ent, err := e.svc.CreateEntity(e.ctx, entityInput(nextVKN()))
	if err != nil {
		t.Fatal(err)
	}
	path := map[core.EntityStatus][]core.EntityStatus{
		core.EntityPending:   nil,
		core.EntityInReview:  {core.EntityInReview},
		core.EntityVerified:  {core.EntityInReview, core.EntityVerified},
		core.EntityRejected:  {core.EntityInReview, core.EntityRejected},
		core.EntitySuspended: {core.EntityInReview, core.EntityVerified, core.EntitySuspended},
	}[status]
	for _, to := range path {
		if ent, err = e.svc.Transition(e.ctx, ent.ID, DecisionInput{ToStatus: to, Note: "test"}); err != nil {
			t.Fatal(err)
		}
	}
	return ent
}

func (e *env) number(t *testing.T, entityID string, in NumberInput) core.Number {
	t.Helper()
	if in.UseCase == "" {
		in.UseCase = core.UseCustomerService
	}
	n, err := e.svc.RegisterNumber(e.ctx, entityID, in)
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func (e *env) activate(t *testing.T, id string, confirmed bool) core.Number {
	t.Helper()
	n, err := e.svc.SetNumberStatus(e.ctx, id, NumberStatusInput{Status: core.NumberActive, CarrierConfirmed: &confirmed})
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func (e *env) brand(t *testing.T, entityID, name string, def bool, status core.BrandingStatus) core.Branding {
	t.Helper()
	b, err := e.svc.CreateBranding(e.ctx, entityID, BrandingInput{DisplayName: name, CallReason: name + " arıyor",
		LogoURL: "https://cdn.example/logo.png", IsDefault: def})
	if err != nil {
		t.Fatal(err)
	}
	if status != core.BrandingPending {
		if b, err = e.svc.ReviewBranding(e.ctx, b.ID, ReviewInput{Status: status, Note: "test"}); err != nil {
			t.Fatal(err)
		}
	}
	return b
}

func fieldErr(err error, field string) bool {
	var ve *core.ValidationError
	if !errors.As(err, &ve) {
		return false
	}
	for _, f := range ve.Fields {
		if f.Field == field {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------- vetting state machine

func TestCanTransitionTable(t *testing.T) {
	all := []core.EntityStatus{core.EntityPending, core.EntityInReview, core.EntityVerified, core.EntityRejected, core.EntitySuspended}
	legal := map[[2]core.EntityStatus]bool{
		{core.EntityPending, core.EntityInReview}:   true,
		{core.EntityInReview, core.EntityVerified}:  true,
		{core.EntityInReview, core.EntityRejected}:  true,
		{core.EntityVerified, core.EntitySuspended}: true,
		{core.EntitySuspended, core.EntityVerified}: true,
		{core.EntityRejected, core.EntityInReview}:  true,
	}
	for _, from := range all {
		for _, to := range all {
			if got, want := CanTransition(from, to), legal[[2]core.EntityStatus{from, to}]; got != want {
				t.Errorf("CanTransition(%s, %s) = %v, want %v", from, to, got, want)
			}
		}
	}
}

func TestTransitionService(t *testing.T) {
	cases := []struct {
		from    core.EntityStatus
		to      core.EntityStatus
		note    string
		wantErr error
	}{
		{core.EntityPending, core.EntityInReview, "", nil},
		{core.EntityPending, core.EntityVerified, "x", core.ErrState},
		{core.EntityInReview, core.EntityVerified, "", nil},
		{core.EntityInReview, core.EntityRejected, "Belgeler eksik", nil},
		{core.EntityInReview, core.EntityRejected, "", core.ErrInvalid}, // note required
		{core.EntityInReview, core.EntitySuspended, "x", core.ErrState},
		{core.EntityVerified, core.EntitySuspended, "Şikâyet", nil},
		{core.EntityVerified, core.EntityRejected, "x", core.ErrState},
		{core.EntitySuspended, core.EntityVerified, "", nil},
		{core.EntitySuspended, core.EntityInReview, "", core.ErrState},
		{core.EntityRejected, core.EntityInReview, "", nil},
		{core.EntityRejected, core.EntityVerified, "", core.ErrState},
		{core.EntityVerified, core.EntityPending, "", core.ErrInvalid}, // not a decision target
	}
	e := newEnv(t)
	for _, c := range cases {
		ent := e.entity(t, c.from)
		before := e.notif.count(core.EventEntityStatusChanged)
		got, err := e.svc.Transition(e.ctx, ent.ID, DecisionInput{ToStatus: c.to, Note: c.note, RiskTier: "high"})
		if c.wantErr != nil {
			if !errors.Is(err, c.wantErr) {
				t.Errorf("%s→%s: err = %v, want %v", c.from, c.to, err, c.wantErr)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s→%s: %v", c.from, c.to, err)
			continue
		}
		if got.Status != c.to || got.RiskTier != "high" {
			t.Errorf("%s→%s: got %+v", c.from, c.to, got)
		}
		if e.notif.count(core.EventEntityStatusChanged) != before+1 {
			t.Errorf("%s→%s: event not emitted", c.from, c.to)
		}
		d, _ := e.svc.EntityDetail(e.ctx, ent.ID)
		last := d.Decisions[len(d.Decisions)-1]
		if last.FromStatus != c.from || last.ToStatus != c.to || last.ReviewerID != "admin-1" {
			t.Errorf("%s→%s: decision %+v", c.from, c.to, last)
		}
		if c.to == core.EntityRejected && got.RejectReason != c.note {
			t.Errorf("reject reason %q", got.RejectReason)
		}
	}
	audit, _ := platform.ListAudit(e.ctx, e.svc.db, "entity", "", 500)
	if len(audit) == 0 {
		t.Fatal("no audit rows")
	}
}

func TestSuspendCascadesNumbers(t *testing.T) {
	e := newEnv(t)
	ent := e.entity(t, core.EntityVerified)
	a := e.number(t, ent.ID, NumberInput{TN: "08502220000"})
	e.activate(t, a.ID, true)
	b := e.number(t, ent.ID, NumberInput{TN: "08502220001"})
	e.activate(t, b.ID, false)
	// b is suspended by the operator for its own reason: it must stay suspended on reinstatement.
	if _, err := e.svc.SetNumberStatus(e.ctx, b.ID, NumberStatusInput{Status: core.NumberSuspended, Reason: "Şikâyet incelemesi"}); err != nil {
		t.Fatal(err)
	}
	p := e.number(t, ent.ID, NumberInput{TN: "08502220002"}) // pending stays pending
	if _, err := e.svc.Transition(e.ctx, ent.ID, DecisionInput{ToStatus: core.EntitySuspended, Note: "Yoğun şikâyet"}); err != nil {
		t.Fatal(err)
	}
	status := func(id string) core.NumberStatus {
		n, err := getNumber(e.ctx, e.svc.db, id)
		if err != nil {
			t.Fatal(err)
		}
		return n.Status
	}
	if status(a.ID) != core.NumberSuspended || status(b.ID) != core.NumberSuspended || status(p.ID) != core.NumberPending {
		t.Fatal("suspension cascade wrong", status(a.ID), status(b.ID), status(p.ID))
	}
	if _, err := e.svc.Transition(e.ctx, ent.ID, DecisionInput{ToStatus: core.EntityVerified}); err != nil {
		t.Fatal(err)
	}
	if status(a.ID) != core.NumberActive || status(b.ID) != core.NumberSuspended {
		t.Fatal("reinstatement cascade wrong", status(a.ID), status(b.ID))
	}
	if e.notif.count(core.EventNumberStatusChanged) < 4 {
		t.Fatal("number events missing", e.notif.count(core.EventNumberStatusChanged))
	}
}

// ---------------------------------------------------------------- signup

func TestSignupValidation(t *testing.T) {
	e := newEnv(t)
	good := func() SignupInput {
		return SignupInput{EntityInput: entityInput(nextVKN()), Password: "çok-gizli-parola"}
	}
	badVKN := good()
	badVKN.VKN = badVKN.VKN[:9] + string('0'+(badVKN.VKN[9]-'0'+1)%10)
	cases := []struct {
		name  string
		in    SignupInput
		field string
	}{
		{"bad vkn checksum", badVKN, "vkn"},
		{"short vkn", func() SignupInput { s := good(); s.VKN = "12345"; return s }(), "vkn"},
		{"bad mersis", func() SignupInput { s := good(); s.MERSIS = "1234567890123456"; return s }(), "mersis"},
		{"bad email", func() SignupInput { s := good(); s.ContactEmail = "ayse@"; return s }(), "contact_email"},
		{"bad phone", func() SignupInput { s := good(); s.ContactPhone = "12"; return s }(), "contact_phone"},
		{"no legal name", func() SignupInput { s := good(); s.LegalName = " "; return s }(), "legal_name"},
		{"short password", func() SignupInput { s := good(); s.Password = "kisa"; return s }(), "password"},
		{"bad website", func() SignupInput { s := good(); s.Website = "ftp://x"; return s }(), "website"},
	}
	for _, c := range cases {
		_, err := e.svc.Signup(e.ctx, c.in)
		if !errors.Is(err, core.ErrInvalid) || !fieldErr(err, c.field) {
			t.Errorf("%s: err = %v, want field %s", c.name, err, c.field)
		}
	}

	in := good()
	in.VKN = " " + in.VKN[:3] + " " + in.VKN[3:] + " "
	in.MERSIS = "0123-4567-8901-2345"
	in.Website = "ornek.com.tr"
	res, err := e.svc.Signup(e.ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	if res.Entity.Status != core.EntityPending || res.Entity.ContactPhone != "+905321234567" ||
		res.Entity.MERSIS != "0123456789012345" || res.Entity.Website != "https://ornek.com.tr" || res.Entity.Country != "TR" {
		t.Fatalf("entity %+v", res.Entity)
	}
	if res.User.Role != core.RoleEnterpriseOwner || res.User.EntityID != res.Entity.ID || len(e.acc.users) != 1 {
		t.Fatalf("user %+v", res.User)
	}

	dup := good()
	dup.VKN = res.Entity.VKN
	dup.ContactEmail = "baska@ornek.example"
	if _, err := e.svc.Signup(e.ctx, dup); !errors.Is(err, core.ErrConflict) {
		t.Fatalf("duplicate VKN: %v", err)
	}

	// User creation failure must not leave an orphan entity behind.
	orphan := good()
	e.acc.fail = core.Errorf(core.ErrConflict, "e-posta zaten kayıtlı")
	if _, err := e.svc.Signup(e.ctx, orphan); !errors.Is(err, core.ErrConflict) {
		t.Fatal(err)
	}
	e.acc.fail = nil
	if _, total, _ := e.svc.ListEntities(e.ctx, EntityFilter{Query: orphan.VKN}); total != 0 {
		t.Fatal("orphan entity left behind")
	}

	noAcc, _ := New(Deps{Base: e.svc.base})
	if _, err := noAcc.Signup(e.ctx, good()); err == nil {
		t.Fatal("signup without Accounts must fail")
	}
}

func TestEntityUpdateOnlyPendingOrRejected(t *testing.T) {
	e := newEnv(t)
	for _, c := range []struct {
		status core.EntityStatus
		ok     bool
	}{{core.EntityPending, true}, {core.EntityRejected, true}, {core.EntityInReview, false}, {core.EntityVerified, false}} {
		ent := e.entity(t, c.status)
		in := entityInput(ent.VKN)
		in.City = "Ankara"
		got, err := e.svc.UpdateEntity(e.ctx, ent.ID, in)
		if c.ok && (err != nil || got.City != "Ankara") {
			t.Errorf("%s: %v", c.status, err)
		}
		if !c.ok && !errors.Is(err, core.ErrState) {
			t.Errorf("%s: err %v", c.status, err)
		}
	}
}

// ---------------------------------------------------------------- numbers

func TestRegisterNumbers(t *testing.T) {
	e := newEnv(t)
	a := e.entity(t, core.EntityVerified)
	b := e.entity(t, core.EntityPending)

	n := e.number(t, a.ID, NumberInput{TN: "0532 123 45 67", CallReason: "  Randevu   hatırlatma "})
	if n.RangeStart != "+905321234567" || n.RangeEnd != n.RangeStart || n.Count != 1 || n.Kind != core.KindMobile ||
		n.Status != core.NumberPending || n.CallReason != "Randevu hatırlatma" {
		t.Fatalf("%+v", n)
	}
	r := e.number(t, a.ID, NumberInput{RangeStart: "+90 212 335 00 00", RangeEnd: "0212 335 00 99"})
	if r.Count != 100 || r.Kind != core.KindGeographic || r.RangeEnd != "+902123350099" {
		t.Fatalf("%+v", r)
	}
	if s := e.number(t, a.ID, NumberInput{TN: "444 0 724"}); s.RangeStart != "+904440724" || s.Kind != core.KindShort444 {
		t.Fatalf("%+v", s)
	}

	cases := []struct {
		name    string
		entity  string
		in      NumberInput
		wantErr error
		field   string
	}{
		{"same number other entity", b.ID, NumberInput{TN: "+905321234567"}, core.ErrConflict, ""},
		{"same number same entity", a.ID, NumberInput{TN: "05321234567"}, core.ErrConflict, ""},
		{"range overlapping existing range", b.ID, NumberInput{RangeStart: "02123350090", RangeEnd: "02123350199"}, core.ErrConflict, ""},
		{"range containing existing single", b.ID, NumberInput{RangeStart: "05321234500", RangeEnd: "05321234599"}, core.ErrConflict, ""},
		{"single inside existing range", b.ID, NumberInput{TN: "0212 335 00 42"}, core.ErrConflict, ""},
		{"range too large", b.ID, NumberInput{RangeStart: "02120000000", RangeEnd: "02120010000"}, core.ErrInvalid, "range_end"},
		{"reversed range", b.ID, NumberInput{RangeStart: "02120000099", RangeEnd: "02120000000"}, core.ErrInvalid, "range_end"},
		{"length mismatch", b.ID, NumberInput{RangeStart: "+4420700000", RangeEnd: "+44207000009"}, core.ErrInvalid, "range_end"},
		{"tn and range", b.ID, NumberInput{TN: "05321111111", RangeStart: "05321111111", RangeEnd: "05321111112"}, core.ErrInvalid, "tn"},
		{"garbage tn", b.ID, NumberInput{TN: "abc"}, core.ErrInvalid, "tn"},
		{"bad use case", b.ID, NumberInput{TN: "05329999999", UseCase: "spam"}, core.ErrInvalid, "use_case"},
		{"foreign branding", b.ID, NumberInput{TN: "05329999999", BrandingID: "nope"}, core.ErrInvalid, "branding_id"},
	}
	for _, c := range cases {
		if c.in.UseCase == "" {
			c.in.UseCase = core.UseDelivery
		}
		_, err := e.svc.RegisterNumber(e.ctx, c.entity, c.in)
		if !errors.Is(err, c.wantErr) || (c.field != "" && !fieldErr(err, c.field)) {
			t.Errorf("%s: err = %v, want %v %s", c.name, err, c.wantErr, c.field)
		}
	}

	// Adjacent ranges do not overlap.
	e.number(t, b.ID, NumberInput{RangeStart: "02123350100", RangeEnd: "02123350199"})
	// Releasing frees the number for another entity.
	if err := e.svc.ReleaseNumber(e.ctx, a.ID, n.ID); err != nil {
		t.Fatal(err)
	}
	e.number(t, b.ID, NumberInput{TN: "+905321234567"})
	// A released number cannot be reactivated or edited.
	if _, err := e.svc.SetNumberStatus(e.ctx, n.ID, NumberStatusInput{Status: core.NumberActive}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	if _, err := e.svc.UpdateNumber(e.ctx, a.ID, n.ID, NumberUpdate{UseCase: core.UseOther}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	// Activation requires a verified entity.
	pb := e.number(t, b.ID, NumberInput{TN: "08505550000"})
	if _, err := e.svc.SetNumberStatus(e.ctx, pb.ID, NumberStatusInput{Status: core.NumberActive}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	// Suspended entities cannot register.
	s := e.entity(t, core.EntitySuspended)
	if _, err := e.svc.RegisterNumber(e.ctx, s.ID, NumberInput{TN: "08505550001", UseCase: core.UseOther}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	if got, _ := e.svc.NumbersOf(e.ctx, a.ID); len(got) != 2 {
		t.Fatalf("NumbersOf excludes released: %d", len(got))
	}
}

// ---------------------------------------------------------------- lookup

func TestLookupRules(t *testing.T) {
	e := newEnv(t)
	ver := e.entity(t, core.EntityVerified)
	pend := e.entity(t, core.EntityInReview)

	def := e.brand(t, ver.ID, "Anadolu Katılım", true, core.BrandingApproved)
	sec := e.brand(t, ver.ID, "AK Güvenlik", false, core.BrandingApproved)
	pendBrand := e.brand(t, ver.ID, "Yeni Marka", false, core.BrandingPending)
	e.brand(t, pend.ID, "Bekleyen", true, core.BrandingApproved)

	nA := e.activate(t, e.number(t, ver.ID, NumberInput{TN: "08502220444"}).ID, true)
	nB := e.activate(t, e.number(t, ver.ID, NumberInput{TN: "08502220445", BrandingID: sec.ID}).ID, false)
	nPendOverride := e.activate(t, e.number(t, ver.ID, NumberInput{TN: "08502220446", BrandingID: pendBrand.ID}).ID, false)
	e.number(t, ver.ID, NumberInput{TN: "08502220447"}) // pending_verification
	e.activate(t, e.number(t, ver.ID, NumberInput{RangeStart: "02123350000", RangeEnd: "02123350099", BrandingID: sec.ID}).ID, true)
	e.number(t, pend.ID, NumberInput{TN: "05551112233"})
	_ = nA
	_ = nB
	_ = nPendOverride

	cases := []struct {
		tn              string
		found, verified bool
		attest          core.Attest
		display, reason string
		status          core.NumberStatus
	}{
		{"+908502220444", true, true, core.AttestA, def.DisplayName, def.CallReason, core.NumberActive},
		{"0850 222 04 45", true, true, core.AttestB, sec.DisplayName, sec.CallReason, core.NumberActive},
		{"08502220446", true, true, core.AttestB, def.DisplayName, def.CallReason, core.NumberActive}, // pending override → default
		{"08502220447", true, false, core.AttestC, "", "", core.NumberPending},
		{"02123350000", true, true, core.AttestA, sec.DisplayName, sec.CallReason, core.NumberActive}, // range start
		{"02123350057", true, true, core.AttestA, sec.DisplayName, sec.CallReason, core.NumberActive}, // range middle
		{"02123350099", true, true, core.AttestA, sec.DisplayName, sec.CallReason, core.NumberActive}, // range end
		{"02123350100", false, false, "", "", "", ""},
		{"05551112233", true, false, core.AttestC, "", "", core.NumberPending}, // unverified entity: no branding
		{"05000000000", false, false, "", "", "", ""},
	}
	for _, c := range cases {
		r, err := e.svc.Lookup(e.ctx, c.tn)
		if err != nil {
			t.Fatalf("%s: %v", c.tn, err)
		}
		if r.Found != c.found || r.Verified != c.verified || r.Attest != c.attest || r.DisplayName != c.display ||
			r.CallReason != c.reason || r.NumberStatus != c.status || r.Score != -1 || r.Label != core.LabelUnknown || r.TTLSeconds != 1 {
			t.Errorf("%s: got %+v", c.tn, r)
		}
		if c.found && r.EntityID == "" {
			t.Errorf("%s: no entity id", c.tn)
		}
	}
	if _, err := e.svc.Lookup(e.ctx, "xyz"); !errors.Is(err, core.ErrInvalid) {
		t.Fatal(err)
	}

	// Rejecting the approved default withdraws it from lookups.
	if _, err := e.svc.ReviewBranding(e.ctx, def.ID, ReviewInput{Status: core.BrandingRejected, Note: "Logo uygunsuz"}); err != nil {
		t.Fatal(err)
	}
	if r, _ := e.svc.Lookup(e.ctx, "+908502220444"); r.DisplayName != "" {
		t.Fatalf("withdrawn branding still shown: %+v", r)
	}

	// Reputation.
	e.svc.SetReputation(fakeRep{"+908502220444": {TN: "+908502220444", Score: 87, Label: core.LabelClean}})
	r, _ := e.svc.Lookup(e.ctx, "+908502220444")
	if r.Score != 87 || r.Label != core.LabelClean {
		t.Fatalf("%+v", r)
	}
	r, _ = e.svc.Lookup(e.ctx, "+908502220445")
	if r.Score != -1 || r.Label != core.LabelUnknown {
		t.Fatalf("%+v", r)
	}

	// Directory.
	n, ent, err := e.svc.NumberOwner(e.ctx, "0212 335 00 50")
	if err != nil || ent.ID != ver.ID || n.Count != 100 {
		t.Fatal(n, ent, err)
	}
	if _, _, err := e.svc.NumberOwner(e.ctx, "+905000000000"); !errors.Is(err, core.ErrNotFound) {
		t.Fatal(err)
	}

	batch, err := e.svc.LookupMany(e.ctx, []string{"+908502220444", "02123350001"})
	if err != nil || len(batch) != 2 || !batch[1].Verified {
		t.Fatal(batch, err)
	}
	if _, err := e.svc.LookupMany(e.ctx, []string{"+908502220444", "x"}); !fieldErr(err, "tns[1]") {
		t.Fatal(err)
	}
}

func TestLookupCacheInvalidation(t *testing.T) {
	now := time.Date(2026, 11, 7, 10, 0, 0, 0, time.UTC)
	var mu sync.Mutex
	clock := func() time.Time { mu.Lock(); defer mu.Unlock(); return now }
	advance := func(d time.Duration) { mu.Lock(); now = now.Add(d); mu.Unlock() }
	e := newEnv(t, func(d *platform.Deps) { d.Cfg.LookupTTL = 30 * time.Second; d.Clock = clock })
	ent := e.entity(t, core.EntityVerified)
	n := e.number(t, ent.ID, NumberInput{TN: "08503330000"})

	r1, _ := e.svc.Lookup(e.ctx, "08503330000")
	if r1.Verified || r1.TTLSeconds != 30 || e.svc.cache.size() != 1 {
		t.Fatalf("%+v size=%d", r1, e.svc.cache.size())
	}
	// Reputation changes are not registry writes: the cached value is served until TTL.
	rep := fakeRep{}
	e.svc.SetReputation(rep) // invalidates (reader changed)
	r1, _ = e.svc.Lookup(e.ctx, "08503330000")
	rep["+908503330000"] = core.Score{Score: 40, Label: core.LabelSuspect}
	if r, _ := e.svc.Lookup(e.ctx, "08503330000"); r.Score != -1 || !r.ComputedAt.Equal(r1.ComputedAt) {
		t.Fatalf("cache miss: %+v", r)
	}
	advance(31 * time.Second)
	if r, _ := e.svc.Lookup(e.ctx, "08503330000"); r.Score != 40 {
		t.Fatalf("expired entry served: %+v", r)
	}

	// A registry write invalidates immediately.
	e.activate(t, n.ID, true)
	if r, _ := e.svc.Lookup(e.ctx, "08503330000"); !r.Verified || r.Attest != core.AttestA {
		t.Fatalf("stale after write: %+v", r)
	}
	b := e.brand(t, ent.ID, "Hızlıyol Kargo", true, core.BrandingApproved)
	if r, _ := e.svc.Lookup(e.ctx, "08503330000"); r.DisplayName != b.DisplayName {
		t.Fatalf("stale after branding review: %+v", r)
	}
	if _, err := e.svc.Transition(e.ctx, ent.ID, DecisionInput{ToStatus: core.EntitySuspended, Note: "test"}); err != nil {
		t.Fatal(err)
	}
	if r, _ := e.svc.Lookup(e.ctx, "08503330000"); r.Verified || r.Attest != core.AttestC || r.DisplayName != "" {
		t.Fatalf("stale after suspension: %+v", r)
	}
	// Stale-store protection: a result computed before a write is not cached after it.
	gen := e.svc.cache.generation()
	e.svc.cache.invalidate()
	e.svc.cache.put("+900000000000", core.LookupResult{}, gen, clock())
	if _, ok := e.svc.cache.get("+900000000000", clock()); ok {
		t.Fatal("stale generation stored")
	}
}

// ---------------------------------------------------------------- branding and documents

func TestBrandingValidationAndReview(t *testing.T) {
	e := newEnv(t)
	ent := e.entity(t, core.EntityVerified)
	cases := []struct {
		in    BrandingInput
		field string
	}{
		{BrandingInput{DisplayName: ""}, "display_name"},
		{BrandingInput{DisplayName: strings.Repeat("ş", 33)}, "display_name"},
		{BrandingInput{DisplayName: "Tamam", LogoURL: "http://x.example/l.png"}, "logo_url"},
		{BrandingInput{DisplayName: "Tamam", LogoURL: "https://x.example/" + strings.Repeat("a", 512)}, "logo_url"},
		{BrandingInput{DisplayName: "Tamam", CallReason: strings.Repeat("ç", 65)}, "call_reason"},
	}
	for _, c := range cases {
		if _, err := e.svc.CreateBranding(e.ctx, ent.ID, c.in); !fieldErr(err, c.field) {
			t.Errorf("%+v: %v", c.in, err)
		}
	}
	ok, err := e.svc.CreateBranding(e.ctx, ent.ID, BrandingInput{DisplayName: strings.Repeat("ş", 32), IsDefault: true})
	if err != nil || ok.Status != core.BrandingPending {
		t.Fatal(ok, err)
	}
	if _, err := e.svc.ReviewBranding(e.ctx, ok.ID, ReviewInput{Status: core.BrandingRejected}); !fieldErr(err, "note") {
		t.Fatal(err)
	}
	approved, err := e.svc.ReviewBranding(e.ctx, ok.ID, ReviewInput{Status: core.BrandingApproved})
	if err != nil || approved.ReviewedBy != "admin-1" || e.notif.count(core.EventBrandingReviewed) != 1 {
		t.Fatal(approved, err)
	}
	if _, err := e.svc.ReviewBranding(e.ctx, ok.ID, ReviewInput{Status: core.BrandingApproved}); !errors.Is(err, core.ErrState) {
		t.Fatal(err)
	}
	// A second approved default replaces the first as the only default.
	second := e.brand(t, ent.ID, "İkinci", true, core.BrandingApproved)
	list, _ := e.svc.EntityBranding(e.ctx, ent.ID)
	defaults := 0
	for _, b := range list {
		if b.IsDefault {
			defaults++
			if b.ID != second.ID {
				t.Fatal("old default kept")
			}
		}
	}
	if defaults != 1 {
		t.Fatal("defaults", defaults)
	}
	// Editing sends back to review.
	upd, err := e.svc.UpdateBranding(e.ctx, ent.ID, second.ID, BrandingInput{DisplayName: "İkinci Marka", IsDefault: true})
	if err != nil || upd.Status != core.BrandingPending || upd.ReviewedAt != nil {
		t.Fatal(upd, err)
	}
	other := e.entity(t, core.EntityPending)
	if _, err := e.svc.UpdateBranding(e.ctx, other.ID, second.ID, BrandingInput{DisplayName: "x"}); !errors.Is(err, core.ErrNotFound) {
		t.Fatal(err)
	}
}

func TestDocuments(t *testing.T) {
	e := newEnv(t)
	ent := e.entity(t, core.EntityPending)
	sum := strings.Repeat("ab", 32)
	if _, err := e.svc.AddDocument(e.ctx, ent.ID, DocumentInput{Kind: "passport", FileName: "a.pdf", MimeType: "application/pdf", SHA256: sum, SizeBytes: 10}); !fieldErr(err, "kind") {
		t.Fatal(err)
	}
	if _, err := e.svc.AddDocument(e.ctx, ent.ID, DocumentInput{Kind: core.DocTaxCertificate, FileName: "a.exe", MimeType: "application/x-msdownload", SHA256: "zz", SizeBytes: 0}); !fieldErr(err, "mime_type") || !fieldErr(err, "sha256") || !fieldErr(err, "size_bytes") {
		t.Fatal(err)
	}
	d, err := e.svc.AddDocument(e.ctx, ent.ID, DocumentInput{Kind: core.DocTaxCertificate, FileName: "vergi_levhasi.pdf", MimeType: "application/pdf", SHA256: strings.ToUpper(sum), SizeBytes: 1024})
	if err != nil || d.SHA256 != sum || d.UploadedBy != "admin-1" {
		t.Fatal(d, err)
	}
	docs, _ := e.svc.Documents(e.ctx, ent.ID)
	if len(docs) != 1 {
		t.Fatal(docs)
	}
}

// ---------------------------------------------------------------- seed and stats

func TestSeedDemo(t *testing.T) {
	e := newEnv(t)
	if err := e.svc.SeedDemo(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := e.svc.SeedDemo(context.Background()); err != nil { // idempotent
		t.Fatal(err)
	}
	st, err := e.svc.Stats(e.ctx)
	if err != nil {
		t.Fatal(err)
	}
	if st.Entities["verified"] != 2 || st.Entities["in_review"] != 1 || st.Entities["rejected"] != 1 || st.Entities["suspended"] != 0 {
		t.Fatalf("entities %v", st.Entities)
	}
	if st.Numbers["active"] < 5 || st.Numbers["pending_verification"] < 3 || st.Branding["approved"] != 3 || st.Branding["pending_review"] != 2 {
		t.Fatalf("numbers %v branding %v", st.Numbers, st.Branding)
	}
	if e.notif.count(core.EventEntityStatusChanged) != 0 {
		t.Fatal("seed must not publish events")
	}
	if len(e.acc.users) != 3 {
		t.Fatal("demo users", len(e.acc.users))
	}
	for _, c := range []struct {
		tn      string
		attest  core.Attest
		display string
		reason  string
	}{
		{"+908502220444", core.AttestA, "Anadolu Katılım", "Müşteri hizmetleri"},
		{"02123350050", core.AttestB, "Anadolu Katılım Güvenlik", "Kart güvenlik bildirimi"},
		{"4440724", core.AttestA, "Anadolu Katılım", "Müşteri hizmetleri"},
		{"+908503330000", core.AttestA, "Hızlıyol Kargo", "Kargonuz yola çıktı"},
		{"05301112233", core.AttestB, "Hızlıyol Kargo", "Kargonuz yola çıktı"}, // pending override → default
		{"+908504440000", core.AttestC, "", ""},
		{"+908509990000", core.AttestC, "", ""},
	} {
		r, err := e.svc.Lookup(e.ctx, c.tn)
		if err != nil || r.Attest != c.attest || r.DisplayName != c.display || r.CallReason != c.reason {
			t.Errorf("%s: %+v %v", c.tn, r, err)
		}
	}
	for _, d := range demoEntities() {
		if !core.ValidVKN(d.in.VKN) {
			t.Errorf("demo VKN %s invalid", d.in.VKN)
		}
	}
}
