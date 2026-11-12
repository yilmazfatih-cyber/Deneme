# awesomesite — README'den statik site (Go, yalnızca standart kütüphane)

avelino/awesome-go, 4 bin satırlık bir README'yi her `main` itmesinde [awesome-go.com](https://awesome-go.com) sitesine
çevirir: ana sayfa, kategori sayfaları, her GitHub projesi için ayrı sayfa, `sitemap.xml`. Bu mini aynı hattı bağımlılıksız
kurar ve awesome-go'nun README kurallarını (alfabetik sıra, yinelenen bağlantı, açıklama biçimi, kategori başına en az 3
girdi) tek bir `Check` fonksiyonunda toplar.

## Gereksinimler

Go 1.22 veya üstü. Dış modül yok (`go.mod` boş); testler internetsiz çalışır.

## Çalıştırma

```bash
# Örnek README'den site üret (çıktı: cikti/)
go run . -readme testdata/ornek-readme.txt -out cikti -site https://ornek.example -tarih 2026-11-09 -meta testdata/meta-ornek.json

# Yalnızca kuralları denetle (sorun varsa çıkış kodu 1)
go run . -readme testdata/bozuk-readme.txt -denetle

# Üretilen siteye tarayıcıdan bak
python3 -m http.server -d cikti 8000
```

Gerçek awesome-go README'si (incelenen commit `499762c`) üzerinde: 146 kategori, 3015 sayfa, derlenmiş ikiliyle 1 saniyenin altında.
`-denetle` bayt sırasına göre alfabetik hata ve yinelenen bağlantı bulmuyor; "Resources" bölümündeki açıklamasız
girdiler ve 3'ten az girdili 11 kategori raporlanıyor.

## Test

```bash
go test ./...
```

11 test: kimlik üretimi (Türkçe `İ` dahil), ayrıştırma, kurallar, güvenli satır içi HTML, sayfa sayısı, önbellek tazeliği,
sitemap ve iki üretimin bayt bayt aynı olması.

## Aşamalar

| Dosya                   | Aşama           | Ne öğretir                                                                                                            |
| ----------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `kimlik.go`             | 1. Bağlantı adı | GitHub başlık kimliği; Go'nun `strings.ToLower`'ı `İ`yi `i` yapar, GitHub (ve github-slugger) `i` + U+0307 yapar      |
| `ayristir.go`           | 2. Ayrıştırma   | README → `Document{Categories{Lists[][]Link}}`; `<details>` içindeki İçindekiler'i atlama; paragrafın listeyi bölmesi |
| `denetim.go`            | 3. Kurallar     | awesome-go testlerinin ve PR denetim betiğinin kuralları tek fonksiyonda                                              |
| `satirici.go`           | 4. Güvenli HTML | Açıklamadaki `[metin](adres)` ve `` `kod` `` dışındaki her şeyi kaçışlama; yalnız http(s) bağlantısı                  |
| `site.go`, `sablonlar/` | 5. Site         | `html/template` + `embed`, kategori ve proje sayfaları, 7 günlük önbellek tazeliği, `encoding/xml` ile sitemap        |
| `main.go`               | 6. Komut satırı | `flag` ile seçenekler, `-denetle` kipi                                                                                |
| `testdata/`             | Örnekler        | `.txt` uzantısı bilinçli: Prettier `.md` dosyalarını yeniden biçimlendirirdi                                          |

## Gerçek depodaki karşılıklar

| Mini'deki parça          | Gerçek depodaki karşılığı (dosya yolu)                                                                        | Fark                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Parse` (satır tabanlı)  | `main.go`: `renderIndex` → `extractCategories` (goldmark + goquery DOM)                                       | Gerçeği önce HTML'e çevirip DOM'da gezer; mini Markdown satırlarını okur                                    |
| `Slugify`                | `pkg/slug/generator.go` (`avelino/slugify` paketi)                                                            | Gerçeğinde "FIXME" notu var: GitHub ile tam aynı değil                                                      |
| `RenderInline`           | `pkg/markdown/convert.go` (`html.WithUnsafe` + bluemonday UGC politikası)                                     | Gerçeği README'deki ham HTML'e izin verip sonra temizler; mini hiç ham HTML üretmez                         |
| `Check`                  | `main_test.go` (`TestAlpha`, `TestDuplicatedLinks`, `TestSeparator`), `.github/scripts/check-pr-diff/main.go` | Gerçekleri ayrı testler ve PR betiği; ayrıca olgunluk (5 ay) ve bakımsızlık denetimleri GitHub API'si ister |
| `projectsOf`, `RepoMeta` | `main.go`: `buildProjects`, `fetchProjectMeta`, `readCachedMeta` (`.cache/repos`, 7 gün)                      | Gerçeği GitHub/GitLab API'sinden çeker, istekler arası 50 ms bekler; mini önbellek dosyasını okur           |
| `Build`, `writeSitemap`  | `main.go`: `buildStaticSite`, `renderSitemap` + `tmpl/sitemap.tmpl.xml`                                       | Gerçeği her URL'ye üretim anını (`{{now}}`) yazar; mini tarihi dışarıdan alır, çıktı belirlenimci           |
| `robots.txt`             | `tmpl/robots.txt`                                                                                             | Aynı fikir                                                                                                  |
| Yayın                    | `.github/workflows/site-deploy.yaml` (Netlify), `netlify.toml`                                                | Mini yalnızca klasöre yazar                                                                                 |

## Gerçek ölçeğe giden yol

1. Markdown'ı gerçek bir ayrıştırıcıyla HTML'e çevir (Go'da goldmark) ve çıktıyı izin listeli bir temizleyiciden geçir.
2. Depo verisini GitHub API'sinden çek: jeton, hız sınırı, dosya başına önbellek, 7 günlük ömür, hata olursa eski veriyle
   devam (`continue-on-error` mantığı).
3. Arama ve filtreleme için istemci tarafında küçük bir JSON dizin üret.
4. SEO: sayfa başına `description`, `canonical`, yapılandırılmış veri (awesome-python `website/build.py` JSON-LD üretir),
   gerçek değişiklik tarihli `lastmod`.
5. CI: PR'da `-denetle`, `main`'de üret ve yayınla; birleştirme botu kullanıyorsan yayını ayrıca tetikle (awesome-go
   `auto-merge-readme.yaml`: `GITHUB_TOKEN` ile yapılan birleştirme push iş akışını tetiklemez).
