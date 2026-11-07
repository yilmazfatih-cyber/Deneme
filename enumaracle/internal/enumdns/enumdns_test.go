package enumdns

import (
	"context"
	"errors"
	"net"
	"strings"
	"testing"
	"time"

	"github.com/miekg/dns"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

type fakeLookup map[string]core.LookupResult

func (f fakeLookup) Lookup(_ context.Context, tn string) (core.LookupResult, error) {
	if tn == "+905009999999" {
		return core.LookupResult{}, errors.New("db down")
	}
	if r, ok := f[tn]; ok {
		r.TN = tn
		return r, nil
	}
	return core.LookupResult{TN: tn, Score: -1, Label: core.LabelUnknown}, nil
}

var lookups = fakeLookup{
	"+905321234567": {Found: true, Verified: true, Attest: core.AttestA, Score: 87, Label: core.LabelClean,
		DisplayName: "Örnek Bankası Çağrı", CallReason: "Kart işlemi; onay=gerekli"},
	"+902121234567": {Found: true, Verified: false, Attest: core.AttestC, Score: -1, Label: core.LabelUnknown},
	"+905551112233": {Found: false, Score: 22, Label: core.LabelSpam},
}

func newTestService(t *testing.T) (*Service, platform.Deps) {
	t.Helper()
	base := platform.Deps{Cfg: platform.TestConfig(), Metrics: nil, Clock: core.SystemClock}
	base.Cfg.LookupTTL = 30 * time.Second
	d, err := platform.NewTestDeps(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	base.Metrics = d.Metrics
	base.Log = d.Log
	s, err := New(Deps{Base: base, Lookup: lookups})
	if err != nil {
		t.Fatal(err)
	}
	return s, base
}

func startServer(t *testing.T) (*Service, platform.Deps, string, string) {
	t.Helper()
	s, base := newTestService(t)
	ctx, cancel := context.WithCancel(context.Background())
	udp, tcp, err := s.ListenAndServe(ctx, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { cancel(); s.Wait() })
	return s, base, udp.String(), tcp.String()
}

func query(t *testing.T, network, addr, name string, qtype uint16, edns bool) *dns.Msg {
	t.Helper()
	m := new(dns.Msg)
	m.SetQuestion(name, qtype)
	if edns {
		m.SetEdns0(4096, true)
	}
	c := &dns.Client{Net: network, Timeout: 3 * time.Second}
	r, _, err := c.Exchange(m, addr)
	if err != nil {
		t.Fatalf("%s %s %s: %v", network, name, dns.TypeToString[qtype], err)
	}
	return r
}

func TestENUMName(t *testing.T) {
	s, _ := newTestService(t)
	name := s.NameFor("+905321234567")
	if name != "7.6.5.4.3.2.1.2.3.5.0.9.e164.test." {
		t.Fatal(name)
	}
	if tn, ok := s.ParseName(strings.ToUpper(name)); !ok || tn != "+905321234567" {
		t.Fatal(tn, ok)
	}
	for _, bad := range []string{"a.6.5.4.3.2.1.2.3.5.0.9.e164.test.", "76.5.4.3.2.1.2.3.5.0.9.e164.test.",
		"7.6.5.e164.test.", "0.9.0.e164.test.", "x.e164.test."} {
		if _, ok := s.ParseName(bad); ok {
			t.Errorf("%s must not parse", bad)
		}
	}
}

func TestVerifiedNumberUDPAndTCP(t *testing.T) {
	s, _, udp, tcp := startServer(t)
	name := s.NameFor("+905321234567")
	for _, c := range []struct{ net, addr string }{{"udp", udp}, {"tcp", tcp}} {
		r := query(t, c.net, c.addr, name, dns.TypeNAPTR, false)
		if r.Rcode != dns.RcodeSuccess || !r.Authoritative || len(r.Answer) != 1 {
			t.Fatalf("%s: %v", c.net, r)
		}
		n, ok := r.Answer[0].(*dns.NAPTR)
		if !ok {
			t.Fatalf("%s: %T", c.net, r.Answer[0])
		}
		want := "!^.*$!sip:+905321234567@sip.test;user=phone;verstat=TN-Validation-Passed!"
		if n.Order != 100 || n.Preference != 10 || n.Flags != "u" || n.Service != "E2U+sip" ||
			n.Regexp != want || n.Replacement != "." || n.Hdr.Ttl != 30 {
			t.Fatalf("%s: %v", c.net, n)
		}
		r = query(t, c.net, c.addr, name, dns.TypeTXT, false)
		if r.Rcode != dns.RcodeSuccess || len(r.Answer) != 1 {
			t.Fatalf("%s: %v", c.net, r)
		}
		txt := strings.Join(r.Answer[0].(*dns.TXT).Txt, "")
		wantTXT := "v=enm1;verified=1;attest=A;score=87;label=clean;name=%C3%96rnek%20Bankas%C4%B1%20%C3%87a%C4%9Fr%C4%B1;reason=Kart%20i%C5%9Flemi%3B%20onay%3Dgerekli"
		if txt != wantTXT {
			t.Fatalf("%s TXT:\n got %s\nwant %s", c.net, txt, wantTXT)
		}
		r = query(t, c.net, c.addr, name, dns.TypeANY, false)
		if len(r.Answer) != 2 {
			t.Fatalf("%s ANY: %v", c.net, r)
		}
	}
}

func TestUnverifiedNumberNAPTRNoValidation(t *testing.T) {
	s, _, udp, _ := startServer(t)
	r := query(t, "udp", udp, s.NameFor("+902121234567"), dns.TypeANY, false)
	if r.Rcode != dns.RcodeSuccess || len(r.Answer) != 2 {
		t.Fatal(r)
	}
	for _, rr := range r.Answer {
		switch v := rr.(type) {
		case *dns.NAPTR:
			if !strings.Contains(v.Regexp, "verstat=No-TN-Validation") {
				t.Fatal(v.Regexp)
			}
		case *dns.TXT:
			if v.Txt[0] != "v=enm1;verified=0;attest=C;score=-1;label=unknown" {
				t.Fatal(v.Txt[0])
			}
		}
	}
}

func TestUnknownNumberNXDOMAIN(t *testing.T) {
	s, _, udp, tcp := startServer(t)
	for _, c := range []struct{ net, addr string }{{"udp", udp}, {"tcp", tcp}} {
		r := query(t, c.net, c.addr, s.NameFor("+905441112233"), dns.TypeNAPTR, false)
		if r.Rcode != dns.RcodeNameError || len(r.Answer) != 0 || len(r.Ns) != 1 {
			t.Fatalf("%s: %v", c.net, r)
		}
		if _, ok := r.Ns[0].(*dns.SOA); !ok {
			t.Fatalf("%s: authority %T", c.net, r.Ns[0])
		}
	}
	// Names inside the zone that are not numbers.
	for _, name := range []string{"foo.e164.test.", "1.2.e164.test.", "12.3.e164.test."} {
		r := query(t, "udp", udp, name, dns.TypeTXT, false)
		if r.Rcode != dns.RcodeNameError || len(r.Ns) != 1 {
			t.Fatalf("%s: %v", name, r)
		}
	}
}

func TestReputationOnlyTXT(t *testing.T) {
	s, _, udp, _ := startServer(t)
	name := s.NameFor("+905551112233")
	r := query(t, "udp", udp, name, dns.TypeANY, false)
	if r.Rcode != dns.RcodeSuccess || len(r.Answer) != 1 {
		t.Fatal(r)
	}
	if txt := r.Answer[0].(*dns.TXT).Txt[0]; txt != "v=enm1;verified=0;score=22;label=spam" {
		t.Fatal(txt)
	}
	// NAPTR for a reputation-only number is NODATA (NOERROR + SOA).
	r = query(t, "udp", udp, name, dns.TypeNAPTR, false)
	if r.Rcode != dns.RcodeSuccess || len(r.Answer) != 0 || len(r.Ns) != 1 {
		t.Fatal(r)
	}
}

func TestOtherZoneRefusedAndApex(t *testing.T) {
	_, _, udp, tcp := startServer(t)
	r := query(t, "udp", udp, "7.6.5.4.3.2.1.2.3.5.0.9.e164.arpa.", dns.TypeNAPTR, false)
	if r.Rcode != dns.RcodeRefused {
		t.Fatal(r)
	}
	r = query(t, "tcp", tcp, "example.com.", dns.TypeA, false)
	if r.Rcode != dns.RcodeRefused {
		t.Fatal(r)
	}
	r = query(t, "udp", udp, "E164.Test.", dns.TypeSOA, false)
	if r.Rcode != dns.RcodeSuccess || len(r.Answer) != 1 {
		t.Fatal(r)
	}
	soa := r.Answer[0].(*dns.SOA)
	if soa.Ns != "ns1.e164.test." || soa.Hdr.Ttl != 30 {
		t.Fatal(soa)
	}
	r = query(t, "udp", udp, "e164.test.", dns.TypeNS, false)
	if len(r.Answer) != 1 || r.Answer[0].(*dns.NS).Ns != "ns1.e164.test." {
		t.Fatal(r)
	}
	r = query(t, "udp", udp, "e164.test.", dns.TypeAXFR, false)
	if r.Rcode != dns.RcodeRefused {
		t.Fatal(r)
	}
}

func TestEDNSAndServfail(t *testing.T) {
	s, _, udp, _ := startServer(t)
	r := query(t, "udp", udp, s.NameFor("+905321234567"), dns.TypeTXT, true)
	opt := r.IsEdns0()
	if opt == nil || opt.UDPSize() != 4096 || !opt.Do() {
		t.Fatal(r)
	}
	r = query(t, "udp", udp, s.NameFor("+905009999999"), dns.TypeTXT, false)
	if r.Rcode != dns.RcodeServerFailure || r.IsEdns0() != nil {
		t.Fatal(r)
	}
}

func TestTXTLimitAndEncoding(t *testing.T) {
	long := core.LookupResult{Found: true, Verified: true, Attest: core.AttestB, Score: 100, Label: core.LabelClean,
		DisplayName: strings.Repeat("ş", 32), CallReason: strings.Repeat("ğ", 64)}
	v := TXTValue(long)
	if len(v) > 255 {
		t.Fatal(len(v))
	}
	// The reason is shortened first; here it no longer fits at all, the name stays whole.
	if strings.Count(v, "%C5%9F") != 32 || strings.Contains(v, "reason=") {
		t.Fatal(v)
	}
	long.DisplayName = "Kısa"
	v = TXTValue(long)
	if len(v) > 255 || !strings.Contains(v, ";reason=%C4%9F") || len(v) < 250 {
		t.Fatal(len(v), v)
	}
	if i := strings.LastIndex(v, "%"); i > len(v)-3 {
		t.Fatal("split escape", v)
	}
	if PercentEncode("a b;c=d%~İ") != "a%20b%3Bc%3Dd%25~%C4%B0" {
		t.Fatal(PercentEncode("a b;c=d%~İ"))
	}
}

func TestTruncationOverUDP(t *testing.T) {
	// An oversized answer gets the TC bit at the classic 512-byte UDP limit.
	s, _ := newTestService(t)
	req := new(dns.Msg)
	req.SetQuestion(s.NameFor("+905321234567"), dns.TypeTXT)
	m := s.Answer(context.Background(), req)
	for i := 0; i < 20; i++ {
		m.Answer = append(m.Answer, m.Answer[0])
	}
	m.Truncate(dns.MinMsgSize)
	if !m.Truncated {
		t.Fatal("expected TC")
	}
}

func TestMetricsAndStartStop(t *testing.T) {
	s, base := newTestService(t)
	s.base.Cfg.DNSAddr = "127.0.0.1:0"
	ctx, cancel := context.WithCancel(context.Background())
	started := make(chan error, 1)
	go func() { started <- s.Start(ctx) }()
	udp, _, err := s.ListenAndServe(ctx, "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	query(t, "udp", udp.String(), s.NameFor("+905441112233"), dns.TypeNAPTR, false)
	mfs, err := base.Metrics.Gather()
	if err != nil {
		t.Fatal(err)
	}
	var counted, histo bool
	for _, mf := range mfs {
		switch mf.GetName() {
		case "enumaracle_dns_queries_total":
			for _, m := range mf.GetMetric() {
				l := map[string]string{}
				for _, lp := range m.GetLabel() {
					l[lp.GetName()] = lp.GetValue()
				}
				if l["qtype"] == "NAPTR" && l["rcode"] == "NXDOMAIN" && m.GetCounter().GetValue() == 1 {
					counted = true
				}
			}
		case "enumaracle_dns_query_duration_seconds":
			histo = len(mf.GetMetric()) == 1 && mf.GetMetric()[0].GetHistogram().GetSampleCount() == 1
		}
	}
	if !counted || !histo {
		t.Fatal("metrics missing", counted, histo)
	}
	cancel()
	select {
	case err := <-started:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Start did not return after cancel")
	}
	done := make(chan struct{})
	go func() { s.Wait(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("server did not shut down")
	}
	if c, err := net.DialTimeout("tcp", udp.String(), 200*time.Millisecond); err == nil {
		c.Close()
		// The port may be reused by another process; only fail when our server still answers.
		m := new(dns.Msg)
		m.SetQuestion("e164.test.", dns.TypeSOA)
		if _, _, err := (&dns.Client{Net: "tcp", Timeout: 300 * time.Millisecond}).Exchange(m, udp.String()); err == nil {
			t.Fatal("server still answering after shutdown")
		}
	}
}

func TestStartDisabled(t *testing.T) {
	s, _ := newTestService(t)
	s.base.Cfg.DNSAddr = ""
	if err := s.Start(context.Background()); err != nil {
		t.Fatal(err)
	}
}
