package passport

import (
	"errors"
	"fmt"
	"strings"
)

// Identity is a parsed SIP Identity header value (RFC 8224).
type Identity struct {
	JWS  string
	Info string // x5u from the info parameter, angle brackets removed
	Alg  string
	PPT  string
}

// FormatIdentity renders `<jws>;info=<x5u>;alg=ES256;ppt=<ppt>` with the
// info URI enclosed in angle brackets as RFC 8224 requires.
func FormatIdentity(jws, x5u, ppt string) string {
	return jws + ";info=<" + x5u + ">;alg=" + AlgES256 + ";ppt=" + ppt
}

// ParseIdentity parses an Identity header value. It accepts a bare compact
// JWS, an optional leading "Identity:" header name, the info URI with or
// without angle brackets, quoted parameter values, any parameter order and
// case-insensitive parameter names. Unknown parameters are ignored;
// duplicated parameters are rejected.
func ParseIdentity(v string) (Identity, error) {
	v = strings.TrimSpace(v)
	if len(v) > MaxIdentityLen {
		return Identity{}, errors.New("identity header too large")
	}
	if len(v) >= 9 && strings.EqualFold(v[:9], "identity:") {
		v = strings.TrimSpace(v[9:])
	}
	if v == "" {
		return Identity{}, errors.New("identity header empty")
	}
	var id Identity
	semi := strings.IndexByte(v, ';')
	if semi < 0 {
		id.JWS = v
		return id, nil
	}
	id.JWS = strings.TrimSpace(v[:semi])
	if id.JWS == "" {
		return Identity{}, errors.New("identity header has no JWS")
	}
	rest := v[semi:]
	seen := map[string]bool{}
	for i := 0; i < len(rest); {
		c := rest[i]
		if c == ';' || c == ' ' || c == '\t' {
			i++
			continue
		}
		start := i
		for i < len(rest) && rest[i] != '=' && rest[i] != ';' {
			i++
		}
		name := strings.ToLower(strings.TrimSpace(rest[start:i]))
		if name == "" {
			return Identity{}, errors.New("identity parameter without name")
		}
		val := ""
		if i < len(rest) && rest[i] == '=' {
			i++
			for i < len(rest) && (rest[i] == ' ' || rest[i] == '\t') {
				i++
			}
			switch {
			case i < len(rest) && rest[i] == '<':
				end := strings.IndexByte(rest[i:], '>')
				if end < 0 {
					return Identity{}, errors.New("unterminated '<' in identity parameter")
				}
				val = rest[i+1 : i+end]
				i += end + 1
			case i < len(rest) && rest[i] == '"':
				end := strings.IndexByte(rest[i+1:], '"')
				if end < 0 {
					return Identity{}, errors.New("unterminated quote in identity parameter")
				}
				val = rest[i+1 : i+1+end]
				i += end + 2
			default:
				s := i
				for i < len(rest) && rest[i] != ';' {
					i++
				}
				val = strings.TrimSpace(rest[s:i])
			}
		}
		if seen[name] {
			return Identity{}, fmt.Errorf("duplicate identity parameter %q", name)
		}
		seen[name] = true
		val = strings.TrimSpace(val)
		switch name {
		case "info":
			id.Info = val
		case "alg":
			id.Alg = val
		case "ppt":
			id.PPT = val
		}
	}
	if len(id.Info) > MaxX5ULen {
		return Identity{}, errors.New("info parameter too long")
	}
	return id, nil
}
