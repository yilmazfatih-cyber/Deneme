package passport

import (
	"crypto/ecdsa"
	"crypto/x509"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Check names reported in core.VerifyResult.Checks, in this order.
const (
	CheckJWSParse   = "jws_parse"
	CheckAlg        = "alg"
	CheckPPT        = "ppt"
	CheckX5UFetch   = "x5u_fetch"
	CheckSignature  = "signature"
	CheckChain      = "chain"
	CheckNotExpired = "not_expired"
	CheckNotRevoked = "not_revoked"
	CheckIATFresh   = "iat_fresh"
	CheckOrigMatch  = "orig_match"
	CheckDestMatch  = "dest_match"
	CheckTNAuth     = "tn_auth"
	CheckRCD        = "rcd" // only when an rcd PASSporT was supplied; does not affect verstat
)

// CheckOrder lists the shaken checks in reporting order.
var CheckOrder = []string{CheckJWSParse, CheckAlg, CheckPPT, CheckX5UFetch, CheckSignature, CheckChain,
	CheckNotExpired, CheckNotRevoked, CheckIATFresh, CheckOrigMatch, CheckDestMatch, CheckTNAuth}

// DefaultMaxSkew is the allowed |now - iat| (RFC 8224 recommends 60 s).
const DefaultMaxSkew = 60 * time.Second

// CertResolver returns the signing certificate named by an x5u URL and the
// intermediates needed to chain it to a trusted root. Implementations must
// not fetch remote URLs unless they mean to.
type CertResolver func(x5u string) (leaf *x509.Certificate, chain []*x509.Certificate, err error)

// VerifyOptions configures Verify.
type VerifyOptions struct {
	Resolve CertResolver   // required
	Roots   *x509.CertPool // trust anchors; required
	Now     time.Time      // verification time
	FromTN  string         // expected originating number (E.164 or digits)
	ToTN    string         // expected destination number (E.164 or digits)
	MaxSkew time.Duration  // default DefaultMaxSkew
	// IsRevoked reports revocation of a certificate (leaf and intermediates).
	// nil means no revocation source: the check passes with a note.
	IsRevoked func(c *x509.Certificate) (revoked bool, reason string)
	// TrustedSPCs restricts which ServiceProviderCode entries cover any TN.
	// Empty accepts any SPC from a certificate that chains to Roots.
	TrustedSPCs []string
	// AuthorizeTN is an optional extra policy after TNAuthList coverage
	// (e.g. "the delegate's number is still active").
	AuthorizeTN func(leaf *x509.Certificate, origDigits string) error
}

// Details exposes what Verify resolved, for callers that need more than the result.
type Details struct {
	Shaken    *Token
	ShakenX5U string
	RCD       *Token
	RCDX5U    string
}

// Verify verifies a shaken Identity header (or bare compact JWS) and, when
// rcdIdentity is not empty, an accompanying rcd PASSporT. Every check in
// CheckOrder is reported; checks whose prerequisites failed are reported
// as not OK with a "skipped" detail. Verstat: unparseable or absent →
// No-TN-Validation; all checks OK → TN-Validation-Passed; otherwise
// TN-Validation-Failed. The rcd result only sets RCD/RCDVerified and the
// "rcd" check; it never changes verstat.
func Verify(identity, rcdIdentity string, opt VerifyOptions) (core.VerifyResult, Details) {
	var det Details
	if opt.MaxSkew <= 0 {
		opt.MaxSkew = DefaultMaxSkew
	}
	if opt.Now.IsZero() {
		opt.Now = time.Now()
	}
	one := verifyOne(identity, PPTShaken, opt)
	det.Shaken, det.ShakenX5U = one.tok, one.x5u
	res := core.VerifyResult{Checks: one.checks}
	switch {
	case !one.parsed:
		res.Verstat = core.VerstatNone
	case one.allOK():
		res.Verstat = core.VerstatPassed
	default:
		res.Verstat = core.VerstatFailed
	}
	if f := one.firstFailure(); f != nil {
		res.Reason = f.Name
		if f.Detail != "" {
			res.Reason += ": " + f.Detail
		}
	}
	if one.sigOK {
		c := one.tok.Claims
		res.Attest, res.OrigID, res.IAT = c.Attest, c.OrigID, c.IAT
	}
	if strings.TrimSpace(rcdIdentity) != "" {
		r := verifyOne(rcdIdentity, PPTRCD, opt)
		det.RCD, det.RCDX5U = r.tok, r.x5u
		ck := core.VerifyCheck{Name: CheckRCD, OK: r.allOK()}
		if f := r.firstFailure(); f != nil {
			ck.Detail = f.Name + ": " + f.Detail
		} else if err := CheckRCDI(r.tok.Claims); err != nil {
			ck.OK, ck.Detail = false, "rcdi: "+err.Error()
		} else if one.tok != nil && one.sigOK && one.tok.Claims.OrigID != "" && r.tok.Claims.OrigID != "" &&
			r.tok.Claims.OrigID != one.tok.Claims.OrigID && r.x5u == one.x5u {
			// Same signer must use the same origid for the call.
			ck.OK, ck.Detail = false, "origid differs from shaken PASSporT"
		}
		res.Checks = append(res.Checks, ck)
		if ck.OK {
			rc := *r.tok.Claims.RCD
			res.RCD = &rc
			res.RCDVerified = true
		}
	}
	return res, det
}

type outcome struct {
	checks []core.VerifyCheck
	tok    *Token
	x5u    string
	parsed bool
	sigOK  bool
}

func (o *outcome) add(name string, ok bool, detail string) {
	o.checks = append(o.checks, core.VerifyCheck{Name: name, OK: ok, Detail: detail})
}

func (o *outcome) skip(names ...string) {
	for _, n := range names {
		o.add(n, false, "atlandı: önceki kontrol başarısız")
	}
}

func (o *outcome) allOK() bool {
	if len(o.checks) == 0 {
		return false
	}
	for _, c := range o.checks {
		if !c.OK {
			return false
		}
	}
	return true
}

func (o *outcome) firstFailure() *core.VerifyCheck {
	for i := range o.checks {
		if !o.checks[i].OK {
			return &o.checks[i]
		}
	}
	return nil
}

func verifyOne(identity, wantPPT string, opt VerifyOptions) outcome {
	var o outcome
	id, err := ParseIdentity(identity)
	var tok *Token
	if err == nil {
		tok, err = Parse(id.JWS)
	}
	if err != nil {
		o.add(CheckJWSParse, false, err.Error())
		o.skip(CheckOrder[1:]...)
		return o
	}
	o.parsed, o.tok = true, tok
	o.add(CheckJWSParse, true, "")
	h, c := tok.Header, tok.Claims

	// alg: header and (optional) Identity parameter must both be ES256; "none" and everything else rejected.
	algOK := h.Alg == AlgES256 && (id.Alg == "" || id.Alg == AlgES256)
	o.add(CheckAlg, algOK, cond(!algOK, fmt.Sprintf("alg %q desteklenmiyor; yalnızca ES256", h.Alg)))

	// ppt + claim shape.
	pptErr := checkPPT(h, id, c, wantPPT)
	o.add(CheckPPT, pptErr == nil, errText(pptErr))

	// x5u: local resolution only; the info parameter must agree with the header.
	var leaf *x509.Certificate
	var chain []*x509.Certificate
	x5u := h.X5U
	switch {
	case x5u == "" || len(x5u) > MaxX5ULen:
		err = errors.New("x5u yok veya çok uzun")
	case id.Info != "" && id.Info != x5u:
		err = errors.New("Identity info parametresi x5u ile uyuşmuyor")
	case opt.Resolve == nil:
		err = errors.New("sertifika çözücü yok")
	default:
		leaf, chain, err = opt.Resolve(x5u)
		if err == nil && leaf == nil {
			err = errors.New("sertifika bulunamadı")
		}
	}
	x5uOK := err == nil
	o.add(CheckX5UFetch, x5uOK, errText(err))
	if x5uOK {
		o.x5u = x5u
	}

	// signature
	switch {
	case !algOK || !x5uOK:
		o.skip(CheckSignature)
	default:
		pub, _ := leaf.PublicKey.(*ecdsa.PublicKey)
		err := tok.VerifySignature(pub)
		o.sigOK = err == nil
		o.add(CheckSignature, o.sigOK, errText(err))
	}

	if !x5uOK {
		o.skip(CheckChain, CheckNotExpired, CheckNotRevoked)
	} else {
		err := verifyChain(leaf, chain, opt)
		o.add(CheckChain, err == nil, errText(err))
		err = checkValidity(leaf, chain, opt.Now)
		o.add(CheckNotExpired, err == nil, errText(err))
		err = checkRevocation(leaf, chain, opt.IsRevoked)
		detail := errText(err)
		if err == nil && opt.IsRevoked == nil {
			detail = "iptal kaynağı yapılandırılmamış"
		}
		o.add(CheckNotRevoked, err == nil, detail)
	}

	// iat freshness
	now := opt.Now.Unix()
	skew := int64(opt.MaxSkew / time.Second)
	iatOK := c.IAT > 0 && c.IAT >= now-skew && c.IAT <= now+skew
	o.add(CheckIATFresh, iatOK, cond(!iatOK, fmt.Sprintf("iat %d, şimdi %d (±%d sn)", c.IAT, now, skew)))

	// orig / dest
	origDigits, origErr := expectedDigits(opt.FromTN, "from_tn")
	if origErr == nil && strings.TrimPrefix(c.Orig.TN, "+") != origDigits {
		origErr = fmt.Errorf("orig.tn %q, beklenen %q", c.Orig.TN, origDigits)
	}
	o.add(CheckOrigMatch, origErr == nil, errText(origErr))

	destDigits, destErr := expectedDigits(opt.ToTN, "to_tn")
	if destErr == nil {
		found := false
		for _, d := range c.Dest.TN {
			if strings.TrimPrefix(d, "+") == destDigits {
				found = true
				break
			}
		}
		if !found {
			destErr = fmt.Errorf("dest.tn %q içinde %q yok", c.Dest.TN, destDigits)
		}
	}
	o.add(CheckDestMatch, destErr == nil, errText(destErr))

	// TNAuthList coverage of orig
	if !x5uOK {
		o.skip(CheckTNAuth)
	} else {
		o.add(CheckTNAuth, true, "")
		last := &o.checks[len(o.checks)-1]
		od := strings.TrimPrefix(c.Orig.TN, "+")
		entries, err := TNAuthListFromCert(leaf)
		switch {
		case err != nil:
			last.OK, last.Detail = false, err.Error()
		default:
			ok, via := Covers(entries, od, opt.TrustedSPCs)
			if !ok {
				last.OK, last.Detail = false, "TNAuthList arayan numarayı kapsamıyor"
			} else if opt.AuthorizeTN != nil {
				if err := opt.AuthorizeTN(leaf, od); err != nil {
					last.OK, last.Detail = false, err.Error()
				} else {
					last.Detail = via
				}
			} else {
				last.Detail = via
			}
		}
	}
	return o
}

func checkPPT(h Header, id Identity, c Claims, want string) error {
	if h.Ppt != want {
		return fmt.Errorf("ppt %q, beklenen %q", h.Ppt, want)
	}
	if id.PPT != "" && id.PPT != want {
		return fmt.Errorf("Identity ppt parametresi %q, beklenen %q", id.PPT, want)
	}
	if h.Typ != "" && h.Typ != TypPassport {
		return fmt.Errorf("typ %q geçersiz", h.Typ)
	}
	if c.Orig.TN == "" || len(c.Dest.TN) == 0 || len(c.Dest.TN) > 32 || c.IAT <= 0 {
		return errors.New("orig, dest veya iat eksik")
	}
	switch want {
	case PPTShaken:
		switch c.Attest {
		case core.AttestA, core.AttestB, core.AttestC:
		default:
			return errors.New("attest A, B veya C olmalı")
		}
		if c.OrigID == "" {
			return errors.New("origid eksik")
		}
	case PPTRCD:
		if c.RCD == nil || strings.TrimSpace(c.RCD.Nam) == "" {
			return errors.New("rcd.nam eksik")
		}
	}
	return nil
}

func verifyChain(leaf *x509.Certificate, chain []*x509.Certificate, opt VerifyOptions) error {
	if opt.Roots == nil {
		return errors.New("güvenilir kök yok")
	}
	inter := x509.NewCertPool()
	for _, c := range chain {
		inter.AddCert(c)
	}
	// Validity is reported separately (not_expired): evaluate the chain at a
	// time inside the leaf's validity window.
	at := opt.Now
	if at.Before(leaf.NotBefore) {
		at = leaf.NotBefore
	}
	if at.After(leaf.NotAfter) {
		at = leaf.NotAfter
	}
	_, err := leaf.Verify(x509.VerifyOptions{Roots: opt.Roots, Intermediates: inter, CurrentTime: at,
		KeyUsages: []x509.ExtKeyUsage{x509.ExtKeyUsageAny}})
	if err != nil {
		return fmt.Errorf("zincir doğrulanamadı: %v", err)
	}
	return nil
}

func checkValidity(leaf *x509.Certificate, chain []*x509.Certificate, now time.Time) error {
	for _, c := range append([]*x509.Certificate{leaf}, chain...) {
		if now.Before(c.NotBefore) {
			return fmt.Errorf("sertifika henüz geçerli değil: %s", c.Subject.CommonName)
		}
		if now.After(c.NotAfter) {
			return fmt.Errorf("sertifikanın süresi dolmuş: %s", c.Subject.CommonName)
		}
	}
	return nil
}

func checkRevocation(leaf *x509.Certificate, chain []*x509.Certificate, isRevoked func(*x509.Certificate) (bool, string)) error {
	if isRevoked == nil {
		return nil
	}
	for _, c := range append([]*x509.Certificate{leaf}, chain...) {
		if r, why := isRevoked(c); r {
			return fmt.Errorf("sertifika iptal edilmiş (%s): %s", why, c.Subject.CommonName)
		}
	}
	return nil
}

func expectedDigits(tn, field string) (string, error) {
	if strings.TrimSpace(tn) == "" {
		return "", fmt.Errorf("%s verilmedi", field)
	}
	tn = strings.TrimSpace(tn)
	if !strings.HasPrefix(tn, "+") {
		if n, err := core.NormalizeTN(tn); err == nil {
			return core.Digits(n), nil
		}
	}
	d, err := TNDigits(tn)
	if err != nil {
		return "", fmt.Errorf("%s geçersiz", field)
	}
	return d, nil
}

func errText(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func cond(b bool, s string) string {
	if b {
		return s
	}
	return ""
}
