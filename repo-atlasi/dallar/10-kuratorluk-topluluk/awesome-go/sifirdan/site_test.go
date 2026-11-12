package main

import (
	"encoding/xml"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func build(t *testing.T, dir string) int {
	t.Helper()
	meta, err := LoadMeta("testdata/meta-ornek.json")
	if err != nil {
		t.Fatal(err)
	}
	n, err := Build(mustParse(t, "testdata/ornek-readme.txt"), dir, Options{SiteURL: "https://ornek.example/", Date: "2026-11-09", Meta: meta})
	if err != nil {
		t.Fatal(err)
	}
	return n
}

func read(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestBuildPages(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "cikti")
	// 1 ana sayfa + 3 kategori + 8 GitHub projesi ("Tehlikeli" GitHub deposu değil)
	if n := build(t, dir); n != 12 {
		t.Fatalf("sayfa sayısı %d, beklenen 12", n)
	}
	index := read(t, filepath.Join(dir, "index.html"))
	for _, s := range []string{"Gelişmiş Arayüzler", "(3)", "(6)", `<link rel="canonical" href="https://ornek.example/">`} {
		if !strings.Contains(index, s) {
			t.Errorf("index.html %q içermiyor", s)
		}
	}
	db := read(t, filepath.Join(dir, "veritabanı", "index.html"))
	if strings.Contains(db, "<script>") || strings.Contains(db, "javascript:") {
		t.Fatal("zararlı içerik kaçışlanmadan basıldı")
	}
	if !strings.Contains(db, `href="etcd-io-bbolt/index.html"`) {
		t.Error("proje sayfasına bağlantı yok")
	}
}

func TestBuildMetaFreshness(t *testing.T) {
	dir := t.TempDir()
	build(t, dir)
	cat := filepath.Join(dir, "gelişmiş-arayüzler")
	if s := read(t, filepath.Join(cat, "charmbracelet-bubbletea", "index.html")); !strings.Contains(s, "<dd>1234</dd>") {
		t.Error("taze veri gösterilmedi")
	}
	if s := read(t, filepath.Join(cat, "jroimartin-gocui", "index.html")); !strings.Contains(s, "Arşivlenmiş") {
		t.Error("arşiv uyarısı yok")
	}
	if s := read(t, filepath.Join(cat, "rivo-tview", "index.html")); !strings.Contains(s, "Güncel depo verisi yok") {
		t.Error("7 günden eski veri gösterilmemeliydi")
	}
	fresh := RepoMeta{FetchedAt: "2026-11-02"}
	if !fresh.Fresh(time.Date(2026, 11, 9, 0, 0, 0, 0, time.UTC)) || fresh.Fresh(time.Date(2026, 11, 10, 0, 0, 0, 0, time.UTC)) {
		t.Error("TTL sınırı yanlış")
	}
}

func TestSitemapAndRobots(t *testing.T) {
	dir := t.TempDir()
	build(t, dir)
	var set urlset
	if err := xml.Unmarshal([]byte(read(t, filepath.Join(dir, "sitemap.xml"))), &set); err != nil {
		t.Fatal(err)
	}
	if len(set.URLs) != 12 || set.URLs[0].Loc != "https://ornek.example/" || set.URLs[0].LastMod != "2026-11-09" {
		t.Fatalf("sitemap yanlış: %d adres, ilk %+v", len(set.URLs), set.URLs[0])
	}
	if !strings.Contains(read(t, filepath.Join(dir, "robots.txt")), "Sitemap: https://ornek.example/sitemap.xml") {
		t.Error("robots.txt sitemap satırı yok")
	}
}

func TestBuildDeterministic(t *testing.T) {
	a, b := t.TempDir(), t.TempDir()
	build(t, a)
	build(t, b)
	err := filepath.WalkDir(a, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(a, path)
		if read(t, path) != read(t, filepath.Join(b, rel)) {
			t.Errorf("%s iki üretimde farklı", rel)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
