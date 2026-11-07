package passport

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math/big"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

func mustKey(t *testing.T) *ecdsa.PrivateKey {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func TestCanonicalJSONRFC8225Example(t *testing.T) {
	// RFC 8225 §9 example claim set, given in non-canonical order.
	type uri struct {
		URI []string `json:"uri"`
	}
	v := struct {
		Orig OrigClaim `json:"orig"`
		IAT  int64     `json:"iat"`
		Dest uri       `json:"dest"`
	}{OrigClaim{"12155551212"}, 1443208345, uri{[]string{"sip:alice@example.com"}}}
	got, err := CanonicalJSON(v)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"dest":{"uri":["sip:alice@example.com"]},"iat":1443208345,"orig":{"tn":"12155551212"}}`
	if string(got) != want {
		t.Fatalf("got  %s\nwant %s", got, want)
	}
	// Header per RFC 8225/8588.
	h, _ := CanonicalJSON(Header{Alg: "ES256", Ppt: "shaken", Typ: "passport", X5U: "https://cert.example.org/passport.cer"})
	if string(h) != `{"alg":"ES256","ppt":"shaken","typ":"passport","x5u":"https://cert.example.org/passport.cer"}` {
		t.Fatalf("header %s", h)
	}
	// Shaken payload order and determinism; no HTML escaping.
	c, _ := NewShaken(core.AttestA, "+905321234567", "+905551112233", 1700000000, "123e4567-e89b-12d3-a456-426655440000")
	c, _ = WithRCD(c, core.RCDClaims{Nam: "Acme & Co <TR>", Crn: "Kargo"})
	a, _ := CanonicalJSON(c)
	b, _ := CanonicalJSON(c)
	if !bytes.Equal(a, b) {
		t.Fatal("not deterministic")
	}
	s := string(a)
	if strings.Contains(s, "\n") || strings.Contains(s, "\": ") || strings.Contains(s, ", \"") {
		t.Fatal("whitespace in canonical JSON")
	}
	order := []string{`"attest"`, `"dest"`, `"iat"`, `"orig"`, `"origid"`, `"rcd"`, `"rcdi"`}
	last := -1
	for _, k := range order {
		i := strings.Index(s, k)
		if i <= last {
			t.Fatalf("key %s out of order in %s", k, s)
		}
		last = i
	}
	if !strings.Contains(s, `"rcd":{"crn":"Kargo","nam":"Acme & Co <TR>"}`) {
		t.Fatalf("rcd not canonical/escaped: %s", s)
	}
	if !strings.Contains(s, `"rcdi":{"/crn":"sha256-`) {
		t.Fatalf("rcdi: %s", s)
	}
}

func TestJWSRoundTripAndTamper(t *testing.T) {
	k := mustKey(t)
	c, err := NewShaken(core.AttestB, "905321234567", "905551112233", time.Now().Unix(), "id-1")
	if err != nil {
		t.Fatal(err)
	}
	jws, err := Sign(k, Header{Ppt: PPTShaken, X5U: "https://x/certs/a.pem"}, c)
	if err != nil {
		t.Fatal(err)
	}
	tok, err := Parse(jws)
	if err != nil {
		t.Fatal(err)
	}
	if err := tok.VerifySignature(&k.PublicKey); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(tok.Claims, c) || tok.Header.Alg != "ES256" || tok.Header.Typ != "passport" {
		t.Fatalf("claims %+v header %+v", tok.Claims, tok.Header)
	}
	if len(tok.Signature) != 64 {
		t.Fatal("raw r||s expected")
	}
	parts := strings.Split(jws, ".")
	// Tamper payload: change attest.
	c2 := c
	c2.Attest = core.AttestA
	pb, _ := CanonicalJSON(c2)
	forged := parts[0] + "." + base64.RawURLEncoding.EncodeToString(pb) + "." + parts[2]
	ft, err := Parse(forged)
	if err != nil {
		t.Fatal(err)
	}
	if ft.VerifySignature(&k.PublicKey) == nil {
		t.Fatal("tampered payload verified")
	}
	// Tamper signature bit.
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	sig[5] ^= 1
	ft, _ = Parse(parts[0] + "." + parts[1] + "." + base64.RawURLEncoding.EncodeToString(sig))
	if ft.VerifySignature(&k.PublicKey) == nil {
		t.Fatal("tampered signature verified")
	}
	// Wrong key.
	if tok.VerifySignature(&mustKey(t).PublicKey) == nil {
		t.Fatal("wrong key verified")
	}
	// alg none / HS256 rejected even with a "valid" structure.
	for _, alg := range []string{"none", "HS256", "es256"} {
		hb, _ := CanonicalJSON(Header{Alg: alg, Ppt: "shaken", Typ: "passport", X5U: "https://x"})
		tt, err := Parse(base64.RawURLEncoding.EncodeToString(hb) + "." + parts[1] + "." + parts[2])
		if err != nil {
			t.Fatal(err)
		}
		if tt.VerifySignature(&k.PublicKey) == nil {
			t.Fatalf("alg %s accepted", alg)
		}
	}
	// Structural rejects.
	bad := []string{"", "a.b", parts[0] + ".." + parts[2], parts[0] + "." + parts[1] + "." + parts[2] + "=",
		strings.Repeat("A", MaxJWSLen+1)}
	dup := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"ES256","alg":"none","x5u":"u"}`))
	bad = append(bad, dup+"."+parts[1]+"."+parts[2])
	crit := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"ES256","crit":["exp"],"x5u":"u"}`))
	bad = append(bad, crit+"."+parts[1]+"."+parts[2])
	for _, b := range bad {
		if _, err := Parse(b); err == nil {
			t.Fatalf("expected parse error for %.40q", b)
		}
	}
	// Non-P256 signing key refused.
	k384, _ := ecdsa.GenerateKey(elliptic.P384(), rand.Reader)
	if _, err := Sign(k384, Header{Ppt: "shaken", X5U: "u"}, c); err == nil {
		t.Fatal("P-384 key accepted")
	}
}

func TestIdentityParseVariants(t *testing.T) {
	const jws = "aaa.bbb.ccc"
	const x5u = "https://cert.example/certs/1.pem"
	cases := []string{
		FormatIdentity(jws, x5u, "shaken"),
		jws + ";info=" + x5u + ";alg=ES256;ppt=shaken",
		jws + ";ppt=\"shaken\";alg=ES256;info=<" + x5u + ">",
		"Identity: " + jws + " ; INFO = <" + x5u + "> ; Alg=ES256 ; ppt=shaken ; foo=bar",
		jws + ";ppt=shaken;info=<" + x5u + ">",
	}
	for _, c := range cases {
		id, err := ParseIdentity(c)
		if err != nil {
			t.Fatalf("%q: %v", c, err)
		}
		if id.JWS != jws || id.Info != x5u || id.PPT != "shaken" {
			t.Fatalf("%q -> %+v", c, id)
		}
	}
	id, err := ParseIdentity(jws)
	if err != nil || id.JWS != jws || id.Info != "" {
		t.Fatalf("bare jws: %+v %v", id, err)
	}
	for _, b := range []string{"", ";info=<x>", jws + ";info=<x", jws + ";ppt=shaken;ppt=rcd", jws + ";ppt=\"x",
		strings.Repeat("a", MaxIdentityLen+1)} {
		if _, err := ParseIdentity(b); err == nil {
			t.Fatalf("expected error for %.40q", b)
		}
	}
	// info URI may contain ';' inside angle brackets.
	id, err = ParseIdentity(jws + ";info=<https://h/p;x=1>;ppt=shaken")
	if err != nil || id.Info != "https://h/p;x=1" {
		t.Fatalf("%+v %v", id, err)
	}
}

func TestTNAuthListRoundTrip(t *testing.T) {
	in := []core.TNEntry{{SPC: "1001"}, {Start: "905321234500", Count: 100}, {TN: "908501234567"}}
	der, err := MarshalTNAuthList(in)
	if err != nil {
		t.Fatal(err)
	}
	out, err := ParseTNAuthList(der)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(in, out) {
		t.Fatalf("%+v != %+v", in, out)
	}
	// Known-answer: SPC-only list per RFC 8226 explicit tagging: 30 08 A0 06 16 04 "1001".
	spc, _ := MarshalTNAuthList([]core.TNEntry{{SPC: "1001"}})
	if hex.EncodeToString(spc) != "3008a006160431303031" {
		t.Fatalf("spc DER %x", spc)
	}
	// Count 1 range is encoded as a single number.
	one, _ := MarshalTNAuthList([]core.TNEntry{{Start: "905321234567", Count: 1}})
	o, _ := ParseTNAuthList(one)
	if len(o) != 1 || o[0].TN != "905321234567" {
		t.Fatalf("%+v", o)
	}
	// Rejects.
	for _, bad := range [][]core.TNEntry{nil, {{}}, {{SPC: "1", TN: "1"}}, {{TN: "12a"}}, {{TN: "1234567890123456"}}, {{Start: "1", Count: 0}}} {
		if _, err := MarshalTNAuthList(bad); err == nil {
			t.Fatalf("marshal accepted %+v", bad)
		}
	}
	// Wrong inner type (UTF8String instead of IA5String) and unknown tag.
	utf, _ := asn1.MarshalWithParams("1001", "utf8")
	b1, _ := asn1.Marshal([]asn1.RawValue{{Class: asn1.ClassContextSpecific, Tag: 0, IsCompound: true, Bytes: utf}})
	ia5, _ := asn1.MarshalWithParams("1001", "ia5")
	b2, _ := asn1.Marshal([]asn1.RawValue{{Class: asn1.ClassContextSpecific, Tag: 5, IsCompound: true, Bytes: ia5}})
	for _, b := range [][]byte{b1, b2, append(append([]byte{}, der...), 0), {0x30, 0x00}, nil} {
		if _, err := ParseTNAuthList(b); err == nil {
			t.Fatalf("parse accepted %x", b)
		}
	}
	// Coverage.
	if ok, _ := Covers(out, "905321234599", nil); !ok {
		t.Fatal("range end not covered")
	}
	if ok, _ := Covers(out[1:], "905321234600", nil); ok {
		t.Fatal("past range covered")
	}
	if ok, _ := Covers(out[1:], "908501234567", nil); !ok {
		t.Fatal("tn not covered")
	}
	if ok, _ := Covers(out[:1], "4420", []string{"2002"}); ok {
		t.Fatal("untrusted spc covered")
	}
	if ok, _ := Covers(out[:1], "4420", []string{"1001"}); !ok {
		t.Fatal("trusted spc not covered")
	}
}

// ---- verification with a throwaway CA

type testPKI struct {
	roots    *x509.CertPool
	inter    *x509.Certificate
	leaf     *x509.Certificate
	leafKey  *ecdsa.PrivateKey
	x5u      string
	revoked  bool
	notAfter time.Time
}

func newCert(t *testing.T, tmpl, parent *x509.Certificate, pub, priv any) *x509.Certificate {
	t.Helper()
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, pub, priv)
	if err != nil {
		t.Fatal(err)
	}
	c, err := x509.ParseCertificate(der)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func buildPKI(t *testing.T, entries []core.TNEntry, leafNotAfter time.Time) *testPKI {
	now := time.Now()
	rk, ik, lk := mustKey(t), mustKey(t), mustKey(t)
	rt := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "root"}, NotBefore: now.Add(-time.Hour),
		NotAfter: now.AddDate(10, 0, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign}
	root := newCert(t, rt, rt, &rk.PublicKey, rk)
	it := &x509.Certificate{SerialNumber: big.NewInt(2), Subject: pkix.Name{CommonName: "inter"}, NotBefore: now.Add(-time.Hour),
		NotAfter: now.AddDate(5, 0, 0), IsCA: true, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageCertSign, MaxPathLenZero: true}
	inter := newCert(t, it, root, &ik.PublicKey, rk)
	ext, err := TNAuthListExtension(entries)
	if err != nil {
		t.Fatal(err)
	}
	lt := &x509.Certificate{SerialNumber: big.NewInt(3), Subject: pkix.Name{CommonName: "sp"}, NotBefore: now.Add(-48 * time.Hour),
		NotAfter: leafNotAfter, BasicConstraintsValid: true, KeyUsage: x509.KeyUsageDigitalSignature, ExtraExtensions: []pkix.Extension{ext}}
	leaf := newCert(t, lt, inter, &lk.PublicKey, ik)
	pool := x509.NewCertPool()
	pool.AddCert(root)
	return &testPKI{roots: pool, inter: inter, leaf: leaf, leafKey: lk, x5u: "https://sti.test/certs/sp.pem"}
}

func (p *testPKI) opts(from, to string, now time.Time) VerifyOptions {
	return VerifyOptions{
		Roots: p.roots, Now: now, FromTN: from, ToTN: to, TrustedSPCs: []string{"1001"},
		Resolve: func(x5u string) (*x509.Certificate, []*x509.Certificate, error) {
			if x5u != p.x5u {
				return nil, nil, errors.New("unknown x5u")
			}
			return p.leaf, []*x509.Certificate{p.inter}, nil
		},
		IsRevoked: func(c *x509.Certificate) (bool, string) {
			return p.revoked && c.SerialNumber.Cmp(p.leaf.SerialNumber) == 0, "keyCompromise"
		},
	}
}

func checkMap(r core.VerifyResult) map[string]bool {
	m := map[string]bool{}
	for _, c := range r.Checks {
		m[c.Name] = c.OK
	}
	return m
}

func TestVerify(t *testing.T) {
	now := time.Now()
	p := buildPKI(t, []core.TNEntry{{SPC: "1001"}}, now.AddDate(1, 0, 0))
	sign := func(iat int64, ppt string) string {
		c, _ := NewShaken(core.AttestA, "+905321234567", "+905551112233", iat, "oid-1")
		if ppt == PPTRCD {
			c, _ = WithRCD(c, core.RCDClaims{Nam: "Acme Kargo", Crn: "Teslimat"})
		}
		jws, err := Sign(p.leafKey, Header{Ppt: ppt, X5U: p.x5u}, c)
		if err != nil {
			t.Fatal(err)
		}
		return FormatIdentity(jws, p.x5u, ppt)
	}
	id := sign(now.Unix(), PPTShaken)
	res, det := Verify(id, sign(now.Unix(), PPTRCD), p.opts("+905321234567", "05551112233", now))
	if res.Verstat != core.VerstatPassed || res.Attest != core.AttestA || res.OrigID != "oid-1" || det.ShakenX5U != p.x5u {
		t.Fatalf("%+v", res)
	}
	if len(res.Checks) != len(CheckOrder)+1 {
		t.Fatalf("checks %+v", res.Checks)
	}
	for i, n := range CheckOrder {
		if res.Checks[i].Name != n {
			t.Fatalf("order %d %s", i, res.Checks[i].Name)
		}
	}
	if !res.RCDVerified || res.RCD == nil || res.RCD.Nam != "Acme Kargo" || res.RCD.Crn != "Teslimat" {
		t.Fatalf("rcd %+v %+v", res.RCD, res.Checks)
	}

	// Wrong dest.
	res, _ = Verify(id, "", p.opts("+905321234567", "+905551112234", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckDestMatch] {
		t.Fatalf("%+v", res)
	}
	// Wrong orig.
	res, _ = Verify(id, "", p.opts("+905321234568", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckOrigMatch] {
		t.Fatalf("%+v", res)
	}
	// Stale iat.
	res, _ = Verify(sign(now.Add(-2*time.Minute).Unix(), PPTShaken), "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckIATFresh] || !checkMap(res)[CheckSignature] {
		t.Fatalf("%+v", res)
	}
	// Revoked.
	p.revoked = true
	res, _ = Verify(id, "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckNotRevoked] {
		t.Fatalf("%+v", res)
	}
	p.revoked = false
	// Expired (verify far in the future; iat also stale, but chain still good).
	res, _ = Verify(id, "", p.opts("+905321234567", "+905551112233", now.AddDate(2, 0, 0)))
	m := checkMap(res)
	if res.Verstat != core.VerstatFailed || m[CheckNotExpired] || !m[CheckChain] {
		t.Fatalf("%+v", res)
	}
	// Unknown x5u (and info mismatch).
	res, _ = Verify(strings.Replace(id, p.x5u+">", "https://evil/x.pem>", 1), "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckX5UFetch] || checkMap(res)[CheckSignature] {
		t.Fatalf("%+v", res)
	}
	// Garbage → No-TN-Validation.
	for _, g := range []string{"", "not a jws", "a.b.c"} {
		res, _ = Verify(g, "", p.opts("+905321234567", "+905551112233", now))
		if res.Verstat != core.VerstatNone || len(res.Checks) != len(CheckOrder) || res.Attest != "" {
			t.Fatalf("%q: %+v", g, res)
		}
	}
	// Signature from another key → Failed with signature false.
	other := mustKey(t)
	c, _ := NewShaken(core.AttestA, "905321234567", "905551112233", now.Unix(), "oid-1")
	forged, _ := Sign(other, Header{Ppt: PPTShaken, X5U: p.x5u}, c)
	res, _ = Verify(forged, "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckSignature] || res.Attest != "" {
		t.Fatalf("%+v", res)
	}
	// rcd passport presented as shaken → ppt fails.
	res, _ = Verify(sign(now.Unix(), PPTRCD), "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckPPT] {
		t.Fatalf("%+v", res)
	}
	// Tampered rcd nam (re-signed by a foreign key) is not verified; tampered rcdi digest detected.
	cr, _ := NewShaken(core.AttestA, "905321234567", "905551112233", now.Unix(), "oid-1")
	cr, _ = WithRCD(cr, core.RCDClaims{Nam: "Acme Kargo"})
	cr.RCD.Nam = "Banka"
	bad, _ := Sign(p.leafKey, Header{Ppt: PPTRCD, X5U: p.x5u}, cr)
	res, _ = Verify(id, bad, p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatPassed || res.RCDVerified || res.RCD != nil || checkMap(res)[CheckRCD] {
		t.Fatalf("%+v", res)
	}
}

func TestVerifyDelegateRange(t *testing.T) {
	now := time.Now()
	p := buildPKI(t, []core.TNEntry{{Start: "905321234500", Count: 100}}, now.AddDate(0, 3, 0))
	c, _ := NewShaken(core.AttestB, "905321234567", "905551112233", now.Unix(), "o")
	jws, _ := Sign(p.leafKey, Header{Ppt: PPTShaken, X5U: p.x5u}, c)
	res, _ := Verify(jws, "", p.opts("+905321234567", "+905551112233", now))
	if res.Verstat != core.VerstatPassed {
		t.Fatalf("%+v", res)
	}
	c, _ = NewShaken(core.AttestB, "905321234600", "905551112233", now.Unix(), "o")
	jws, _ = Sign(p.leafKey, Header{Ppt: PPTShaken, X5U: p.x5u}, c)
	res, _ = Verify(jws, "", p.opts("+905321234600", "+905551112233", now))
	if res.Verstat != core.VerstatFailed || checkMap(res)[CheckTNAuth] {
		t.Fatalf("%+v", res)
	}
}
