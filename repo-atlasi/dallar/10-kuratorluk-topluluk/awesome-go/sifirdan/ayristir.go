package main

import (
	"bufio"
	"io"
	"regexp"
	"strings"
)

// Link listedeki bir girdidir: - [Name](URL) - Desc
type Link struct {
	Name string
	URL  string
	Desc string // " - " sonrası; yoksa boş
	Line int    // README'deki satır numarası (1 tabanlı)
}

// Category bir ## ya da ### başlığıdır. Lists, araya paragraf giren ayrı listeleri
// ayrı tutar (awesome-go'daki "_Interaction_" gibi ara başlıklar): alfabetik sıra
// her liste içinde ayrı denetlenir.
type Category struct {
	Title  string
	Slug   string
	Desc   string
	Level  int
	Line   int
	Parent string // ### başlıklar için üstteki ## başlığın kimliği
	Lists  [][]Link
}

// Links kategorinin tüm girdilerini sırasıyla döndürür.
func (c *Category) Links() []Link {
	var all []Link
	for _, l := range c.Lists {
		all = append(all, l...)
	}
	return all
}

// Document ayrıştırılmış README'dir.
type Document struct {
	Title      string
	Intro      string
	Categories []*Category
}

var (
	reHeading = regexp.MustCompile(`^(#{1,6})\s+(.+?)\s*#*\s*$`)
	reEntry   = regexp.MustCompile(`^\s*[-*]\s+\[([^\]]+)\]\(((?:[^\s()]|\([^\s()]*\))+)\)(.*)$`)
	reFence   = regexp.MustCompile("^\\s*(```|~~~)")
)

// contentsTitles İçindekiler bölümünün olası adları; bu bölümlerdeki bağlantılar girdi sayılmaz.
var contentsTitles = map[string]bool{"contents": true, "table of contents": true, "içindekiler": true}

// Parse README metnini satır satır okuyup kategorilere ayırır. awesome-go'nun main.go'su
// önce Markdown'ı HTML'e çevirir (goldmark), sonra goquery ile DOM'da gezinir; burada aynı
// sonucu doğrudan Markdown satırlarından çıkarıyoruz (bağımlılık yok, mekanizma görünür).
func Parse(r io.Reader) (*Document, error) {
	doc := &Document{}
	var cur *Category
	var parent string
	inFence, inContents, newList := false, false, true
	slugger := &Slugger{}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 1024*1024), 1024*1024)
	for no := 1; sc.Scan(); no++ {
		line := sc.Text()
		if reFence.MatchString(line) {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		if m := reHeading.FindStringSubmatch(line); m != nil {
			level, title := len(m[1]), plainText(m[2])
			slug := slugger.Slug(title)
			inContents = contentsTitles[strings.ToLower(title)]
			cur = nil
			switch {
			case level == 1 && doc.Title == "":
				doc.Title = title
			case (level == 2 || level == 3) && !inContents:
				if level == 2 {
					parent = slug
				}
				cur = &Category{Title: title, Slug: slug, Level: level, Line: no}
				if level == 3 {
					cur.Parent = parent
				}
				doc.Categories = append(doc.Categories, cur)
			}
			newList = true
			continue
		}
		trimmed := strings.TrimSpace(line)
		if m := reEntry.FindStringSubmatch(line); m != nil {
			if cur == nil || inContents || strings.HasPrefix(m[2], "#") {
				continue
			}
			link := Link{Name: m[1], URL: m[2], Line: no}
			if rest := m[3]; strings.HasPrefix(rest, " - ") {
				link.Desc = strings.TrimSpace(rest[3:])
			}
			if newList || len(cur.Lists) == 0 {
				cur.Lists = append(cur.Lists, nil)
				newList = false
			}
			cur.Lists[len(cur.Lists)-1] = append(cur.Lists[len(cur.Lists)-1], link)
			continue
		}
		if trimmed == "" || strings.HasPrefix(trimmed, "<") {
			continue // boş satır ve HTML (<details> vb.) listeyi bölmez
		}
		// Düz paragraf: ilk paragraf açıklamadır; sonrakiler yeni bir liste başlatır.
		if cur != nil && cur.Desc == "" && len(cur.Lists) == 0 {
			cur.Desc = strings.Trim(trimmed, "_*")
		} else if cur == nil && doc.Title != "" && doc.Intro == "" && len(doc.Categories) == 0 {
			doc.Intro = strings.TrimLeft(trimmed, "> ")
		}
		newList = true
	}
	return doc, sc.Err()
}

var reInlineLink = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)

// plainText başlıktaki Markdown işaretlerini ayıklar (bağlantı, kod, vurgu).
func plainText(s string) string {
	s = reInlineLink.ReplaceAllString(s, "$1")
	return strings.TrimSpace(strings.NewReplacer("`", "", "**", "", "__", "").Replace(s))
}
