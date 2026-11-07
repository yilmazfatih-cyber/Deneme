package notify

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type fakeClock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *fakeClock) Now() time.Time { c.mu.Lock(); defer c.mu.Unlock(); return c.t }
func (c *fakeClock) Add(d time.Duration) {
	c.mu.Lock()
	c.t = c.t.Add(d)
	c.mu.Unlock()
}

func newTest(t *testing.T) (*Service, *fakeClock, context.Context) {
	t.Helper()
	ctx := context.Background()
	base, err := platform.NewTestDeps(ctx, Migrations)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { base.DB.Close() })
	clk := &fakeClock{t: time.Date(2026, 3, 1, 9, 0, 0, 0, time.UTC)}
	base.Clock = clk.Now
	s, err := New(Deps{Base: base})
	if err != nil {
		t.Fatal(err)
	}
	actx := core.WithPrincipal(ctx, core.Principal{Kind: "user", ID: "u-test"})
	return s, clk, actx
}

type receiver struct {
	srv    *httptest.Server
	mu     sync.Mutex
	got    []*http.Request
	bodies [][]byte
	codes  []int // response codes to return in order; last repeats
}

func newReceiver(t *testing.T, codes ...int) *receiver {
	rc := &receiver{codes: codes}
	rc.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		rc.mu.Lock()
		rc.got = append(rc.got, r)
		rc.bodies = append(rc.bodies, b)
		code := 200
		if len(rc.codes) > 0 {
			i := min(len(rc.got)-1, len(rc.codes)-1)
			code = rc.codes[i]
		}
		rc.mu.Unlock()
		w.WriteHeader(code)
	}))
	t.Cleanup(rc.srv.Close)
	return rc
}

func (rc *receiver) count() int { rc.mu.Lock(); defer rc.mu.Unlock(); return len(rc.got) }

func deliveries(t *testing.T, s *Service, hookID string) []Delivery {
	t.Helper()
	ds, err := s.ListDeliveries(context.Background(), hookID, 100)
	if err != nil {
		t.Fatal(err)
	}
	return ds
}

func TestSignatureVerifiableByReceiver(t *testing.T) {
	s, clk, ctx := newTest(t)
	rc := newReceiver(t, 204)
	hook, secret, err := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL+"/hook", nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(secret, "whsec_") {
		t.Fatal(secret)
	}
	ev := core.Event{Type: core.EventNumberStatusChanged, EntityID: "e1",
		Data: map[string]any{"tn": "+905321234567", "status": "active"}}
	if err := s.Notify(ctx, ev); err != nil {
		t.Fatal(err)
	}
	n, err := s.DeliverDue(ctx)
	if err != nil || n != 1 || rc.count() != 1 {
		t.Fatal(n, err, rc.count())
	}
	req, body := rc.got[0], rc.bodies[0]
	sig := req.Header.Get(HeaderSignature)
	// Receiver-side verification, written independently of Sign.
	parts := strings.Split(sig, ",")
	if len(parts) != 2 || !strings.HasPrefix(parts[0], "t=") || !strings.HasPrefix(parts[1], "v1=") {
		t.Fatal(sig)
	}
	ts := strings.TrimPrefix(parts[0], "t=")
	if ts != strconv.FormatInt(clk.Now().Unix(), 10) {
		t.Fatal("timestamp", ts)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(ts + "." + string(body)))
	if !hmac.Equal([]byte(hex.EncodeToString(mac.Sum(nil))), []byte(strings.TrimPrefix(parts[1], "v1="))) {
		t.Fatal("signature mismatch")
	}
	if req.Header.Get(HeaderEvent) != core.EventNumberStatusChanged || req.Header.Get("Content-Type") != "application/json" {
		t.Fatal(req.Header)
	}
	var got core.Event
	if err := json.Unmarshal(body, &got); err != nil || got.Type != ev.Type || got.EntityID != "e1" || got.ID == "" {
		t.Fatal(string(body), err)
	}
	ds := deliveries(t, s, hook.ID)
	if len(ds) != 1 || ds[0].Status != StatusDelivered || ds[0].Attempt != 1 || ds[0].LastCode != 204 ||
		ds[0].DeliveredAt == nil || ds[0].NextAt != nil || req.Header.Get(HeaderDelivery) != ds[0].ID {
		t.Fatalf("%+v", ds)
	}
	// Nothing left to deliver.
	if n, _ := s.DeliverDue(ctx); n != 0 {
		t.Fatal(n)
	}
}

func TestRetryThenSuccess(t *testing.T) {
	s, clk, ctx := newTest(t)
	rc := newReceiver(t, 500, 200)
	hook, _, err := s.CreateWebhook(ctx, OwnerOperator, "", rc.srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Notify(ctx, core.Event{Type: core.EventDisputeCreated, EntityID: "e9"}); err != nil {
		t.Fatal(err)
	}
	if n, err := s.DeliverDue(ctx); n != 1 || err != nil {
		t.Fatal(n, err)
	}
	d := deliveries(t, s, hook.ID)[0]
	if d.Status != StatusFailed || d.Attempt != 1 || d.LastCode != 500 || d.NextAt == nil ||
		!d.NextAt.Equal(clk.Now().Add(time.Minute)) || d.LastError != "HTTP 500" {
		t.Fatalf("%+v", d)
	}
	clk.Add(59 * time.Second)
	if n, _ := s.DeliverDue(ctx); n != 0 {
		t.Fatal("delivered before backoff", n)
	}
	clk.Add(time.Second)
	if n, err := s.DeliverDue(ctx); n != 1 || err != nil {
		t.Fatal(n, err)
	}
	d = deliveries(t, s, hook.ID)[0]
	if d.Status != StatusDelivered || d.Attempt != 2 || d.LastCode != 200 || rc.count() != 2 {
		t.Fatalf("%+v", d)
	}
}

func TestDeadAfterMaxAttempts(t *testing.T) {
	s, clk, ctx := newTest(t)
	rc := newReceiver(t, 503)
	hook, _, err := s.CreateWebhook(ctx, OwnerOperator, "", rc.srv.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Notify(ctx, core.Event{Type: core.EventCertificateIssued}); err != nil {
		t.Fatal(err)
	}
	want := []time.Duration{time.Minute, 5 * time.Minute, 30 * time.Minute, 2 * time.Hour, 6 * time.Hour}
	for i := 0; i < MaxAttempts; i++ {
		if n, err := s.DeliverDue(ctx); n != 1 || err != nil {
			t.Fatalf("attempt %d: %d %v", i+1, n, err)
		}
		d := deliveries(t, s, hook.ID)[0]
		if d.Attempt != i+1 {
			t.Fatalf("%+v", d)
		}
		if i < len(want) {
			if d.Status != StatusFailed || !d.NextAt.Equal(clk.Now().Add(want[i])) {
				t.Fatalf("attempt %d: %+v", i+1, d)
			}
			clk.Add(want[i])
		} else if d.Status != StatusDead || d.NextAt != nil || d.LastCode != 503 {
			t.Fatalf("expected dead: %+v", d)
		}
	}
	clk.Add(24 * time.Hour)
	if n, _ := s.DeliverDue(ctx); n != 0 || rc.count() != 6 {
		t.Fatal("dead delivery retried", n, rc.count())
	}
}

func TestConnectionErrorRetries(t *testing.T) {
	s, _, ctx := newTest(t)
	rc := newReceiver(t, 200)
	url := rc.srv.URL
	rc.srv.Close() // nothing listens any more
	hook, _, err := s.CreateWebhook(ctx, OwnerOperator, "", url, nil)
	if err != nil {
		t.Fatal(err)
	}
	_ = s.Notify(ctx, core.Event{Type: core.EventDisputeUpdated})
	if n, err := s.DeliverDue(ctx); n != 1 || err != nil {
		t.Fatal(n, err)
	}
	d := deliveries(t, s, hook.ID)[0]
	if d.Status != StatusFailed || d.LastCode != 0 || d.LastError == "" {
		t.Fatalf("%+v", d)
	}
}

func TestFilteringByEntityAndEventType(t *testing.T) {
	s, _, ctx := newTest(t)
	rc := newReceiver(t, 200)
	e1Num, _, _ := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL, []string{core.EventNumberStatusChanged})
	e1All, _, _ := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL, nil)
	e2All, _, _ := s.CreateWebhook(ctx, OwnerEntity, "e2", rc.srv.URL, []string{})
	op, _, _ := s.CreateWebhook(ctx, OwnerOperator, "", rc.srv.URL, nil)
	opRep, _, _ := s.CreateWebhook(ctx, OwnerOperator, "", rc.srv.URL, []string{core.EventReputationLabel})
	gone, _, _ := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL, nil)
	if err := s.DeleteWebhook(ctx, gone.ID, "e1"); err != nil {
		t.Fatal(err)
	}
	events := []core.Event{
		{Type: core.EventNumberStatusChanged, EntityID: "e1"},
		{Type: core.EventBrandingReviewed, EntityID: "e1"},
		{Type: core.EventReputationLabel, EntityID: "e2"},
		{Type: core.EventEntityStatusChanged}, // operator-only
	}
	for _, e := range events {
		if err := s.Notify(ctx, e); err != nil {
			t.Fatal(err)
		}
	}
	want := map[string]int{e1Num.ID: 1, e1All.ID: 2, e2All.ID: 1, op.ID: 4, opRep.ID: 1, gone.ID: 0}
	for id, n := range want {
		if got := len(deliveries(t, s, id)); got != n {
			t.Errorf("webhook %s: got %d deliveries want %d", id, got, n)
		}
	}
	if _, _, err := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL, []string{"bogus.event"}); err == nil {
		t.Fatal("unknown event type accepted")
	}
}

func TestDeletedWebhookPendingDeliveriesDie(t *testing.T) {
	s, _, ctx := newTest(t)
	rc := newReceiver(t, 200)
	hook, _, _ := s.CreateWebhook(ctx, OwnerEntity, "e1", rc.srv.URL, nil)
	_ = s.Notify(ctx, core.Event{Type: core.EventDisputeUpdated, EntityID: "e1"})
	if err := s.DeleteWebhook(ctx, hook.ID, "e2"); err == nil {
		t.Fatal("other entity deleted the webhook")
	}
	if err := s.DeleteWebhook(ctx, hook.ID, "e1"); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.DeliverDue(ctx); n != 0 || rc.count() != 0 {
		t.Fatal("delivered to deleted webhook")
	}
	if d := deliveries(t, s, hook.ID)[0]; d.Status != StatusDead {
		t.Fatalf("%+v", d)
	}
}

func TestEmailOutbox(t *testing.T) {
	s, _, ctx := newTest(t)
	_ = s.Notify(ctx, core.Event{Type: core.EventEntityStatusChanged, EntityID: "e1"}) // no lookup set: skipped
	s.SetEmails(func(_ context.Context, id string) (string, error) {
		if id == "e1" {
			return "iletisim@ornek.com.tr", nil
		}
		return "", core.Errorf(core.ErrNotFound, "entity %s", id)
	})
	if err := s.Notify(ctx, core.Event{Type: core.EventEntityStatusChanged, EntityID: "e1",
		Data: map[string]any{"to_status": "verified", "note": "Belgeler uygun"}}); err != nil {
		t.Fatal(err)
	}
	if err := s.Notify(ctx, core.Event{Type: core.EventDisputeCreated, EntityID: "missing"}); err != nil {
		t.Fatal(err)
	}
	if err := s.Notify(ctx, core.Event{Type: core.EventCertificateIssued}); err != nil { // operator-only
		t.Fatal(err)
	}
	out, err := s.ListOutbox(ctx, 10)
	if err != nil || len(out) != 1 {
		t.Fatal(out, err)
	}
	m := out[0]
	if m.To != "iletisim@ornek.com.tr" || m.Subject != "[Enumaracle] Firma başvurunuzun durumu değişti" ||
		!strings.Contains(m.Body, "to_status: verified") || !strings.Contains(m.Body, "Merhaba") ||
		!strings.Contains(m.Body, "01.03.2026 12:00 (TSİ)") {
		t.Fatalf("%+v", m)
	}
	for _, typ := range EventTypes {
		subj, _ := renderEmail(core.Event{Type: typ}, "Op")
		if subj == "[Enumaracle] Enumaracle bildirimi" {
			t.Errorf("no Turkish subject for %s", typ)
		}
	}
}

func TestValidateURL(t *testing.T) {
	ok := []string{"https://hooks.example.com/x", "http://localhost:8080/h", "http://127.0.0.1:9/h", "https://8.8.8.8/h", "http://[::1]:80/"}
	bad := []string{"", "http://example.com/h", "ftp://x", "https://10.0.0.5/h", "https://192.168.1.1", "https://169.254.169.254/latest",
		"https://user:pw@example.com", "https:///path", "javascript:alert(1)", "http://127.0.0.2/"}
	for _, u := range ok {
		if _, msg := validateURL(u); msg != "" {
			t.Errorf("%s rejected: %s", u, msg)
		}
	}
	for _, u := range bad {
		if _, msg := validateURL(u); msg == "" {
			t.Errorf("%s accepted", u)
		}
	}
	for _, a := range []string{"10.1.2.3", "127.0.0.1", "100.64.0.1", "::1", "fe80::1", "0.0.0.0", "::ffff:192.168.0.1"} {
		if isPublicAddr(netip.MustParseAddr(a)) {
			t.Errorf("%s considered public", a)
		}
	}
	if !isPublicAddr(netip.MustParseAddr("1.1.1.1")) {
		t.Error("1.1.1.1 not public")
	}
}

func TestDialGuardRefusesPrivateResolution(t *testing.T) {
	orig := lookupNetIP
	t.Cleanup(func() { lookupNetIP = orig })
	lookupNetIP = func(_ context.Context, _, host string) ([]netip.Addr, error) {
		return []netip.Addr{netip.MustParseAddr("10.0.0.7")}, nil
	}
	dial := guardedDial(&net.Dialer{Timeout: time.Second})
	// A public-looking host name that resolves to a private address is refused before dialing.
	_, err := dial(context.Background(), "tcp", "hooks.example.com:443")
	if err == nil || !strings.Contains(err.Error(), "özel bir IP") {
		t.Fatal(err)
	}
}

func TestStartWorkerDelivers(t *testing.T) {
	s, _, ctx := newTest(t)
	var hits atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { hits.Add(1) }))
	defer srv.Close()
	if _, _, err := s.CreateWebhook(ctx, OwnerOperator, "", srv.URL, nil); err != nil {
		t.Fatal(err)
	}
	wctx, cancel := context.WithCancel(ctx)
	stopped := make(chan error, 1)
	go func() { stopped <- s.Start(wctx) }()
	defer func() {
		cancel()
		if err := <-stopped; err != nil {
			t.Error(err)
		}
	}()
	_ = s.Notify(ctx, core.Event{Type: core.EventBrandingReviewed})
	deadline := time.Now().Add(5 * time.Second)
	for hits.Load() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if hits.Load() != 1 {
		t.Fatal("worker did not deliver")
	}
}
