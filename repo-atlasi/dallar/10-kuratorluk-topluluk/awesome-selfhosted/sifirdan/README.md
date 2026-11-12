# Veriden README — awesome-selfhosted hattının küçük kopyası

awesome-selfhosted'da README'yi kimse elle düzenlemez. Her yazılım `awesome-selfhosted-data` deposunda ayrı bir YAML
dosyasıdır; `hecat` aracı veriyi denetler, README.md ile non-free.md'yi üretir ve bot sonucu ayrı bir depoya iter. Bu
mini aynı akışı JSON ve Python standart kütüphanesiyle kurar: **doğrula → özgür/özgür olmayan diye ayır → üret**, ayrıca
"son güncelleme" (bayatlık) denetimi yapar.

> Örnek veri kurgusaldır: yazılım adları uydurmadır, tüm adresler ayrılmış `.example` alan adındadır.

## Gereksinimler

Python 3.10 veya üstü, yalnızca standart kütüphane.

## Çalıştırma

```bash
# Normal kip (PR denetimi gibi): 365 günü aşan proje yalnızca uyarı
python3 uretici.py veri --cikti cikti --bugun 2026-11-09

# Katı kip (günlük "bakımsız proje" taraması gibi): 365 günü aşan proje hata, çıktı yazılmaz
python3 uretici.py veri --cikti cikti --bugun 2026-11-09 --kati
```

Normal kipte üç uyarı görürsün: `eski-oynatici.json` 526 gündür, `yarim-not.json` 222 gündür güncellenmemiş ve
`kasa-pro.json` açıklamasında "ücretsiz" kelimesi geçiyor. Sonuncusu bilerek bırakıldı: kural kelimeye bakar, bağlama
bakmaz; uyarıları bir insanın okuması gerekir.

## Test

```bash
python3 -m unittest discover -s . -t .
```

15 test: dosya adı kuralı, zorunlu alanlar, bilinmeyen lisans/platform/etiket, etiket başına en az 3 yazılım, bayatlık
eşikleri ve atlama listesi, ilk-etiket kuralı, satır biçimi, Türkçe sıralama, İçindekiler bağlantıları, komut satırı.

## Veri düzeni

```text
veri/
├── software/<kebab-ad>.json   bir yazılım = bir dosya (birleştirme çakışması olmaz)
├── tags/*.json                kategori: ad, açıklama, ilgili etiketler
├── platforms/*.json           dil ya da kurulum biçimi (Docker, deb ...)
├── licenses.json              özgür lisanslar (SPDX kısa adları)
├── licenses-nonfree.json      özgür olmayan lisanslar -> non-free.md
└── markdown/                  üst/alt metinler (README'nin elle yazılan tek parçaları)
```

Bir yazılım kaydı:

```json
{
  "name": "Sesli",
  "website_url": "https://sesli.example",
  "source_code_url": "https://git.example/sesli/sesli",
  "description": "Müzik akışı sunucusu; şarkı sözlerini harici bir hizmetten çeker.",
  "licenses": ["MIT"],
  "platforms": ["Go", "Docker"],
  "tags": ["Medya Akışı"],
  "depends_3rdparty": true,
  "updated_at": "2026-10-01",
  "archived": false
}
```

`updated_at`, `archived` ve `stargazers_count` alanlarını gerçek depoda bir bot doldurur (`make update_metadata`,
günlük iş akışı). Burada elle yazıldı.

Üst metindeki (`veri/markdown/ust.md`) `non-free.md` bağlantısı bilerek mutlak bir adres: gerçek `markdown/header.md` de
bu sayfaya mutlak GitHub adresiyle bağlanır. Göreli bir bağlantı, kaynak dosyanın durduğu `veri/markdown/` klasöründe
hiçbir yere gitmezdi; mutlak adres metin nerede gösterilirse gösterilsin çalışır.

## Kurallar ve kaynakları

| Kural                                       | Kaynak (awesome-selfhosted-data, `a54bbea`)                                |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| Dosya adı kebab-case                        | `CONTRIBUTING.md`, PR şablonu                                              |
| Açıklama 250 karakterden kısa               | `.github/ISSUE_TEMPLATE/addition.md`                                       |
| "open-source", "free", "self-hosted" yazma  | `CONTRIBUTING.md` "Other guidelines"                                       |
| Etiketi en az 3 yazılım kullanmalı          | `CONTRIBUTING.md` "Add a tag/category"                                     |
| Yazılım tek sayfada yalnızca İLK etiketinde | `CONTRIBUTING.md` "single page mode"                                       |
| 186 gün uyarı, 365 gün hata (katı kip)      | `.hecat/awesome-lint-strict.yml` (`last_updated_warn_days`, `_error_days`) |
| Bakım gerektirmeyen projeler için atlama    | `.hecat/awesome-lint.yml` (`last_updated_skip`)                            |
| Özgür olmayan lisans → non-free.md          | `.hecat/export-markdown.yml` (`exclude_licenses` / `include_licenses`)     |
| `⚠` = üçüncü taraf hizmete bağımlılık       | `addition.md` (`depends_3rdparty`), README "Anti-features"                 |

## Gerçek depodaki karşılıklar

| Mini'deki parça            | Gerçek karşılığı                                                                   | Fark                                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `yukle()`                  | hecat `processors/*` YAML okuma (`Makefile`: `hecat --config .hecat/...`)          | YAML yerine JSON                                                                               |
| `dogrula()`                | hecat `processors/awesome_lint` (`make awesome_lint`, `awesome_lint_strict`)       | Gerçeğinde daha çok kural ve `items_in_delegate_to_fatal` gibi ayarlar var (doğrulanmadı: kod) |
| `readme(ozgur=True/False)` | hecat `exporters/markdown_singlepage` (`.hecat/export-markdown.yml`, iki adım)     | Etiket/lisans bölümleri benzer; gerçek çıktı İngilizce                                         |
| HTML sitesi                | `exporters/markdown_multipage` + `sphinx-build` + furo teması (`make export_html`) | Mini HTML üretmez (Go mini'sine bak: `../../awesome-go/sifirdan/`)                             |
| Bot ile yayın              | `.github/workflows/build.yml` (`make push_markdown`, dağıtım anahtarı)             | Mini yalnızca diske yazar                                                                      |
| Bağlantı denetimi          | `.hecat/url-check.yml` + `check-dead-links.yml`                                    | Ortak araç kutusundaki `asama3_baglanti.py`                                                    |

## Gerçek ölçeğe giden yol

1. YAML okuma (PyYAML ya da ruamel) ve bir JSON Schema ile alan doğrulaması.
2. Metadata botu: GitHub/GitLab API'sinden yıldız, son commit, arşiv durumu, son sürüm; günde bir kez, hız sınırına
   saygılı (gerçek ayar `sleep_time: 60`).
3. Çoklu sayfa HTML: her etiket bir sayfa, arama, filtreleme (lisans, platform).
4. Yayın: ana dalda doğrula → üret → ayrı depoya bot olarak it; PR'da yalnızca doğrula ve üretim farkını göster.
5. Simgeler: `icon_url` alanından indir, WebP'ye çevir, depoda sakla (`make download_icons`).
