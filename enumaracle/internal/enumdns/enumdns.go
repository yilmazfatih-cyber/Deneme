// Package enumdns serves the operator's ENUM zone (RFC 6116) over UDP and TCP.
// Each number in the zone answers NAPTR (E2U+sip with a verstat parameter) and
// a TXT record carrying verification and reputation data from core.LookupService.
package enumdns

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/miekg/dns"
	"github.com/prometheus/client_golang/prometheus"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

// Deps are the dependencies of the DNS server.
type Deps struct {
	Base   platform.Deps
	Lookup core.LookupService
}

// Service is the ENUM DNS server. It has no tables and no HTTP routes.
type Service struct {
	base    platform.Deps
	log     *slog.Logger
	lookup  core.LookupService
	zone    string // canonical (lower-case, fully qualified) zone apex
	ns      string // ns1.<zone>
	ttl     uint32
	serial  uint32
	queries *prometheus.CounterVec
	latency *prometheus.HistogramVec

	wg sync.WaitGroup
}

// maxTXT is the maximum length of one TXT character-string (RFC 1035 §3.3).
const maxTXT = 255

// New validates the configuration and registers the DNS metrics on Base.Metrics.
func New(d Deps) (*Service, error) {
	if d.Lookup == nil {
		return nil, errors.New("enumdns: Lookup is required")
	}
	zone := dns.CanonicalName(strings.TrimSpace(d.Base.Cfg.ENUMZone))
	if zone == "." || zone == "" {
		return nil, errors.New("enumdns: ENUMZone must not be empty or the root zone")
	}
	if _, ok := dns.IsDomainName(zone); !ok {
		return nil, fmt.Errorf("enumdns: invalid ENUMZone %q", d.Base.Cfg.ENUMZone)
	}
	log := d.Base.Log
	if log == nil {
		log = slog.New(slog.DiscardHandler)
	}
	ttl := uint32(d.Base.Cfg.LookupTTL / time.Second)
	if ttl < 1 {
		ttl = 1
	}
	s := &Service{
		base: d.Base, log: log, lookup: d.Lookup, zone: zone, ns: "ns1." + zone, ttl: ttl,
		serial: uint32(d.Base.Now().Unix()),
	}
	queries := prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "enumaracle_dns_queries_total",
		Help: "ENUM DNS queries by query type and response code.",
	}, []string{"qtype", "rcode"})
	latency := prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "enumaracle_dns_query_duration_seconds",
		Help:    "ENUM DNS query handling latency by query type.",
		Buckets: []float64{.0001, .00025, .0005, .001, .0025, .005, .01, .025, .05, .1, .25, 1},
	}, []string{"qtype"})
	s.queries = register(d.Base.Metrics, queries)
	s.latency = register(d.Base.Metrics, latency)
	return s, nil
}

// register registers c, reusing an already registered identical collector.
func register[T prometheus.Collector](reg *prometheus.Registry, c T) T {
	if reg == nil {
		return c
	}
	if err := reg.Register(c); err != nil {
		var are prometheus.AlreadyRegisteredError
		if errors.As(err, &are) {
			if existing, ok := are.ExistingCollector.(T); ok {
				return existing
			}
		}
	}
	return c
}

// Zone returns the canonical zone apex served.
func (s *Service) Zone() string { return s.zone }

// Start listens on Cfg.DNSAddr (UDP and TCP) and blocks until ctx is done,
// then shuts both servers down and returns nil. Bind errors are returned
// immediately. An empty DNSAddr disables the server (returns nil at once).
func (s *Service) Start(ctx context.Context) error {
	if s.base.Cfg.DNSAddr == "" {
		return nil
	}
	udp, tcp, err := s.ListenAndServe(ctx, s.base.Cfg.DNSAddr)
	if err != nil {
		return err
	}
	s.log.Info("enum dns listening", "udp", udp.String(), "tcp", tcp.String(), "zone", s.zone)
	<-ctx.Done()
	s.Wait()
	return nil
}

// Wait blocks until every server started by ListenAndServe has shut down.
func (s *Service) Wait() { s.wg.Wait() }

// Handler returns the dns.Handler answering for the zone.
func (s *Service) Handler() dns.Handler { return dns.HandlerFunc(s.ServeDNS) }

// ListenAndServe binds addr over UDP and TCP and serves until ctx is done.
// It returns the bound addresses once both servers are running. With port 0
// it tries to use the same port number for TCP as the one picked for UDP.
func (s *Service) ListenAndServe(ctx context.Context, addr string) (udpAddr, tcpAddr net.Addr, err error) {
	pc, err := net.ListenPacket("udp", addr)
	if err != nil {
		return nil, nil, fmt.Errorf("enumdns: udp listen %s: %w", addr, err)
	}
	host, port, _ := net.SplitHostPort(addr)
	tcpTarget := addr
	if port == "0" {
		tcpTarget = net.JoinHostPort(host, strconv.Itoa(pc.LocalAddr().(*net.UDPAddr).Port))
	}
	l, err := net.Listen("tcp", tcpTarget)
	if err != nil && tcpTarget != addr {
		l, err = net.Listen("tcp", addr)
	}
	if err != nil {
		pc.Close()
		return nil, nil, fmt.Errorf("enumdns: tcp listen %s: %w", addr, err)
	}
	h := s.Handler()
	servers := []*dns.Server{
		{PacketConn: pc, Handler: h, ReadTimeout: 2 * time.Second},
		{Listener: l, Handler: h, ReadTimeout: 5 * time.Second, WriteTimeout: 5 * time.Second,
			IdleTimeout: func() time.Duration { return 10 * time.Second }},
	}
	for _, srv := range servers {
		started := make(chan struct{})
		srv.NotifyStartedFunc = func() { close(started) }
		failed := make(chan error, 1)
		s.wg.Add(1)
		go func(srv *dns.Server) {
			defer s.wg.Done()
			if err := srv.ActivateAndServe(); err != nil {
				failed <- err
			}
		}(srv)
		select {
		case <-started:
		case err := <-failed:
			for _, o := range servers {
				_ = o.Shutdown()
			}
			pc.Close()
			l.Close()
			return nil, nil, fmt.Errorf("enumdns: serve: %w", err)
		}
	}
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		<-ctx.Done()
		sctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		for _, srv := range servers {
			if err := srv.ShutdownContext(sctx); err != nil {
				s.log.Warn("enum dns shutdown", "err", err)
			}
		}
	}()
	return pc.LocalAddr(), l.Addr(), nil
}

// ServeDNS answers one query. It is safe for concurrent use.
func (s *Service) ServeDNS(w dns.ResponseWriter, r *dns.Msg) {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	m := s.Answer(ctx, r)
	qtype := "none"
	if len(r.Question) > 0 {
		qtype = qtypeLabel(r.Question[0].Qtype)
	}
	if isUDP(w) {
		size := dns.MinMsgSize
		if opt := r.IsEdns0(); opt != nil {
			size = min(int(opt.UDPSize()), dns.DefaultMsgSize)
		}
		m.Truncate(size)
	}
	if err := w.WriteMsg(m); err != nil {
		s.log.Debug("enum dns write", "err", err)
	}
	s.queries.WithLabelValues(qtype, rcodeLabel(m.Rcode)).Inc()
	s.latency.WithLabelValues(qtype).Observe(time.Since(start).Seconds())
}

func isUDP(w dns.ResponseWriter) bool {
	if a := w.LocalAddr(); a != nil {
		return a.Network() == "udp"
	}
	return false
}

// Answer builds the response to r without writing it (no truncation applied).
func (s *Service) Answer(ctx context.Context, r *dns.Msg) *dns.Msg {
	m := new(dns.Msg)
	m.SetReply(r)
	m.RecursionAvailable = false
	m.Authoritative = false

	// EDNS(0) passthrough: echo an OPT record with our payload size and the DO bit.
	if opt := r.IsEdns0(); opt != nil {
		size := opt.UDPSize()
		if size < dns.MinMsgSize {
			size = dns.MinMsgSize
		}
		if size > dns.DefaultMsgSize {
			size = dns.DefaultMsgSize
		}
		m.SetEdns0(size, opt.Do())
		if opt.Version() != 0 {
			m.Rcode = dns.RcodeBadVers
			return m
		}
	}
	if r.Opcode != dns.OpcodeQuery {
		m.Rcode = dns.RcodeNotImplemented
		return m
	}
	if len(r.Question) != 1 {
		m.Rcode = dns.RcodeFormatError
		return m
	}
	q := r.Question[0]
	qname := dns.CanonicalName(q.Name)
	if (q.Qclass != dns.ClassINET && q.Qclass != dns.ClassANY) || !dns.IsSubDomain(s.zone, qname) {
		m.Rcode = dns.RcodeRefused
		return m
	}
	switch q.Qtype {
	case dns.TypeAXFR, dns.TypeIXFR:
		m.Rcode = dns.RcodeRefused
		return m
	}
	m.Authoritative = true

	switch qname {
	case s.zone:
		switch q.Qtype {
		case dns.TypeSOA:
			m.Answer = append(m.Answer, s.soa())
		case dns.TypeNS:
			m.Answer = append(m.Answer, s.nsRR())
		case dns.TypeANY:
			m.Answer = append(m.Answer, s.soa(), s.nsRR())
		default:
			m.Ns = append(m.Ns, s.soa())
		}
		return m
	case s.ns:
		// The name server name exists but carries no records we serve.
		m.Ns = append(m.Ns, s.soa())
		return m
	}

	tn, ok := s.ParseName(qname)
	if !ok {
		return s.nxdomain(m)
	}
	res, err := s.lookup.Lookup(ctx, tn)
	if err != nil && !errors.Is(err, core.ErrNotFound) {
		s.log.Warn("enum dns lookup", "tn", tn, "err", err)
		m.Authoritative = false
		m.Rcode = dns.RcodeServerFailure
		return m
	}
	if err != nil {
		res = core.LookupResult{TN: tn, Score: -1, Label: core.LabelUnknown}
	}
	hasNAPTR := res.Found
	hasTXT := res.Found || res.Score >= 0
	if !hasNAPTR && !hasTXT {
		return s.nxdomain(m)
	}
	if (q.Qtype == dns.TypeNAPTR || q.Qtype == dns.TypeANY) && hasNAPTR {
		m.Answer = append(m.Answer, s.naptr(q.Name, tn, res))
	}
	if (q.Qtype == dns.TypeTXT || q.Qtype == dns.TypeANY) && hasTXT {
		m.Answer = append(m.Answer, s.txt(q.Name, res))
	}
	if len(m.Answer) == 0 {
		m.Ns = append(m.Ns, s.soa()) // NODATA
	}
	return m
}

func (s *Service) nxdomain(m *dns.Msg) *dns.Msg {
	m.Rcode = dns.RcodeNameError
	m.Ns = append(m.Ns, s.soa())
	return m
}

// ParseName converts an ENUM owner name inside the zone to an E.164 number
// ("7.6.5.4.3.2.1.2.3.5.0.9.<zone>" -> "+905321234567"). Every label must be
// exactly one decimal digit and the result must be a valid E.164 number.
func (s *Service) ParseName(qname string) (string, bool) {
	qname = dns.CanonicalName(qname)
	if !strings.HasSuffix(qname, "."+s.zone) {
		return "", false
	}
	rel := strings.TrimSuffix(qname, "."+s.zone)
	labels := strings.Split(rel, ".")
	if len(labels) < 1 || len(labels) > 15 {
		return "", false
	}
	digits := make([]byte, len(labels))
	for i, l := range labels {
		if len(l) != 1 || l[0] < '0' || l[0] > '9' {
			return "", false
		}
		digits[len(labels)-1-i] = l[0]
	}
	tn := "+" + string(digits)
	norm, err := core.NormalizeTN(tn)
	if err != nil || norm != tn {
		return "", false
	}
	return tn, true
}

// NameFor returns the ENUM owner name of an E.164 number within the zone.
func (s *Service) NameFor(tn string) string { return ENUMName(tn, s.zone) }

// ENUMName returns the ENUM owner name of tn (E.164) under zone.
func ENUMName(tn, zone string) string {
	d := core.Digits(tn)
	var b strings.Builder
	for i := len(d) - 1; i >= 0; i-- {
		b.WriteByte(d[i])
		b.WriteByte('.')
	}
	b.WriteString(dns.Fqdn(zone))
	return b.String()
}

func (s *Service) hdr(name string, t uint16) dns.RR_Header {
	return dns.RR_Header{Name: name, Rrtype: t, Class: dns.ClassINET, Ttl: s.ttl}
}

func (s *Service) soa() dns.RR {
	return &dns.SOA{Hdr: s.hdr(s.zone, dns.TypeSOA), Ns: s.ns, Mbox: "hostmaster." + s.zone,
		Serial: s.serial, Refresh: 3600, Retry: 600, Expire: 86400, Minttl: s.ttl}
}

func (s *Service) nsRR() dns.RR {
	return &dns.NS{Hdr: s.hdr(s.zone, dns.TypeNS), Ns: s.ns}
}

func (s *Service) naptr(owner, tn string, res core.LookupResult) dns.RR {
	verstat := core.VerstatNone
	if res.Verified {
		verstat = core.VerstatPassed
	}
	return &dns.NAPTR{Hdr: s.hdr(owner, dns.TypeNAPTR), Order: 100, Preference: 10,
		Flags: "u", Service: "E2U+sip",
		Regexp:      "!^.*$!sip:" + tn + "@" + s.base.Cfg.SIPDomain + ";user=phone;verstat=" + string(verstat) + "!",
		Replacement: "."}
}

func (s *Service) txt(owner string, res core.LookupResult) dns.RR {
	return &dns.TXT{Hdr: s.hdr(owner, dns.TypeTXT), Txt: []string{TXTValue(res)}}
}

// TXTValue renders the TXT string of a lookup result:
// "v=enm1;verified=1;attest=A;score=87;label=clean;name=<pct>;reason=<pct>".
// attest, name and reason are omitted when empty. The result never exceeds 255
// bytes: the call reason, then the display name, are shortened rune by rune.
func TXTValue(res core.LookupResult) string {
	label := res.Label
	if label == "" {
		label = core.LabelUnknown
	}
	verified := "0"
	if res.Verified {
		verified = "1"
	}
	prefix := "v=enm1;verified=" + verified
	if res.Attest != "" {
		prefix += ";attest=" + PercentEncode(string(res.Attest))
	}
	prefix += ";score=" + strconv.Itoa(res.Score) + ";label=" + PercentEncode(string(label))
	name, reason := res.DisplayName, res.CallReason
	for {
		v := prefix
		if name != "" {
			v += ";name=" + PercentEncode(name)
		}
		if reason != "" {
			v += ";reason=" + PercentEncode(reason)
		}
		if len(v) <= maxTXT {
			return v
		}
		switch {
		case reason != "":
			reason = dropLastRune(reason)
		case name != "":
			name = dropLastRune(name)
		default:
			return v[:maxTXT]
		}
	}
}

func dropLastRune(s string) string {
	_, n := utf8.DecodeLastRuneInString(s)
	return s[:len(s)-n]
}

// PercentEncode encodes every byte of the UTF-8 string except RFC 3986
// unreserved characters (A-Z a-z 0-9 - . _ ~) as %XX with upper-case hex.
func PercentEncode(s string) string {
	const hex = "0123456789ABCDEF"
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '.' || c == '_' || c == '~' {
			b.WriteByte(c)
			continue
		}
		b.WriteByte('%')
		b.WriteByte(hex[c>>4])
		b.WriteByte(hex[c&0xF])
	}
	return b.String()
}

func qtypeLabel(t uint16) string {
	switch t {
	case dns.TypeNAPTR, dns.TypeTXT, dns.TypeANY, dns.TypeSOA, dns.TypeNS, dns.TypeA, dns.TypeAAAA,
		dns.TypeAXFR, dns.TypeIXFR:
		return dns.TypeToString[t]
	}
	return "other"
}

func rcodeLabel(rc int) string {
	if s, ok := dns.RcodeToString[rc]; ok {
		return s
	}
	return strconv.Itoa(rc)
}
