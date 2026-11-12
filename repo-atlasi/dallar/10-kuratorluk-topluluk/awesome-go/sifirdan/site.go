package main

import (
	"bytes"
	"embed"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"html/template"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed sablonlar/*.tmpl
var templateFS embed.FS

var tpl = template.Must(template.New("").Funcs(template.FuncMap{"inline": RenderInline}).ParseFS(templateFS, "sablonlar/*.tmpl"))

// MetaTTL awesome-go depo verisini .cache/repos/<owner>/<repo>.json dosyalarında tutar ve
// 7 günden eski kaydı bayat sayıp GitHub API'sinden yeniden çeker (main.go: readCachedMeta).
const MetaTTL = 7 * 24 * time.Hour

// RepoMeta önbellekteki depo verisi.
type RepoMeta struct {
	Stars     int    `json:"stars"`
	LastPush  string `json:"last_push"`
	Archived  bool   `json:"archived"`
	FetchedAt string `json:"fetched_at"`
}

// Fresh kayıt now anına göre TTL içinde mi?
func (m RepoMeta) Fresh(now time.Time) bool {
	t, err := time.Parse("2006-01-02", m.FetchedAt)
	return err == nil && now.Sub(t) <= MetaTTL
}

// LoadMeta {"owner/repo": RepoMeta} biçimindeki JSON dosyasını okur.
func LoadMeta(path string) (map[string]RepoMeta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	meta := map[string]RepoMeta{}
	return meta, json.Unmarshal(data, &meta)
}

// Options site üretim ayarları. Date dışarıdan verilir: aynı girdi = bayt bayt aynı çıktı.
type Options struct {
	SiteURL string
	Date    string // YYYY-MM-DD
	Meta    map[string]RepoMeta
}

// Project yalnızca GitHub deposu olan girdiler için ayrı bir sayfa (uzun kuyruk SEO).
type Project struct {
	Link
	Owner, Repo, Slug string
	Category          *Category
	Meta              *RepoMeta
	Related           []Link
}

type entryView struct {
	Link
	ProjectPath string
}

type page struct {
	Title, Description, Canonical, Root, SiteTitle string
	Categories                                     []*Category
	Category                                       *Category
	Entries                                        []entryView
	Project                                        *Project
}

// parseRepo "https://github.com/sahip/depo" adresini ayırır; başka adreslerde ok=false.
func parseRepo(raw string) (owner, repo string, ok bool) {
	u, err := url.Parse(raw)
	if err != nil || u.Host != "github.com" {
		return "", "", false
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// Build siteyi outDir'e yazar ve üretilen HTML sayfa sayısını döndürür.
func Build(doc *Document, outDir string, opt Options) (int, error) {
	if err := os.RemoveAll(outDir); err != nil {
		return 0, err
	}
	now, err := time.Parse("2006-01-02", opt.Date)
	if err != nil {
		return 0, fmt.Errorf("tarih YYYY-AA-GG olmalı: %w", err)
	}
	base := strings.TrimRight(opt.SiteURL, "/")
	locs := []string{base + "/"}
	pages := 0

	write := func(rel, name string, data page) error {
		var buf bytes.Buffer
		if err := tpl.ExecuteTemplate(&buf, name, data); err != nil {
			return fmt.Errorf("%s: %w", rel, err)
		}
		path := filepath.Join(outDir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			return err
		}
		pages++
		return os.WriteFile(path, buf.Bytes(), 0o644)
	}

	common := page{SiteTitle: doc.Title, Description: doc.Intro}
	idx := common
	idx.Title, idx.Canonical, idx.Categories = doc.Title, base+"/", doc.Categories
	if err := write("index.html", "index", idx); err != nil {
		return pages, err
	}

	for _, c := range doc.Categories {
		projects := projectsOf(c, opt.Meta, now)
		var entries []entryView
		for _, l := range c.Links() {
			ev := entryView{Link: l}
			if p, ok := projects[l.URL]; ok {
				ev.ProjectPath = p.Slug + "/index.html"
			}
			entries = append(entries, ev)
		}
		pg := common
		pg.Title = c.Title + " · " + doc.Title
		pg.Description = firstNonEmpty(c.Desc, c.Title+" kategorisindeki projeler.")
		pg.Canonical, pg.Root, pg.Category, pg.Entries = base+"/"+c.Slug+"/", "../", c, entries
		if err := write(c.Slug+"/index.html", "kategori", pg); err != nil {
			return pages, err
		}
		locs = append(locs, pg.Canonical)

		for _, l := range c.Links() { // sayfa sırası README sırasıdır (belirlenimci)
			p, ok := projects[l.URL]
			if !ok {
				continue
			}
			pp := common
			pp.Title = p.Name + " · " + c.Title
			pp.Description = firstNonEmpty(p.Desc, p.Name)
			pp.Canonical, pp.Root, pp.Project = base+"/"+c.Slug+"/"+p.Slug+"/", "../../", p
			if err := write(c.Slug+"/"+p.Slug+"/index.html", "proje", pp); err != nil {
				return pages, err
			}
			locs = append(locs, pp.Canonical)
		}
	}

	if err := writeSitemap(filepath.Join(outDir, "sitemap.xml"), locs, opt.Date); err != nil {
		return pages, err
	}
	robots := "User-agent: *\nAllow: /\nSitemap: " + base + "/sitemap.xml\n"
	return pages, os.WriteFile(filepath.Join(outDir, "robots.txt"), []byte(robots), 0o644)
}

// projectsOf kategorideki GitHub girdilerinden proje kayıtları üretir; bayat meta gösterilmez.
func projectsOf(c *Category, meta map[string]RepoMeta, now time.Time) map[string]*Project {
	out := map[string]*Project{}
	var order []*Project
	for _, l := range c.Links() {
		owner, repo, ok := parseRepo(l.URL)
		if !ok {
			continue
		}
		p := &Project{Link: l, Owner: owner, Repo: repo, Slug: Slugify(owner + "-" + repo), Category: c}
		if m, ok := meta[owner+"/"+repo]; ok && m.Fresh(now) {
			p.Meta = &m
		}
		out[l.URL] = p
		order = append(order, p)
	}
	for _, p := range order { // awesome-go: aynı kategoriden en çok 10 komşu; burada 5
		for _, s := range order {
			if s != p && len(p.Related) < 5 {
				p.Related = append(p.Related, s.Link)
			}
		}
	}
	return out
}

type sitemapURL struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod"`
}

type urlset struct {
	XMLName xml.Name     `xml:"urlset"`
	Xmlns   string       `xml:"xmlns,attr"`
	URLs    []sitemapURL `xml:"url"`
}

func writeSitemap(path string, locs []string, date string) error {
	set := urlset{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	for _, l := range locs {
		set.URLs = append(set.URLs, sitemapURL{Loc: l, LastMod: date})
	}
	data, err := xml.MarshalIndent(set, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, append([]byte(xml.Header), append(data, '\n')...), 0o644)
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
