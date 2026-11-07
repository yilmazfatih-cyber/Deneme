package pki

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"strings"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/platform"
)

const certCols = `id, kind, entity_id, issuer_id, key_id, serial_hex, subject_cn, spc, tn_auth_list,
	not_before, not_after, pem, x5u, status, revoked_at, revoke_reason, created_at`

// certRow is a certificate with its (private) key reference.
type certRow struct {
	core.Certificate
	KeyID string
}

type scanner interface{ Scan(dest ...any) error }

func scanCert(sc scanner) (certRow, error) {
	var r certRow
	var tnl, nb, na, revAt, created string
	err := sc.Scan(&r.ID, &r.Kind, &r.EntityID, &r.IssuerID, &r.KeyID, &r.SerialHex, &r.SubjectCN, &r.SPC, &tnl,
		&nb, &na, &r.PEM, &r.X5U, &r.Status, &revAt, &r.RevokeReason, &created)
	if err != nil {
		return r, err
	}
	if tnl != "" && tnl != "[]" {
		if err := json.Unmarshal([]byte(tnl), &r.TNAuthList); err != nil {
			return r, err
		}
	}
	r.NotBefore, r.NotAfter = platform.ParseTS(nb), platform.ParseTS(na)
	r.RevokedAt = platform.ParseTSPtr(revAt)
	r.CreatedAt = platform.ParseTS(created)
	return r, nil
}

func (s *Service) getCert(ctx context.Context, q platform.Querier, where string, args ...any) (certRow, error) {
	r, err := scanCert(q.QueryRowContext(ctx, `SELECT `+certCols+` FROM pki_certificates WHERE `+where, args...))
	if errors.Is(err, sql.ErrNoRows) {
		return r, core.Errorf(core.ErrNotFound, "sertifika bulunamadı")
	}
	return r, err
}

func (s *Service) listCerts(ctx context.Context, q platform.Querier, where string, args ...any) ([]core.Certificate, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+certCols+` FROM pki_certificates WHERE `+where+` ORDER BY created_at DESC, id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []core.Certificate{}
	for rows.Next() {
		r, err := scanCert(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r.Certificate)
	}
	return out, rows.Err()
}

// activeCert returns the newest active certificate of kind that is valid now.
// entityID filters delegate certificates; issuerID ("" = any) filters by issuer.
func (s *Service) activeCert(ctx context.Context, q platform.Querier, kind core.CertKind, entityID, issuerID string) (certRow, error) {
	now := platform.TS(s.now())
	return s.getCert(ctx, q, `kind = ? AND entity_id = ? AND status = ? AND not_before <= ? AND not_after > ?
		AND (? = '' OR issuer_id = ?) ORDER BY created_at DESC, id LIMIT 1`,
		string(kind), entityID, StatusActive, now, now, issuerID, issuerID)
}

func (s *Service) insertCert(ctx context.Context, q platform.Querier, r certRow) error {
	tnl := "[]"
	if len(r.TNAuthList) > 0 {
		b, err := json.Marshal(r.TNAuthList)
		if err != nil {
			return err
		}
		tnl = string(b)
	}
	_, err := q.ExecContext(ctx, `INSERT INTO pki_certificates (`+certCols+`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, string(r.Kind), r.EntityID, r.IssuerID, r.KeyID, r.SerialHex, r.SubjectCN, r.SPC, tnl,
		platform.TS(r.NotBefore), platform.TS(r.NotAfter), r.PEM, r.X5U, r.Status, platform.TSPtr(r.RevokedAt),
		r.RevokeReason, platform.TS(r.CreatedAt))
	return err
}

// newKey generates a P-256 key and stores it sealed with AAD = key id.
func (s *Service) newKey(ctx context.Context, q platform.Querier) (string, *ecdsa.PrivateKey, error) {
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return "", nil, err
	}
	der, err := x509.MarshalPKCS8PrivateKey(k)
	if err != nil {
		return "", nil, err
	}
	id := core.NewID()
	sealed, err := s.d.Base.Sealer.Seal(der, id)
	clear(der)
	if err != nil {
		return "", nil, err
	}
	pub, err := x509.MarshalPKIXPublicKey(&k.PublicKey)
	if err != nil {
		return "", nil, err
	}
	_, err = q.ExecContext(ctx, `INSERT INTO pki_keys (id, alg, public_der, sealed_private, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, "ES256", base64.StdEncoding.EncodeToString(pub), base64.StdEncoding.EncodeToString(sealed), platform.TS(s.now()))
	if err != nil {
		return "", nil, err
	}
	s.mu.Lock()
	s.keys[id] = k
	s.mu.Unlock()
	return id, k, nil
}

// loadKey unseals a private key (cached in process memory afterwards).
func (s *Service) loadKey(ctx context.Context, q platform.Querier, id string) (*ecdsa.PrivateKey, error) {
	s.mu.Lock()
	k, ok := s.keys[id]
	s.mu.Unlock()
	if ok {
		return k, nil
	}
	var sealedB64 string
	if err := q.QueryRowContext(ctx, `SELECT sealed_private FROM pki_keys WHERE id = ?`, id).Scan(&sealedB64); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, core.Errorf(core.ErrNotFound, "anahtar bulunamadı")
		}
		return nil, err
	}
	sealed, err := base64.StdEncoding.DecodeString(sealedB64)
	if err != nil {
		return nil, errors.New("pki: sealed key corrupt")
	}
	der, err := s.d.Base.Sealer.Open(sealed, id)
	if err != nil {
		return nil, errors.New("pki: key cannot be unsealed")
	}
	pk, err := x509.ParsePKCS8PrivateKey(der)
	clear(der)
	if err != nil {
		return nil, errors.New("pki: key corrupt")
	}
	ek, ok := pk.(*ecdsa.PrivateKey)
	if !ok || ek.Curve != elliptic.P256() {
		return nil, errors.New("pki: key is not P-256")
	}
	s.mu.Lock()
	s.keys[id] = ek
	s.mu.Unlock()
	return ek, nil
}

// parsed returns the parsed x509 certificate of a row (cached; certificates are immutable).
func (s *Service) parsed(r certRow) (*x509.Certificate, error) {
	s.mu.Lock()
	c, ok := s.certs[r.ID]
	s.mu.Unlock()
	if ok {
		return c, nil
	}
	b, _ := pem.Decode([]byte(r.PEM))
	if b == nil || b.Type != "CERTIFICATE" {
		return nil, errors.New("pki: stored certificate is not PEM")
	}
	c, err := x509.ParseCertificate(b.Bytes)
	if err != nil {
		return nil, err
	}
	s.mu.Lock()
	s.certs[r.ID] = c
	s.mu.Unlock()
	return c, nil
}

// chainRows returns r followed by its issuers up to, but excluding, the root.
func (s *Service) chainRows(ctx context.Context, q platform.Querier, r certRow) ([]certRow, error) {
	out := []certRow{r}
	cur := r
	for i := 0; i < 4 && cur.Kind != core.CertRoot && cur.IssuerID != ""; i++ {
		iss, err := s.getCert(ctx, q, `id = ?`, cur.IssuerID)
		if err != nil {
			return nil, err
		}
		if iss.Kind == core.CertRoot {
			break
		}
		out = append(out, iss)
		cur = iss
	}
	return out, nil
}

// ChainPEM returns the PEM of certificate id followed by its intermediate(s): the x5u document.
func (s *Service) ChainPEM(ctx context.Context, id string) ([]byte, error) {
	r, err := s.getCert(ctx, s.db, `id = ?`, id)
	if err != nil {
		return nil, err
	}
	rows, err := s.chainRows(ctx, s.db, r)
	if err != nil {
		return nil, err
	}
	var b strings.Builder
	for _, c := range rows {
		b.WriteString(strings.TrimSpace(c.PEM))
		b.WriteByte('\n')
	}
	return []byte(b.String()), nil
}
