package passport

import (
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/asn1"
	"errors"
	"fmt"
	"strconv"

	"github.com/yilmazfatih-cyber/deneme/enumaracle/internal/core"
)

// OIDTNAuthList is id-pe-TNAuthList (RFC 8226).
var OIDTNAuthList = asn1.ObjectIdentifier{1, 3, 6, 1, 5, 5, 7, 1, 26}

// Bounds for TNAuthList content.
const (
	MaxTNAuthEntries = 10000
	maxTNAuthDER     = 512 << 10
	maxSPCLen        = 64
	maxRangeCount    = 1_000_000_000
)

// RFC 8226 Appendix A uses EXPLICIT TAGS:
//
//	TNAuthorizationList ::= SEQUENCE SIZE (1..MAX) OF TNEntry
//	TNEntry ::= CHOICE {
//	  spc   [0] ServiceProviderCode,      -- IA5String
//	  range [1] TelephoneNumberRange,     -- SEQUENCE { start TelephoneNumber, count INTEGER (2..MAX), ... }
//	  one   [2] TelephoneNumber }         -- IA5String SIZE (1..15)
type tnRange struct {
	Start string `asn1:"ia5"`
	Count int64
}

// MarshalTNAuthList DER-encodes entries as an RFC 8226 TNAuthorizationList.
// A range with count 1 is encoded as a single TelephoneNumber.
func MarshalTNAuthList(entries []core.TNEntry) ([]byte, error) {
	if len(entries) == 0 || len(entries) > MaxTNAuthEntries {
		return nil, fmt.Errorf("tnauthlist: need 1..%d entries", MaxTNAuthEntries)
	}
	raws := make([]asn1.RawValue, 0, len(entries))
	for i, e := range entries {
		var tag int
		var inner []byte
		var err error
		switch {
		case e.SPC != "" && e.TN == "" && e.Start == "":
			if !validSPC(e.SPC) {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid spc", i)
			}
			tag = 0
			inner, err = asn1.MarshalWithParams(e.SPC, "ia5")
		case e.TN != "" && e.SPC == "" && e.Start == "":
			if !validTN(e.TN) {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid tn", i)
			}
			tag = 2
			inner, err = asn1.MarshalWithParams(e.TN, "ia5")
		case e.Start != "" && e.SPC == "" && e.TN == "":
			if !validTN(e.Start) || e.Count < 1 || e.Count > maxRangeCount {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid range", i)
			}
			if e.Count == 1 {
				tag = 2
				inner, err = asn1.MarshalWithParams(e.Start, "ia5")
			} else {
				tag = 1
				inner, err = asn1.Marshal(tnRange{Start: e.Start, Count: e.Count})
			}
		default:
			return nil, fmt.Errorf("tnauthlist: entry %d must set exactly one of spc, tn, start", i)
		}
		if err != nil {
			return nil, err
		}
		raws = append(raws, asn1.RawValue{Class: asn1.ClassContextSpecific, Tag: tag, IsCompound: true, Bytes: inner})
	}
	return asn1.Marshal(raws)
}

// ParseTNAuthList decodes a DER TNAuthorizationList strictly.
func ParseTNAuthList(der []byte) ([]core.TNEntry, error) {
	if len(der) == 0 || len(der) > maxTNAuthDER {
		return nil, errors.New("tnauthlist: bad length")
	}
	var raws []asn1.RawValue
	rest, err := asn1.Unmarshal(der, &raws)
	if err != nil {
		return nil, fmt.Errorf("tnauthlist: %w", err)
	}
	if len(rest) != 0 {
		return nil, errors.New("tnauthlist: trailing data")
	}
	if len(raws) == 0 || len(raws) > MaxTNAuthEntries {
		return nil, errors.New("tnauthlist: entry count out of range")
	}
	out := make([]core.TNEntry, 0, len(raws))
	for i, rv := range raws {
		if rv.Class != asn1.ClassContextSpecific || !rv.IsCompound {
			return nil, fmt.Errorf("tnauthlist: entry %d: expected explicit context tag", i)
		}
		switch rv.Tag {
		case 0:
			s, err := parseIA5(rv.Bytes)
			if err != nil || !validSPC(s) {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid spc", i)
			}
			out = append(out, core.TNEntry{SPC: s})
		case 1:
			var seq asn1.RawValue
			r, err := asn1.Unmarshal(rv.Bytes, &seq)
			if err != nil || len(r) != 0 || seq.Class != asn1.ClassUniversal || seq.Tag != asn1.TagSequence {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid range", i)
			}
			var startRaw asn1.RawValue
			r, err = asn1.Unmarshal(seq.Bytes, &startRaw)
			if err != nil || startRaw.Class != asn1.ClassUniversal || startRaw.Tag != asn1.TagIA5String {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid range start", i)
			}
			var count int64
			r, err = asn1.Unmarshal(r, &count)
			// RFC 8226 TelephoneNumberRange is extensible ("..."): further
			// elements after count are tolerated and ignored.
			_ = r
			start := string(startRaw.Bytes)
			if err != nil || !validTN(start) || count < 2 || count > maxRangeCount {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid range", i)
			}
			out = append(out, core.TNEntry{Start: start, Count: count})
		case 2:
			s, err := parseIA5(rv.Bytes)
			if err != nil || !validTN(s) {
				return nil, fmt.Errorf("tnauthlist: entry %d: invalid telephone number", i)
			}
			out = append(out, core.TNEntry{TN: s})
		default:
			return nil, fmt.Errorf("tnauthlist: entry %d: unknown tag [%d]", i, rv.Tag)
		}
	}
	return out, nil
}

func parseIA5(b []byte) (string, error) {
	var rv asn1.RawValue
	rest, err := asn1.Unmarshal(b, &rv)
	if err != nil {
		return "", err
	}
	if len(rest) != 0 || rv.Class != asn1.ClassUniversal || rv.Tag != asn1.TagIA5String || rv.IsCompound {
		return "", errors.New("expected IA5String")
	}
	return string(rv.Bytes), nil
}

// TNAuthListExtension returns the non-critical X.509 extension for entries.
// (Critical would make standard verifiers that do not know the OID reject the chain.)
func TNAuthListExtension(entries []core.TNEntry) (pkix.Extension, error) {
	der, err := MarshalTNAuthList(entries)
	if err != nil {
		return pkix.Extension{}, err
	}
	return pkix.Extension{Id: OIDTNAuthList, Critical: false, Value: der}, nil
}

// TNAuthListFromCert extracts and decodes the TNAuthList of a certificate.
func TNAuthListFromCert(c *x509.Certificate) ([]core.TNEntry, error) {
	var found []byte
	for _, e := range c.Extensions {
		if e.Id.Equal(OIDTNAuthList) {
			if found != nil {
				return nil, errors.New("tnauthlist: duplicate extension")
			}
			found = e.Value
		}
	}
	if found == nil {
		return nil, errors.New("tnauthlist: extension missing")
	}
	return ParseTNAuthList(found)
}

// Covers reports whether entries authorize the telephone number tnDigits
// (digits, no '+'). An SPC entry covers every number when its code is in
// trustedSPCs (any SPC when trustedSPCs is empty). A TelephoneNumber must
// match exactly; a range covers numbers of the same length in [start, start+count).
func Covers(entries []core.TNEntry, tnDigits string, trustedSPCs []string) (bool, string) {
	if !validTN(tnDigits) {
		return false, ""
	}
	tnv, _ := strconv.ParseUint(tnDigits, 10, 64)
	for _, e := range entries {
		switch {
		case e.SPC != "":
			if len(trustedSPCs) == 0 {
				return true, "spc:" + e.SPC
			}
			for _, s := range trustedSPCs {
				if s == e.SPC {
					return true, "spc:" + e.SPC
				}
			}
		case e.TN != "":
			if e.TN == tnDigits {
				return true, "tn:" + e.TN
			}
		case e.Start != "":
			if len(e.Start) != len(tnDigits) || e.Count < 1 {
				continue
			}
			sv, err := strconv.ParseUint(e.Start, 10, 64)
			if err != nil {
				continue
			}
			if tnv >= sv && tnv-sv < uint64(e.Count) {
				return true, fmt.Sprintf("range:%s+%d", e.Start, e.Count)
			}
		}
	}
	return false, ""
}

func validTN(s string) bool {
	if len(s) < 1 || len(s) > 15 {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func validSPC(s string) bool {
	if len(s) < 1 || len(s) > maxSPCLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if c < 0x21 || c > 0x7e {
			return false
		}
	}
	return true
}
