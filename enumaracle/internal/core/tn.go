package core

import "strings"

// TNKind classifies a normalized number.
type TNKind string

const (
	KindMobile        TNKind = "mobile"             // +90 5xx
	KindGeographic    TNKind = "geographic"         // +90 2xx/3xx/4xx
	KindNonGeographic TNKind = "non_geographic_850" // +90 850
	KindTollFree      TNKind = "toll_free"          // +90 800
	KindPremium       TNKind = "premium"            // +90 900
	KindShort444      TNKind = "short_444"          // 444 xxxx corporate short number
	KindInternational TNKind = "international"      // non-TR E.164
	KindOther         TNKind = "other"
)

// NormalizeTN converts Turkish and international dialing forms to E.164 with a
// leading '+'. Accepted: "+90 532 123 45 67", "0532 123 4567", "90532...",
// "0090532...", "5321234567", "444 1 234" (-> "+904441234"), "+44 20 ...".
func NormalizeTN(in string) (string, error) {
	var b strings.Builder
	plus := false
	for i, r := range strings.TrimSpace(in) {
		switch {
		case r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == '+' && i == 0:
			plus = true
		case r == ' ' || r == '-' || r == '(' || r == ')' || r == '.' || r == '/':
		default:
			return "", Invalid("tn", "numara yalnızca rakam içermeli")
		}
	}
	d := b.String()
	if d == "" {
		return "", Invalid("tn", "numara boş")
	}
	if !plus && strings.HasPrefix(d, "00") {
		plus, d = true, d[2:]
	}
	if plus {
		if strings.HasPrefix(d, "90") {
			return trNational(d[2:])
		}
		if len(d) < 8 || len(d) > 15 || d[0] == '0' {
			return "", Invalid("tn", "geçersiz uluslararası numara")
		}
		return "+" + d, nil
	}
	switch {
	case len(d) == 7 && strings.HasPrefix(d, "444"):
		return "+90" + d, nil
	case len(d) == 12 && strings.HasPrefix(d, "90"):
		return trNational(d[2:])
	case len(d) == 11 && d[0] == '0':
		return trNational(d[1:])
	case len(d) == 10:
		return trNational(d)
	}
	return "", Invalid("tn", "numara tanınmadı; +90 ile başlayan 10 haneli biçim bekleniyor")
}

func trNational(n string) (string, error) {
	if len(n) == 7 && strings.HasPrefix(n, "444") {
		return "+90" + n, nil
	}
	if len(n) != 10 || n[0] == '0' || n[0] == '1' || n[0] == '6' || n[0] == '7' || n[0] == '9' && !strings.HasPrefix(n, "900") {
		return "", Invalid("tn", "Türkiye numarası 10 haneli olmalı ve 2, 3, 4, 5, 8 veya 900 ile başlamalı")
	}
	return "+90" + n, nil
}

// KindOf classifies an already normalized E.164 number.
func KindOf(tn string) TNKind {
	if !strings.HasPrefix(tn, "+90") {
		if strings.HasPrefix(tn, "+") {
			return KindInternational
		}
		return KindOther
	}
	n := tn[3:]
	switch {
	case len(n) == 7 && strings.HasPrefix(n, "444"):
		return KindShort444
	case strings.HasPrefix(n, "5"):
		return KindMobile
	case strings.HasPrefix(n, "850"):
		return KindNonGeographic
	case strings.HasPrefix(n, "800"):
		return KindTollFree
	case strings.HasPrefix(n, "900"):
		return KindPremium
	case n[0] >= '2' && n[0] <= '4':
		return KindGeographic
	}
	return KindOther
}

// Digits returns the E.164 number without '+', as used in TNAuthList and ENUM.
func Digits(tn string) string { return strings.TrimPrefix(tn, "+") }
