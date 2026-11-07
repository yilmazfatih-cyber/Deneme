package passport

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
)

var b64 = base64.RawURLEncoding.Strict()

// Token is a parsed (not yet verified) compact JWS PASSporT.
type Token struct {
	Raw          string
	Header       Header
	Claims       Claims
	SigningInput string // base64url(header) "." base64url(payload)
	Signature    []byte // raw r||s
}

// Sign produces a compact JWS over the canonical header and claims with ES256.
// alg and typ are forced to ES256/passport; ppt and x5u are taken from h.
func Sign(key *ecdsa.PrivateKey, h Header, c Claims) (string, error) {
	if key == nil || key.Curve != elliptic.P256() {
		return "", errors.New("passport: signing key must be ECDSA P-256")
	}
	if h.X5U == "" || len(h.X5U) > MaxX5ULen {
		return "", errors.New("passport: x5u is required")
	}
	h.Alg, h.Typ = AlgES256, TypPassport
	hb, err := CanonicalJSON(h)
	if err != nil {
		return "", err
	}
	pb, err := CanonicalJSON(c)
	if err != nil {
		return "", err
	}
	input := b64.EncodeToString(hb) + "." + b64.EncodeToString(pb)
	digest := sha256.Sum256([]byte(input))
	r, s, err := ecdsa.Sign(rand.Reader, key, digest[:])
	if err != nil {
		return "", err
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	out := input + "." + b64.EncodeToString(sig)
	if len(out) > MaxJWSLen {
		return "", errors.New("passport: token too large")
	}
	return out, nil
}

// Parse decodes a compact JWS PASSporT without verifying it. It rejects
// oversized input, non-canonical base64url, detached payloads, duplicate JSON
// keys and unknown critical header parameters. alg is NOT checked here (Verify
// reports it as its own check); VerifySignature refuses anything but ES256.
func Parse(compact string) (*Token, error) {
	compact = strings.TrimSpace(compact)
	if compact == "" {
		return nil, errors.New("empty token")
	}
	if len(compact) > MaxJWSLen {
		return nil, errors.New("token too large")
	}
	parts := strings.Split(compact, ".")
	if len(parts) != 3 {
		return nil, errors.New("compact JWS must have three parts")
	}
	if parts[0] == "" || parts[1] == "" || parts[2] == "" {
		return nil, errors.New("JWS part empty (detached payload not supported)")
	}
	hb, err := b64.DecodeString(parts[0])
	if err != nil {
		return nil, errors.New("header is not base64url")
	}
	pb, err := b64.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("payload is not base64url")
	}
	sig, err := b64.DecodeString(parts[2])
	if err != nil {
		return nil, errors.New("signature is not base64url")
	}
	if err := checkJSON(hb); err != nil {
		return nil, fmt.Errorf("header: %w", err)
	}
	if err := checkJSON(pb); err != nil {
		return nil, fmt.Errorf("payload: %w", err)
	}
	var hm map[string]json.RawMessage
	if err := json.Unmarshal(hb, &hm); err != nil {
		return nil, errors.New("header is not a JSON object")
	}
	if crit, ok := hm["crit"]; ok {
		var names []string
		if err := json.Unmarshal(crit, &names); err != nil || len(names) == 0 {
			return nil, errors.New("header crit malformed")
		}
		for _, n := range names {
			if n != "ppt" {
				return nil, fmt.Errorf("unsupported critical header parameter %q", n)
			}
		}
	}
	t := &Token{Raw: compact, SigningInput: parts[0] + "." + parts[1], Signature: sig}
	if err := json.Unmarshal(hb, &t.Header); err != nil {
		return nil, errors.New("header fields malformed")
	}
	if err := json.Unmarshal(pb, &t.Claims); err != nil {
		return nil, errors.New("payload claims malformed")
	}
	return t, nil
}

// VerifySignature checks the ES256 signature with pub (P-256 only).
func (t *Token) VerifySignature(pub *ecdsa.PublicKey) error {
	if t.Header.Alg != AlgES256 {
		return fmt.Errorf("alg %q not allowed", t.Header.Alg)
	}
	if pub == nil || pub.Curve != elliptic.P256() {
		return errors.New("certificate key is not ECDSA P-256")
	}
	if len(t.Signature) != 64 {
		return errors.New("ES256 signature must be 64 bytes")
	}
	r := new(big.Int).SetBytes(t.Signature[:32])
	s := new(big.Int).SetBytes(t.Signature[32:])
	digest := sha256.Sum256([]byte(t.SigningInput))
	if !ecdsa.Verify(pub, digest[:], r, s) {
		return errors.New("signature invalid")
	}
	return nil
}
