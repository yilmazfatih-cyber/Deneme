package main

import (
	"fmt"
	"sort"
	"strings"
)

// Problem tek bir denetim bulgusudur.
type Problem struct {
	Line int
	Rule string
	Msg  string
}

func (p Problem) String() string { return fmt.Sprintf("%d: %s: %s", p.Line, p.Rule, p.Msg) }

// MinPerCategory awesome-go CONTRIBUTING.md: "Categories must have at least 3 items".
const MinPerCategory = 3

// Check awesome-go'nun main_test.go'daki testlerinin (TestAlpha, TestDuplicatedLinks,
// TestSeparator) ve PR denetim betiğinin (.github/scripts/check-pr-diff) kurallarını
// tek yerde uygular:
//   - alfabetik: her liste içinde strings.ToLower + bayt sırası (awesome-go böyle sıralar)
//   - yinelenen: aynı adres iki kez
//   - ayirici: "- [ad](url) - Açıklama." biçimi, açıklama noktayla biter
//   - asgari: kategoride en az 3 girdi (alt başlığı olan üst kategoriler hariç)
func Check(doc *Document) []Problem {
	var out []Problem
	seen := map[string]int{}
	hasChild := map[string]bool{}
	for _, c := range doc.Categories {
		if c.Parent != "" {
			hasChild[c.Parent] = true
		}
	}
	for _, c := range doc.Categories {
		for _, list := range c.Lists {
			for i := 1; i < len(list); i++ {
				a, b := strings.ToLower(list[i-1].Name), strings.ToLower(list[i].Name)
				if b < a {
					out = append(out, Problem{list[i].Line, "alfabetik",
						fmt.Sprintf("%q, %q girdisinden önce gelmeli", list[i].Name, list[i-1].Name)})
				}
			}
		}
		for _, l := range c.Links() {
			key := strings.ToLower(strings.TrimRight(l.URL, "/"))
			if first, ok := seen[key]; ok {
				out = append(out, Problem{l.Line, "yinelenen", fmt.Sprintf("adres %d. satırda da var", first)})
			} else {
				seen[key] = l.Line
			}
			switch {
			case l.Desc == "":
				out = append(out, Problem{l.Line, "ayirici", "girdi '- [ad](url) - Açıklama.' biçiminde olmalı"})
			case !strings.HasSuffix(l.Desc, "."):
				out = append(out, Problem{l.Line, "ayirici", "açıklama nokta ile bitmeli"})
			}
		}
		if n := len(c.Links()); n < MinPerCategory && !hasChild[c.Slug] {
			out = append(out, Problem{c.Line, "asgari", fmt.Sprintf("%q kategorisinde %d girdi var, en az %d olmalı", c.Title, n, MinPerCategory)})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Line < out[j].Line })
	return out
}
