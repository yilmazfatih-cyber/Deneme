// Komut awesomesite, bir awesome listesinin README.md dosyasından statik site üretir.
//
//	go run . -readme testdata/ornek-readme.txt -out cikti -site https://ornek.example -tarih 2026-11-09
//	go run . -readme README.md -denetle          # yalnızca kuralları denetle, sorun varsa 1 ile çık
//
// Gerçek karşılığı: avelino/awesome-go deposundaki main.go (goldmark + goquery + GitHub API).
package main

import (
	"flag"
	"fmt"
	"os"
	"time"
)

func main() {
	readme := flag.String("readme", "README.md", "kaynak Markdown dosyası")
	out := flag.String("out", "cikti", "çıktı klasörü (her çalıştırmada silinip yeniden yazılır)")
	site := flag.String("site", "https://ornek.example", "sitenin kök adresi (canonical ve sitemap için)")
	date := flag.String("tarih", time.Now().Format("2006-01-02"), "sitemap lastmod tarihi")
	metaPath := flag.String("meta", "", "isteğe bağlı depo verisi önbelleği (JSON)")
	checkOnly := flag.Bool("denetle", false, "site üretme, yalnızca kuralları denetle")
	flag.Parse()

	if err := run(*readme, *out, *site, *date, *metaPath, *checkOnly); err != nil {
		fmt.Fprintln(os.Stderr, "hata:", err)
		os.Exit(1)
	}
}

func run(readme, out, site, date, metaPath string, checkOnly bool) error {
	f, err := os.Open(readme)
	if err != nil {
		return err
	}
	defer f.Close()
	doc, err := Parse(f)
	if err != nil {
		return err
	}
	if checkOnly {
		problems := Check(doc)
		for _, p := range problems {
			fmt.Printf("%s:%s\n", readme, p)
		}
		if len(problems) > 0 {
			return fmt.Errorf("%d sorun bulundu", len(problems))
		}
		return nil
	}
	opt := Options{SiteURL: site, Date: date}
	if metaPath != "" {
		if opt.Meta, err = LoadMeta(metaPath); err != nil {
			return err
		}
	}
	n, err := Build(doc, out, opt)
	if err == nil {
		fmt.Printf("%d kategori, %d sayfa -> %s\n", len(doc.Categories), n, out)
	}
	return err
}
