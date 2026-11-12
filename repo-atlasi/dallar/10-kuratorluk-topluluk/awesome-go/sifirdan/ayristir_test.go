package main

import (
	"os"
	"strings"
	"testing"
)

func mustParse(t *testing.T, path string) *Document {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	doc, err := Parse(f)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"İçindekiler":          "i\u0307çindekiler", // GitHub tam Unicode eşlemesi: görünmez birleşen nokta
		"Komut Satırı":         "komut-satırı",
		"C++":                  "c",
		"Data Ingestion / ETL": "data-ingestion--etl",
		"Go_Kit 2":             "go_kit-2",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, beklenen %q", in, got, want)
		}
	}
}

func TestSluggerUnique(t *testing.T) {
	var s Slugger
	got := []string{s.Slug("Araçlar"), s.Slug("Araçlar"), s.Slug("Araçlar")}
	want := "araçlar araçlar-1 araçlar-2"
	if strings.Join(got, " ") != want {
		t.Fatalf("got %v", got)
	}
}

func TestParse(t *testing.T) {
	doc := mustParse(t, "testdata/ornek-readme.txt")
	if doc.Title != "Awesome Örnek Go" || !strings.HasPrefix(doc.Intro, "Go için") {
		t.Fatalf("başlık/giriş yanlış: %q / %q", doc.Title, doc.Intro)
	}
	var titles []string
	for _, c := range doc.Categories {
		titles = append(titles, c.Title)
	}
	if strings.Join(titles, "|") != "Komut Satırı|Gelişmiş Arayüzler|Veritabanı" {
		t.Fatalf("kategoriler: %v (İçindekiler kategori sayılmamalı)", titles)
	}
	sub := doc.Categories[1]
	if sub.Level != 3 || sub.Parent != "komut-satırı" || sub.Desc != "Terminalde zengin arayüz kurmak için kütüphaneler." {
		t.Fatalf("alt kategori yanlış: %+v", sub)
	}
	db := doc.Categories[2]
	if len(db.Lists) != 2 || len(db.Lists[0]) != 3 || len(db.Lists[1]) != 3 {
		t.Fatalf("'_Önbellekler_' paragrafı listeyi ikiye bölmeliydi: %d liste", len(db.Lists))
	}
	if l := db.Lists[0][1]; l.Name != "bolt" || !strings.HasSuffix(l.Desc, "[belgeler](https://pkg.go.dev/go.etcd.io/bbolt).") {
		t.Fatalf("girdi yanlış: %+v", l)
	}
}

func TestParseRepo(t *testing.T) {
	if o, r, ok := parseRepo("https://github.com/rivo/tview"); !ok || o != "rivo" || r != "tview" {
		t.Fatal("github deposu ayrılamadı")
	}
	for _, u := range []string{"https://github.com/rivo", "https://gitlab.com/a/b", "https://github.com/a/b/tree/main"} {
		if _, _, ok := parseRepo(u); ok {
			t.Errorf("%s depo sayılmamalı", u)
		}
	}
}
