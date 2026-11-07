package pki

import (
	"context"
	"crypto/x509"
	"errors"
	"strings"

	"github.com/google/uuid"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/passport"
)

func normalizePair(orig, dest string) (string, string, error) {
	var ve core.ValidationError
	o, err := core.NormalizeTN(orig)
	if err != nil {
		ve.Add("orig_tn", "arayan numara geçersiz")
	}
	d, err := core.NormalizeTN(dest)
	if err != nil {
		ve.Add("dest_tn", "aranan numara geçersiz")
	}
	return o, d, ve.Err()
}

func (s *Service) lookup(ctx context.Context, tn string) (core.LookupResult, bool) {
	if s.d.Lookup == nil {
		return core.LookupResult{}, false
	}
	lr, err := s.d.Lookup.Lookup(ctx, tn)
	if err != nil {
		if !errors.Is(err, core.ErrNotFound) {
			s.log.Warn("pki: lookup failed", "err", err)
		}
		return core.LookupResult{}, false
	}
	return lr, true
}

// Sign creates a shaken PASSporT (and optionally an rcd PASSporT) signed with
// the operator SP certificate.
func (s *Service) Sign(ctx context.Context, req core.SignRequest) (core.SignResult, error) {
	orig, dest, err := normalizePair(req.OrigTN, req.DestTN)
	if err != nil {
		return core.SignResult{}, err
	}
	switch req.Attest {
	case "", core.AttestA, core.AttestB, core.AttestC:
	default:
		return core.SignResult{}, core.Invalid("attest", "attest A, B veya C olmalı")
	}
	origID, err := normalizeOrigID(req.OrigID)
	if err != nil {
		return core.SignResult{}, err
	}
	var lr core.LookupResult
	var found bool
	if req.Attest == "" || req.WithRCD {
		lr, found = s.lookup(ctx, orig)
	}
	attest := req.Attest
	if attest == "" {
		attest = lr.Attest
		if attest == "" {
			attest = core.AttestC
		}
	}
	var rcd *core.RCDClaims
	if req.WithRCD {
		if !found || !lr.Verified || strings.TrimSpace(lr.DisplayName) == "" {
			return core.SignResult{}, core.Invalid("with_rcd", "numaranın onaylı marka bilgisi yok")
		}
		rcd = &core.RCDClaims{Nam: lr.DisplayName, Icn: lr.LogoURL, Crn: lr.CallReason}
	}
	sp, err := s.activeCert(ctx, s.db, core.CertSP, "", "")
	if errors.Is(err, core.ErrNotFound) {
		return core.SignResult{}, core.Errorf(core.ErrState, "aktif operatör SP sertifikası yok")
	} else if err != nil {
		return core.SignResult{}, err
	}
	return s.signWith(ctx, sp, attest, orig, dest, origID, true, rcd)
}

// SignRCD creates an rcd PASSporT for an enterprise, signed with the entity's
// newest active delegate certificate whose TNAuthList must cover orig.
func (s *Service) SignRCD(ctx context.Context, entityID, origTN, destTN string) (core.SignResult, error) {
	if entityID == "" {
		return core.SignResult{}, core.Errorf(core.ErrForbidden, "kurum hesabı gerekli")
	}
	orig, dest, err := normalizePair(origTN, destTN)
	if err != nil {
		return core.SignResult{}, err
	}
	cert, err := s.activeCert(ctx, s.db, core.CertDelegate, entityID, "")
	if errors.Is(err, core.ErrNotFound) {
		return core.SignResult{}, core.Errorf(core.ErrState, "kurumun aktif yetki sertifikası yok")
	} else if err != nil {
		return core.SignResult{}, err
	}
	if ok, _ := passport.Covers(cert.TNAuthList, core.Digits(orig), nil); !ok {
		return core.SignResult{}, core.Errorf(core.ErrForbidden, "numara yetki sertifikasının kapsamında değil")
	}
	if err := s.numberStillAuthorized(ctx, entityID, orig); err != nil {
		return core.SignResult{}, err
	}
	lr, found := s.lookup(ctx, orig)
	if !found || !lr.Verified || lr.EntityID != entityID || strings.TrimSpace(lr.DisplayName) == "" {
		return core.SignResult{}, core.Invalid("orig_tn", "numaranın onaylı marka bilgisi yok")
	}
	attest := lr.Attest
	if attest == "" {
		attest = core.AttestC
	}
	rcd := &core.RCDClaims{Nam: lr.DisplayName, Icn: lr.LogoURL, Crn: lr.CallReason}
	return s.signWith(ctx, cert, attest, orig, dest, core.NewID(), false, rcd)
}

// numberStillAuthorized checks via the directory that tn is an active number
// of a verified entity entityID (certificates can outlive number status).
func (s *Service) numberStillAuthorized(ctx context.Context, entityID, tn string) error {
	if s.d.Directory == nil {
		return nil
	}
	n, ent, err := s.d.Directory.NumberOwner(ctx, tn)
	if err != nil {
		if errors.Is(err, core.ErrNotFound) {
			return core.Errorf(core.ErrForbidden, "numara kuruma ait değil")
		}
		return err
	}
	if ent.ID != entityID || n.EntityID != entityID {
		return core.Errorf(core.ErrForbidden, "numara kuruma ait değil")
	}
	if n.Status != core.NumberActive || ent.Status != core.EntityVerified {
		return core.Errorf(core.ErrForbidden, "numara veya kurum aktif değil")
	}
	return nil
}

func (s *Service) signWith(ctx context.Context, cert certRow, attest core.Attest, orig, dest, origID string,
	shaken bool, rcd *core.RCDClaims) (core.SignResult, error) {
	key, err := s.loadKey(ctx, s.db, cert.KeyID)
	if err != nil {
		return core.SignResult{}, err
	}
	iat := s.now().Unix()
	claims, err := passport.NewShaken(attest, orig, dest, iat, origID)
	if err != nil {
		return core.SignResult{}, core.Invalid("orig_tn", err.Error())
	}
	res := core.SignResult{CertID: cert.ID, X5U: cert.X5U, Attest: attest, OrigID: origID, IAT: iat}
	if shaken {
		jws, err := passport.Sign(key, passport.Header{Ppt: passport.PPTShaken, X5U: cert.X5U}, claims)
		if err != nil {
			return core.SignResult{}, err
		}
		res.Passport, res.Identity = jws, passport.FormatIdentity(jws, cert.X5U, passport.PPTShaken)
	}
	if rcd != nil {
		rc, err := passport.WithRCD(claims, *rcd)
		if err != nil {
			return core.SignResult{}, core.Invalid("with_rcd", "marka bilgisi imzalanamadı")
		}
		jws, err := passport.Sign(key, passport.Header{Ppt: passport.PPTRCD, X5U: cert.X5U}, rc)
		if err != nil {
			return core.SignResult{}, err
		}
		res.RCDPassport, res.RCDIdentity = jws, passport.FormatIdentity(jws, cert.X5U, passport.PPTRCD)
	}
	return res, nil
}

func normalizeOrigID(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return core.NewID(), nil
	}
	u, err := uuid.Parse(id)
	if err != nil || len(id) != 36 {
		return "", core.Invalid("orig_id", "orig_id UUID biçiminde olmalı")
	}
	return u.String(), nil
}

// Verify checks an Identity header (and optional rcd Identity) against the
// local certificate store; x5u URLs are never fetched over the network.
func (s *Service) Verify(ctx context.Context, req core.VerifyRequest) (core.VerifyResult, error) {
	from, to, err := normalizePair(req.FromTN, req.ToTN)
	if err != nil {
		var ve *core.ValidationError
		if errors.As(err, &ve) {
			for i := range ve.Fields {
				ve.Fields[i].Field = map[string]string{"orig_tn": "from_tn", "dest_tn": "to_tn"}[ve.Fields[i].Field]
			}
		}
		return core.VerifyResult{}, err
	}
	if len(req.Identity) > passport.MaxIdentityLen || len(req.RCDIdentity) > passport.MaxIdentityLen {
		return core.VerifyResult{}, core.Invalid("identity", "Identity başlığı çok uzun")
	}
	roots := x509.NewCertPool()
	rootRows, err := s.listCerts(ctx, s.db, `kind = ? AND status = ?`, string(core.CertRoot), StatusActive)
	if err != nil {
		return core.VerifyResult{}, err
	}
	for _, r := range rootRows {
		c, err := s.parsed(certRow{Certificate: r})
		if err != nil {
			return core.VerifyResult{}, err
		}
		roots.AddCert(c)
	}
	byX5U := map[string]certRow{}
	bySerial := map[string]certRow{}
	prefix := s.d.Base.Cfg.PublicBaseURL + "/certs/"
	resolve := func(x5u string) (*x509.Certificate, []*x509.Certificate, error) {
		if !strings.HasPrefix(x5u, prefix) || !strings.HasSuffix(x5u, ".pem") {
			return nil, nil, errors.New("x5u yerel sertifika deposuna ait değil")
		}
		r, err := s.getCert(ctx, s.db, `x5u = ?`, x5u)
		if err != nil {
			return nil, nil, errors.New("x5u için sertifika bulunamadı")
		}
		if r.Kind != core.CertSP && r.Kind != core.CertDelegate {
			return nil, nil, errors.New("CA sertifikası PASSporT imzalayamaz")
		}
		rows, err := s.chainRows(ctx, s.db, r)
		if err != nil {
			return nil, nil, errors.New("sertifika zinciri okunamadı")
		}
		leaf, err := s.parsed(rows[0])
		if err != nil {
			return nil, nil, err
		}
		var chain []*x509.Certificate
		for _, cr := range rows {
			bySerial[cr.SerialHex] = cr
			if cr.ID == r.ID {
				continue
			}
			c, err := s.parsed(cr)
			if err != nil {
				return nil, nil, err
			}
			chain = append(chain, c)
		}
		byX5U[x5u] = r
		return leaf, chain, nil
	}
	serialOf := func(c *x509.Certificate) string { return serialHex(c.SerialNumber) }
	isRevoked := func(c *x509.Certificate) (bool, string) {
		r, ok := bySerial[serialOf(c)]
		if !ok {
			var err error
			if r, err = s.getCert(ctx, s.db, `serial_hex = ?`, serialOf(c)); err != nil {
				return true, "bilinmeyen sertifika"
			}
		}
		// Re-read status: never trust a cached row for revocation.
		cur, err := s.getCert(ctx, s.db, `id = ?`, r.ID)
		if err != nil {
			return true, "durum okunamadı"
		}
		if cur.Status != StatusActive {
			return true, cur.RevokeReason
		}
		return false, ""
	}
	authorize := func(leaf *x509.Certificate, origDigits string) error {
		r, ok := bySerial[serialOf(leaf)]
		if !ok {
			return errors.New("sertifika bilinmiyor")
		}
		if r.Kind != core.CertDelegate {
			return nil
		}
		return s.numberStillAuthorized(ctx, r.EntityID, "+"+origDigits)
	}
	res, det := passport.Verify(req.Identity, req.RCDIdentity, passport.VerifyOptions{
		Resolve: resolve, Roots: roots, Now: s.now(), FromTN: from, ToTN: to,
		IsRevoked: isRevoked, TrustedSPCs: []string{s.d.Base.Cfg.SPC}, AuthorizeTN: authorize,
	})
	if r, ok := byX5U[det.ShakenX5U]; ok && det.ShakenX5U != "" {
		res.CertID = r.ID
	}
	return res, nil
}
