package main

import (
	"fmt"
	"html/template"
	"net/url"
	"regexp"
	"strings"
)

// Bağlantı adresinde dengeli parantezlere izin verilir: [x](https://tr.wikipedia.org/wiki/A_(B))
var reInline = regexp.MustCompile("\\[([^\\]]*)\\]\\(((?:[^\\s()]|\\([^\\s()]*\\))*)\\)|`([^`]+)`")

// RenderInline açıklamadaki satır içi Markdown'ı (bağlantı ve `kod`) GÜVENLE HTML'e çevirir.
//
// Neden önemli: liste herkesin PR açabildiği bir dosya; açıklamaya <script> ya da
// javascript: bağlantısı koyan biri siteyi ziyaret edenleri hedef alabilir. awesome-go
// bunu iki katmanda çözer: PR'da ham HTML ve javascript:/data: adreslerini reddeder
// (.github/scripts/check-pr-diff) ve üretilen HTML'i izin listeli bir temizleyiciden
// geçirir (pkg/markdown/convert.go, bluemonday). Burada her metin parçasını kaçışlıyoruz
// ve yalnızca http/https bağlantılarını <a> yapıyoruz.
func RenderInline(s string) template.HTML {
	var b strings.Builder
	last := 0
	for _, m := range reInline.FindAllStringSubmatchIndex(s, -1) {
		b.WriteString(template.HTMLEscapeString(s[last:m[0]]))
		if m[2] >= 0 { // [metin](adres)
			text, href := s[m[2]:m[3]], s[m[4]:m[5]]
			if safeURL(href) {
				fmt.Fprintf(&b, `<a href="%s">%s</a>`, template.HTMLEscapeString(href), template.HTMLEscapeString(text))
			} else {
				b.WriteString(template.HTMLEscapeString(text))
			}
		} else { // `kod`
			fmt.Fprintf(&b, "<code>%s</code>", template.HTMLEscapeString(s[m[6]:m[7]]))
		}
		last = m[1]
	}
	b.WriteString(template.HTMLEscapeString(s[last:]))
	return template.HTML(b.String())
}

// safeURL yalnızca mutlak http(s) adreslerine izin verir.
func safeURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && (u.Scheme == "http" || u.Scheme == "https") && u.Host != ""
}
