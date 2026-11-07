package pki

import (
	"context"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/passport"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

const caOrg = "Enumaracle Pilot STI-CA"

type issueSpec struct {
	kind     core.CertKind
	cn, org  string
	entityID string
	spc      string
	entries  []core.TNEntry
	validity time.Duration
}

// issue creates a key and a certificate signed by issuer (nil = self-signed root).
func (s *Service) issue(ctx context.Context, q platform.Querier, issuer *certRow, sp issueSpec) (certRow, error) {
	keyID, key, err := s.newKey(ctx, q)
	if err != nil {
		return certRow{}, err
	}
	serial, err := randomSerial()
	if err != nil {
		return certRow{}, err
	}
	now := s.now()
	id := core.NewID()
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: sp.cn, Organization: []string{sp.org}, Country: []string{"TR"}},
		NotBefore:             now.Add(-5 * time.Minute).Truncate(time.Second),
		NotAfter:              now.Add(sp.validity).Truncate(time.Second),
		BasicConstraintsValid: true,
	}
	switch sp.kind {
	case core.CertRoot:
		tmpl.IsCA, tmpl.MaxPathLen = true, 1
		tmpl.KeyUsage = x509.KeyUsageCertSign | x509.KeyUsageCRLSign
	case core.CertIntermediate:
		tmpl.IsCA, tmpl.MaxPathLen, tmpl.MaxPathLenZero = true, 0, true
		tmpl.KeyUsage = x509.KeyUsageCertSign | x509.KeyUsageCRLSign
	default:
		tmpl.KeyUsage = x509.KeyUsageDigitalSignature
		ext, err := passport.TNAuthListExtension(sp.entries)
		if err != nil {
			return certRow{}, core.Invalid("tn_auth_list", "yetki listesi oluşturulamadı: "+err.Error())
		}
		tmpl.ExtraExtensions = []pkix.Extension{ext}
	}
	parent, signer := tmpl, any(key)
	issuerID := ""
	if issuer != nil {
		pc, err := s.parsed(*issuer)
		if err != nil {
			return certRow{}, err
		}
		ik, err := s.loadKey(ctx, q, issuer.KeyID)
		if err != nil {
			return certRow{}, err
		}
		if tmpl.NotAfter.After(pc.NotAfter) {
			tmpl.NotAfter = pc.NotAfter
		}
		parent, signer, issuerID = pc, ik, issuer.ID
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, parent, &key.PublicKey, signer)
	if err != nil {
		return certRow{}, fmt.Errorf("pki: create certificate: %w", err)
	}
	r := certRow{KeyID: keyID, Certificate: core.Certificate{
		ID: id, Kind: sp.kind, EntityID: sp.entityID, IssuerID: issuerID, SerialHex: serialHex(serial),
		SubjectCN: sp.cn, SPC: sp.spc, TNAuthList: sp.entries, NotBefore: tmpl.NotBefore.UTC(), NotAfter: tmpl.NotAfter.UTC(),
		PEM:    string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})),
		X5U:    s.d.Base.Cfg.PublicBaseURL + "/certs/" + id + ".pem",
		Status: StatusActive, CreatedAt: now,
	}}
	if err := s.insertCert(ctx, q, r); err != nil {
		return certRow{}, err
	}
	if err := platform.Audit(ctx, q, "pki.certificate.issue", "certificate", id,
		map[string]any{"kind": sp.kind, "entity_id": sp.entityID, "serial": r.SerialHex, "subject_cn": sp.cn}); err != nil {
		return certRow{}, err
	}
	return r, nil
}

func serialHex(n *big.Int) string { return hex.EncodeToString(n.Bytes()) }

func randomSerial() (*big.Int, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	b[0] &= 0x7f
	b[0] |= 0x01 // positive, non-zero, fixed length
	return new(big.Int).SetBytes(b), nil
}

// ensureCA returns the active root and intermediate, creating them when missing.
func (s *Service) ensureCA(ctx context.Context, q platform.Querier) (certRow, certRow, error) {
	root, err := s.activeCert(ctx, q, core.CertRoot, "", "")
	if errors.Is(err, core.ErrNotFound) {
		root, err = s.issue(ctx, q, nil, issueSpec{kind: core.CertRoot, cn: caOrg + " Root", org: caOrg, validity: RootValidity})
	}
	if err != nil {
		return certRow{}, certRow{}, err
	}
	inter, err := s.activeCert(ctx, q, core.CertIntermediate, "", root.ID)
	if errors.Is(err, core.ErrNotFound) {
		inter, err = s.issue(ctx, q, &root, issueSpec{kind: core.CertIntermediate, cn: caOrg + " Intermediate", org: caOrg,
			validity: IntermediateValidity})
	}
	if err != nil {
		return certRow{}, certRow{}, err
	}
	return root, inter, nil
}

func (s *Service) issueSP(ctx context.Context, q platform.Querier, inter certRow) (certRow, error) {
	cfg := s.d.Base.Cfg
	name := cfg.OperatorName
	if name == "" {
		name = "Operator"
	}
	return s.issue(ctx, q, &inter, issueSpec{kind: core.CertSP, cn: "SHAKEN " + cfg.SPC, org: name, spc: cfg.SPC,
		entries: []core.TNEntry{{SPC: cfg.SPC}}, validity: SPValidity})
}

// RotateSP issues a new operator SP certificate and revokes the previous
// active ones with reason "superseded".
func (s *Service) RotateSP(ctx context.Context) (core.Certificate, error) {
	var out certRow
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		_, inter, err := s.ensureCA(ctx, tx)
		if err != nil {
			return err
		}
		nc, err := s.issueSP(ctx, tx, inter)
		if err != nil {
			return err
		}
		ts := platform.TS(s.now())
		if _, err := tx.ExecContext(ctx, `UPDATE pki_certificates SET status = ?, revoked_at = ?, revoke_reason = ?
			WHERE kind = ? AND status = ? AND id <> ?`, StatusRevoked, ts, "superseded", string(core.CertSP), StatusActive, nc.ID); err != nil {
			return err
		}
		out = nc
		return platform.Audit(ctx, tx, "pki.sp.rotate", "certificate", nc.ID, map[string]any{"serial": nc.SerialHex})
	})
	if err != nil {
		return core.Certificate{}, err
	}
	s.notify(ctx, core.EventCertificateIssued, "", out.Certificate)
	return out.Certificate, nil
}

// RevokeCertificate revokes a certificate. The root cannot be revoked here.
func (s *Service) RevokeCertificate(ctx context.Context, id, reason string) (core.Certificate, error) {
	reason = strings.TrimSpace(reason)
	if reason == "" || utf8.RuneCountInString(reason) > 200 {
		return core.Certificate{}, core.Invalid("reason", "iptal gerekçesi 1-200 karakter olmalı")
	}
	var out certRow
	err := s.db.InTx(ctx, func(tx *platform.Tx) error {
		r, err := s.getCert(ctx, tx, `id = ?`, id)
		if err != nil {
			return err
		}
		if r.Kind == core.CertRoot {
			return core.Errorf(core.ErrState, "kök sertifika iptal edilemez")
		}
		if r.Status != StatusActive {
			return core.Errorf(core.ErrState, "sertifika zaten iptal edilmiş")
		}
		now := s.now()
		if _, err := tx.ExecContext(ctx, `UPDATE pki_certificates SET status = ?, revoked_at = ?, revoke_reason = ? WHERE id = ?`,
			StatusRevoked, platform.TS(now), reason, id); err != nil {
			return err
		}
		r.Status, r.RevokedAt, r.RevokeReason = StatusRevoked, &now, reason
		out = r
		return platform.Audit(ctx, tx, "pki.certificate.revoke", "certificate", id, map[string]any{"reason": reason, "kind": r.Kind})
	})
	return out.Certificate, err
}

// IssueDelegate issues an RFC 9060 delegate certificate for a verified entity
// whose TNAuthList lists the entity's active numbers.
func (s *Service) IssueDelegate(ctx context.Context, entityID string) (core.Certificate, error) {
	if entityID == "" {
		return core.Certificate{}, core.Errorf(core.ErrForbidden, "kurum hesabı gerekli")
	}
	if s.d.Directory == nil {
		return core.Certificate{}, core.Errorf(core.ErrState, "kurum dizini yapılandırılmamış")
	}
	ent, err := s.d.Directory.GetEntity(ctx, entityID)
	if err != nil {
		return core.Certificate{}, err
	}
	if ent.Status != core.EntityVerified {
		return core.Certificate{}, core.Errorf(core.ErrState, "kurum doğrulanmadan yetki sertifikası verilemez")
	}
	nums, err := s.d.Directory.NumbersOf(ctx, entityID)
	if err != nil {
		return core.Certificate{}, err
	}
	entries, err := activeEntries(nums)
	if err != nil {
		return core.Certificate{}, err
	}
	name := ent.TradeName
	if name == "" {
		name = ent.LegalName
	}
	cn := truncateRunes(name, 48) + " Delegate"
	var out certRow
	err = s.db.InTx(ctx, func(tx *platform.Tx) error {
		_, inter, err := s.ensureCA(ctx, tx)
		if err != nil {
			return err
		}
		out, err = s.issue(ctx, tx, &inter, issueSpec{kind: core.CertDelegate, cn: cn, org: truncateRunes(ent.LegalName, 64),
			entityID: entityID, entries: entries, validity: DelegateValidity})
		return err
	})
	if err != nil {
		return core.Certificate{}, err
	}
	s.notify(ctx, core.EventCertificateIssued, entityID, out.Certificate)
	return out.Certificate, nil
}

// activeEntries converts active numbers into TNAuthList entries.
func activeEntries(nums []core.Number) ([]core.TNEntry, error) {
	var out []core.TNEntry
	for _, n := range nums {
		if n.Status != core.NumberActive {
			continue
		}
		start, err1 := passport.TNDigits(n.RangeStart)
		end, err2 := passport.TNDigits(n.RangeEnd)
		if err1 != nil || err2 != nil || len(start) != len(end) || end < start {
			continue
		}
		if start == end {
			out = append(out, core.TNEntry{TN: start})
			continue
		}
		var a, b big.Int
		a.SetString(start, 10)
		b.SetString(end, 10)
		cnt := new(big.Int).Sub(&b, &a)
		cnt.Add(cnt, big.NewInt(1))
		out = append(out, core.TNEntry{Start: start, Count: cnt.Int64()})
	}
	if len(out) == 0 {
		return nil, core.Errorf(core.ErrState, "kurumun aktif numarası yok")
	}
	if len(out) > passport.MaxTNAuthEntries {
		return nil, core.Invalid("numbers", "yetki listesi için çok fazla numara")
	}
	return out, nil
}

func truncateRunes(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// ListCertificates returns every certificate (public material only), newest first.
func (s *Service) ListCertificates(ctx context.Context) ([]core.Certificate, error) {
	return s.listCerts(ctx, s.db, `1 = 1`)
}

// EntityCertificates returns the delegate certificates of an entity.
func (s *Service) EntityCertificates(ctx context.Context, entityID string) ([]core.Certificate, error) {
	return s.listCerts(ctx, s.db, `entity_id = ? AND kind = ?`, entityID, string(core.CertDelegate))
}
