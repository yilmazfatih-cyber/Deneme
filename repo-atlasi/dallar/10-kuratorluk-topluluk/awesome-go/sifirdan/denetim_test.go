package main

import (
	"fmt"
	"strings"
	"testing"
)

func TestCheckClean(t *testing.T) {
	if p := Check(mustParse(t, "testdata/ornek-readme.txt")); len(p) != 0 {
		t.Fatalf("temiz örnekte sorun bulundu: %v", p)
	}
}

func TestCheckBroken(t *testing.T) {
	got := Check(mustParse(t, "testdata/bozuk-readme.txt"))
	var lines []string
	for _, p := range got {
		lines = append(lines, fmt.Sprintf("%d:%s", p.Line, p.Rule))
	}
	want := "6:alfabetik 6:ayirici 7:yinelenen 8:ayirici 10:asgari"
	if strings.Join(lines, " ") != want {
		t.Fatalf("got %v\nwant %s", lines, want)
	}
}

func TestRenderInline(t *testing.T) {
	cases := map[string]string{
		"<script>alert(1)</script>":            "&lt;script&gt;alert(1)&lt;/script&gt;",
		"[kötü](javascript:alert(1))":          "kötü",
		"[iyi](https://ornek.example?a=1&b=2)": `<a href="https://ornek.example?a=1&amp;b=2">iyi</a>`,
		"`kod <b>` ve metin":                   "<code>kod &lt;b&gt;</code> ve metin",
	}
	for in, want := range cases {
		if got := string(RenderInline(in)); got != want {
			t.Errorf("RenderInline(%q) = %q, beklenen %q", in, got, want)
		}
	}
}
