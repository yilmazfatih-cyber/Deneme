// Package passport implements STIR/SHAKEN PASSporTs (RFC 8225, RFC 8588
// "shaken", RFC 9795 "rcd") as compact JWS signed with ES256, the SIP Identity
// header (RFC 8224), the RFC 8226 TNAuthList certificate extension and
// verification against a caller supplied certificate store. It is pure: no
// database, no network and no global state.
package passport

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// Protocol constants.
const (
	AlgES256    = "ES256"
	TypPassport = "passport"
	PPTShaken   = "shaken"
	PPTRCD      = "rcd"
)

// Size bounds applied to untrusted input.
const (
	MaxJWSLen      = 8192  // compact JWS
	MaxIdentityLen = 10240 // SIP Identity header value
	MaxX5ULen      = 1024
	maxJSONDepth   = 8
)

// Header is the protected JOSE header of a PASSporT.
type Header struct {
	Alg string `json:"alg"`
	Ppt string `json:"ppt,omitempty"`
	Typ string `json:"typ,omitempty"`
	X5U string `json:"x5u"`
}

// OrigClaim is the "orig" claim; only telephone numbers are used.
type OrigClaim struct {
	TN string `json:"tn"`
}

// DestClaim is the "dest" claim; "tn" is an array per RFC 8225.
type DestClaim struct {
	TN []string `json:"tn"`
}

// Claims is the payload of a shaken or rcd PASSporT.
type Claims struct {
	Attest core.Attest       `json:"attest,omitempty"`
	Dest   DestClaim         `json:"dest"`
	IAT    int64             `json:"iat"`
	Orig   OrigClaim         `json:"orig"`
	OrigID string            `json:"origid,omitempty"`
	RCD    *core.RCDClaims   `json:"rcd,omitempty"`
	RCDI   map[string]string `json:"rcdi,omitempty"`
}

// TNDigits converts an E.164 number ("+905321234567") or bare digits into the
// PASSporT form: 1..15 digits without '+'.
func TNDigits(tn string) (string, error) {
	d := strings.TrimPrefix(strings.TrimSpace(tn), "+")
	if len(d) < 1 || len(d) > 15 {
		return "", fmt.Errorf("passport: telephone number must have 1..15 digits")
	}
	for i := 0; i < len(d); i++ {
		if d[i] < '0' || d[i] > '9' {
			return "", fmt.Errorf("passport: telephone number must contain digits only")
		}
	}
	return d, nil
}

// NewShaken builds RFC 8588 shaken claims. orig and dest may be E.164 or digits.
func NewShaken(attest core.Attest, orig, dest string, iat int64, origID string) (Claims, error) {
	switch attest {
	case core.AttestA, core.AttestB, core.AttestC:
	default:
		return Claims{}, fmt.Errorf("passport: attest must be A, B or C")
	}
	o, err := TNDigits(orig)
	if err != nil {
		return Claims{}, err
	}
	d, err := TNDigits(dest)
	if err != nil {
		return Claims{}, err
	}
	if iat <= 0 {
		return Claims{}, errors.New("passport: iat must be positive")
	}
	if origID == "" || len(origID) > 128 {
		return Claims{}, errors.New("passport: origid must be 1..128 characters")
	}
	return Claims{Attest: attest, Dest: DestClaim{TN: []string{d}}, IAT: iat, Orig: OrigClaim{TN: o}, OrigID: origID}, nil
}

// WithRCD returns a copy of base carrying the RFC 9795 rcd claim and the rcdi
// integrity digests for the "/nam" and (when set) "/crn" JSON pointers.
func WithRCD(base Claims, rcd core.RCDClaims) (Claims, error) {
	if strings.TrimSpace(rcd.Nam) == "" {
		return Claims{}, errors.New("passport: rcd nam is required")
	}
	if !utf8.ValidString(rcd.Nam) || !utf8.ValidString(rcd.Crn) || !utf8.ValidString(rcd.Icn) {
		return Claims{}, errors.New("passport: rcd values must be UTF-8")
	}
	c := base
	r := rcd
	c.RCD = &r
	c.RCDI = map[string]string{"/nam": RCDDigest(rcd.Nam)}
	if rcd.Crn != "" {
		c.RCDI["/crn"] = RCDDigest(rcd.Crn)
	}
	return c, nil
}

// RCDDigest returns the rcdi digest of a string member: "sha256-" followed by
// the standard base64 of SHA-256 over the member's UTF-8 value.
func RCDDigest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return "sha256-" + base64.StdEncoding.EncodeToString(sum[:])
}

// CheckRCDI verifies the rcdi digests of an rcd claim. "/nam" is mandatory;
// "/crn" is mandatory when crn is present; "/icn" (content integrity of the
// referenced logo) is out of scope and ignored; any other pointer is rejected.
func CheckRCDI(c Claims) error {
	if c.RCD == nil {
		return errors.New("rcd claim missing")
	}
	if len(c.RCDI) == 0 {
		return errors.New("rcdi claim missing")
	}
	if len(c.RCDI) > 8 {
		return errors.New("rcdi has too many members")
	}
	want := map[string]string{"/nam": c.RCD.Nam}
	if c.RCD.Crn != "" {
		want["/crn"] = c.RCD.Crn
	}
	for ptr := range c.RCDI {
		if _, ok := want[ptr]; !ok && ptr != "/icn" {
			return fmt.Errorf("rcdi pointer %q not supported", ptr)
		}
	}
	for ptr, v := range want {
		got, ok := c.RCDI[ptr]
		if !ok {
			return fmt.Errorf("rcdi digest for %s missing", ptr)
		}
		if !constantTimeEqual(got, RCDDigest(v)) {
			return fmt.Errorf("rcdi digest for %s does not match", ptr)
		}
	}
	return nil
}

// CanonicalJSON serialises v per RFC 8225 §9: object keys in lexicographic
// (code point) order, no insignificant whitespace, no HTML escaping. The
// output is deterministic for equal inputs.
func CanonicalJSON(v any) ([]byte, error) {
	raw, err := marshalNoEscape(v)
	if err != nil {
		return nil, err
	}
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	var x any
	if err := dec.Decode(&x); err != nil {
		return nil, err
	}
	var b bytes.Buffer
	if err := writeCanonical(&b, x); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}

func marshalNoEscape(v any) ([]byte, error) {
	var b bytes.Buffer
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(b.Bytes(), "\n"), nil
}

func writeCanonical(b *bytes.Buffer, x any) error {
	switch t := x.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		if t {
			b.WriteString("true")
		} else {
			b.WriteString("false")
		}
	case json.Number:
		b.WriteString(t.String())
	case string:
		s, err := marshalNoEscape(t)
		if err != nil {
			return err
		}
		b.Write(s)
	case []any:
		b.WriteByte('[')
		for i, e := range t {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := writeCanonical(b, e); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(t))
		for k := range t {
			keys = append(keys, k)
		}
		sort.Strings(keys) // byte order of UTF-8 == code point order
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			ks, err := marshalNoEscape(k)
			if err != nil {
				return err
			}
			b.Write(ks)
			b.WriteByte(':')
			if err := writeCanonical(b, t[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	default:
		return fmt.Errorf("passport: unsupported JSON value %T", x)
	}
	return nil
}

// checkJSON rejects duplicate object keys, excessive nesting and trailing data
// so that the signed bytes have exactly one interpretation.
func checkJSON(data []byte) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := walkJSON(dec, 0); err != nil {
		return err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return errors.New("trailing data after JSON value")
	}
	return nil
}

func walkJSON(dec *json.Decoder, depth int) error {
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	d, ok := tok.(json.Delim)
	if !ok {
		return nil
	}
	if depth >= maxJSONDepth {
		return errors.New("JSON nested too deeply")
	}
	switch d {
	case '{':
		seen := map[string]struct{}{}
		for dec.More() {
			kt, err := dec.Token()
			if err != nil {
				return err
			}
			k, ok := kt.(string)
			if !ok {
				return errors.New("invalid object key")
			}
			if _, dup := seen[k]; dup {
				return fmt.Errorf("duplicate JSON key %q", k)
			}
			seen[k] = struct{}{}
			if err := walkJSON(dec, depth+1); err != nil {
				return err
			}
		}
	case '[':
		for dec.More() {
			if err := walkJSON(dec, depth+1); err != nil {
				return err
			}
		}
	default:
		return errors.New("unexpected JSON delimiter")
	}
	_, err = dec.Token() // closing delimiter
	return err
}

func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
