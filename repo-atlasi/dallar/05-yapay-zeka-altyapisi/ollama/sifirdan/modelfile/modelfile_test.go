package modelfile

import (
	"errors"
	"strings"
	"testing"
)

const ornek = `# yorum satırı
FROM ./agirliklar.txt
parameter temperature 0.7
PARAMETER stop "<|user|>"
PARAMETER stop "\n\n"
SYSTEM """Kısa
ve nazik ol."""
TEMPLATE """{{ .Prompt }}"""
MESSAGE user Merhaba
MESSAGE assistant "Merhaba, buyurun."
`

func TestParseTamOrnek(t *testing.T) {
	mf, err := Parse(strings.NewReader(ornek))
	if err != nil {
		t.Fatal(err)
	}
	if mf.From != "./agirliklar.txt" || mf.System != "Kısa\nve nazik ol." || mf.Template != "{{ .Prompt }}" {
		t.Fatalf("beklenmeyen sonuç: %+v", mf)
	}
	if got := mf.Parameters["stop"]; len(got) != 2 || got[0] != "<|user|>" || got[1] != "\n\n" {
		t.Fatalf("stop: %q", got)
	}
	if len(mf.Messages) != 2 || mf.Messages[1].Content != "Merhaba, buyurun." {
		t.Fatalf("mesajlar: %+v", mf.Messages)
	}
	opts, err := Options(mf.Parameters)
	if err != nil || opts["temperature"].(float64) != 0.7 {
		t.Fatalf("seçenekler: %v %v", opts, err)
	}
}

func TestStringGidisDonus(t *testing.T) {
	mf, _ := Parse(strings.NewReader(ornek))
	again, err := Parse(strings.NewReader(mf.String()))
	if err != nil {
		t.Fatal(err)
	}
	if again.String() != mf.String() {
		t.Fatalf("gidiş-dönüş farklı:\n%s\n---\n%s", mf.String(), again.String())
	}
}

func TestHatalarSatirNumarasiyla(t *testing.T) {
	cases := map[string]string{
		"PARAMETER temperature 1":           "FROM satırı yok",
		"FROM x\nUÇUR yüksek":               "satır 2",
		"FROM x\nPARAMETER sicaklik 1":      "bilinmeyen parametre",
		"FROM x\nSYSTEM \"\"\"bitmeyen\n.":  `kapanmamış """`,
		"FROM x\nMESSAGE robot selam":       "MESSAGE rolü",
		"FROM x\nPARAMETER temperature abc": "", // Parse geçer, Options hata verir
	}
	for src, want := range cases {
		mf, err := Parse(strings.NewReader(src))
		if want == "" {
			if _, err := Options(mf.Parameters); err == nil {
				t.Errorf("%q: tip hatası bekleniyordu", src)
			}
			continue
		}
		var pe *ParseError
		if !errors.As(err, &pe) || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: %q içeren ParseError bekleniyordu, gelen: %v", src, want, err)
		}
	}
}
