package reputation

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// fakeDir is an in-memory core.EntityDirectory.
type fakeDir struct {
	ents map[string]core.Entity
	nums []core.Number
}

func (f *fakeDir) GetEntity(_ context.Context, id string) (core.Entity, error) {
	if e, ok := f.ents[id]; ok {
		return e, nil
	}
	return core.Entity{}, core.Errorf(core.ErrNotFound, "entity %s", id)
}

func (f *fakeDir) NumberOwner(_ context.Context, tn string) (core.Number, core.Entity, error) {
	for _, n := range f.nums {
		if n.Status != core.NumberReleased && n.Contains(tn) {
			return n, f.ents[n.EntityID], nil
		}
	}
	return core.Number{}, core.Entity{}, core.Errorf(core.ErrNotFound, "number %s", tn)
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

func (f *fakeDir) ApprovedBranding(context.Context, core.Number) (core.Branding, bool, error) {
	return core.Branding{}, false, nil
}

// Test fixtures: e1 verified with an active single number and a range,
// e2 verified with one active number, e3 pending.
const (
	tnBank   = "+908501112233" // e1, active
	tnRange0 = "+902125550100" // e1 range start
	tnRange1 = "+902125550101"
	tnRangeE = "+902125550199"
	tnShop   = "+904441234" // e2, active
	tnNew    = "+903125550000"
	tnSpam   = "+908503334455" // unregistered
)

func newFakeDir() *fakeDir {
	return &fakeDir{
		ents: map[string]core.Entity{
			"e1": {ID: "e1", TradeName: "Örnek Bank", Status: core.EntityVerified},
			"e2": {ID: "e2", TradeName: "Örnek Mağaza", Status: core.EntityVerified},
			"e3": {ID: "e3", TradeName: "Yeni Şirket", Status: core.EntityPending},
		},
		nums: []core.Number{
			{ID: "n1", EntityID: "e1", RangeStart: tnBank, RangeEnd: tnBank, Count: 1, Status: core.NumberActive, UseCase: core.UseCustomerService},
			{ID: "n2", EntityID: "e1", RangeStart: tnRange0, RangeEnd: tnRangeE, Count: 100, Status: core.NumberActive, UseCase: core.UseMarketing},
			{ID: "n3", EntityID: "e2", RangeStart: tnShop, RangeEnd: tnShop, Count: 1, Status: core.NumberActive, UseCase: core.UseDelivery},
			{ID: "n4", EntityID: "e3", RangeStart: tnNew, RangeEnd: tnNew, Count: 1, Status: core.NumberPending, UseCase: core.UseOther},
		},
	}
}

type capNotifier struct {
	mu     sync.Mutex
	events []core.Event
}

func (c *capNotifier) Notify(_ context.Context, e core.Event) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, e)
	return nil
}

func (c *capNotifier) all() []core.Event {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]core.Event(nil), c.events...)
}

type testEnv struct {
	svc   *Service
	dir   *fakeDir
	notif *capNotifier
	now   time.Time
	mu    sync.Mutex
}

func (e *testEnv) setNow(t time.Time) { e.mu.Lock(); e.now = t; e.mu.Unlock() }
func (e *testEnv) clock() time.Time   { e.mu.Lock(); defer e.mu.Unlock(); return e.now }

var t0 = time.Date(2026, 11, 7, 12, 0, 0, 0, time.UTC)

func newEnv(t *testing.T) *testEnv {
	t.Helper()
	ctx := context.Background()
	base, err := platform.NewTestDeps(ctx, Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { base.DB.Close() })
	env := &testEnv{dir: newFakeDir(), notif: &capNotifier{}, now: t0}
	base.Clock = env.clock
	svc, err := New(Deps{Base: base, Notifier: env.notif, Directory: env.dir})
	if err != nil {
		t.Fatal(err)
	}
	env.svc = svc
	return env
}

// pattern generates n events for tn spread over the past `hours` hours.
type pattern struct {
	n          int
	hours      int
	answerRate float64 // fraction answered
	shortRate  float64 // fraction of answered under 6 s
	uniqueDest bool
	verstat    core.Verstat
}

func genRows(tn string, p pattern, now time.Time) []EventInput {
	out := make([]EventInput, 0, p.n)
	answered := int(float64(p.n) * p.answerRate)
	short := int(float64(answered) * p.shortRate)
	for i := 0; i < p.n; i++ {
		dest := "+905320000001"
		if p.uniqueDest {
			dest = "+90532" + pad7(i)
		}
		e := EventInput{OrigTN: tn, DestTN: dest, Disposition: "no_answer", Verstat: string(p.verstat),
			StartedAt: now.Add(-time.Duration(i%max(p.hours, 1))*time.Hour - time.Minute).Format(time.RFC3339)}
		if i < answered {
			e.Disposition, e.DurationSec = "answered", 120
			if i < short {
				e.DurationSec = 3
			}
		}
		out = append(out, e)
	}
	return out
}

func pad7(i int) string {
	s := "0000000" + itoa(i)
	return s[len(s)-7:]
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	var b []byte
	for i > 0 {
		b = append([]byte{byte('0' + i%10)}, b...)
		i /= 10
	}
	return string(b)
}

func mustIngest(t *testing.T, s *Service, rows []EventInput) IngestResult {
	t.Helper()
	res, err := s.IngestEvents(context.Background(), "carrier-1", rows)
	if err != nil {
		t.Fatal(err)
	}
	if res.Rejected != 0 {
		t.Fatalf("unexpected rejections: %+v", res.Errors[:min(3, len(res.Errors))])
	}
	return res
}

func factor(t *testing.T, sc core.Score, code string) core.Factor {
	t.Helper()
	f, ok := factorByCode(sc.Factors, code)
	if !ok {
		t.Fatalf("factor %s missing", code)
	}
	return f
}
