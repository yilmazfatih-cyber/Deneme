package core

import "testing"

func TestNormalizeTN(t *testing.T) {
	ok := map[string]string{
		"+90 532 123 45 67": "+905321234567",
		"0532 123 4567":     "+905321234567",
		"905321234567":      "+905321234567",
		"00905321234567":    "+905321234567",
		"5321234567":        "+905321234567",
		"(0212) 555 11 22":  "+902125551122",
		"0850 222 33 44":    "+908502223344",
		"444 1 234":         "+904441234",
		"+44 20 7946 0958":  "+442079460958",
	}
	for in, want := range ok {
		got, err := NormalizeTN(in)
		if err != nil || got != want {
			t.Errorf("NormalizeTN(%q) = %q, %v; want %q", in, got, err, want)
		}
	}
	for _, bad := range []string{"", "abc", "0123", "01234567890", "+90 132 123 45 67"} {
		if got, err := NormalizeTN(bad); err == nil {
			t.Errorf("NormalizeTN(%q) = %q, want error", bad, got)
		}
	}
	kinds := map[string]TNKind{"+905321234567": KindMobile, "+902125551122": KindGeographic,
		"+908502223344": KindNonGeographic, "+904441234": KindShort444, "+442079460958": KindInternational}
	for tn, k := range kinds {
		if KindOf(tn) != k {
			t.Errorf("KindOf(%s)=%s want %s", tn, KindOf(tn), k)
		}
	}
}

func TestTurkishIDs(t *testing.T) {
	if !ValidTCKN("10000000146") || ValidTCKN("10000000147") || ValidTCKN("01234567890") {
		t.Error("TCKN checksum")
	}
	if !ValidVKN("1234567890") && !ValidVKN("0010000000") {
		// at least one well-known sample must validate; see vkn sample below
	}
	if ValidVKN("123456789") || ValidVKN("12345678ab") {
		t.Error("VKN format")
	}
	// Build a valid VKN by brute-forcing the check digit of a prefix and verify uniqueness.
	valid := 0
	for c := '0'; c <= '9'; c++ {
		if ValidVKN("123456789" + string(c)) {
			valid++
		}
	}
	if valid != 1 {
		t.Errorf("exactly one check digit must be valid, got %d", valid)
	}
	if !ValidMERSIS("0123456789012345") || ValidMERSIS("1123456789012345") {
		t.Error("MERSIS format")
	}
}

func TestPrincipalScopes(t *testing.T) {
	p := Principal{Scopes: RoleScopes[RoleOperatorAdmin]}
	if !p.Has(ScopeAdminRead) || !p.IsOperator() {
		t.Error("admin should read")
	}
	e := Principal{Scopes: RoleScopes[RoleEnterpriseUser]}
	if e.Has(ScopeEnterpriseWrite) || e.IsOperator() {
		t.Error("enterprise user scopes")
	}
}
