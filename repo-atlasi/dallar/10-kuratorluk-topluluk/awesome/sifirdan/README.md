# Liste araçları — sıfırdan (D10'un ortak araç kutusu)

Bu klasör, D10 dalındaki dokuz deponun hepsinde tekrar eden işi küçük ve okunur bir Python kodu olarak yeniden kurar:
**bir Markdown listesini denetlemek, bağlantılarını kontrol etmek, veriden üretmek ve çevirilerini izlemek.** Kod
özgündür; gerçek araçlardan (awesome-lint, fpb-lint, awesome_bot, hecat, `check_readme.py`) kod kopyalanmadı, yalnızca
davranışları incelenip karşılaştırma için dosya yolları verildi.

## Gereksinimler

- Python 3.10 veya üstü (yalnızca standart kütüphane; `pip install` yok).
- İnternet gerekmez: testler bağlantı denetimini yerel bir `http.server` üzerinde yapar.

## Çalıştırma

Komutları bu klasörün (`sifirdan/`) içinden çalıştır:

```bash
# 1) Bilerek bozulmuş örnek listeyi denetle (17 bulgu: 13 hata, 4 uyarı; çıkış kodu 1)
python3 liste.py denetle ornekler/bozuk-liste.txt --yerel tr

# 2) Veriden README üret ve ekrana bas
python3 liste.py uret ornekler/turkce-kaynaklar.json

# 3) Üret, sonra "dosya güncel mi?" denetimi (CI'daki tazelik kontrolü)
python3 liste.py uret ornekler/turkce-kaynaklar.json -o /tmp/README.md
python3 liste.py uret ornekler/turkce-kaynaklar.json -o /tmp/README.md --denetle

# 4) Bir listenin bağlantılarını paralel denetle, ardışık hata sayacını dosyada tut
python3 liste.py baglanti /tmp/README.md --eszamanli 8 --durum /tmp/durum.json

# 5) Çeviri kapsamı: hangi dilde hangi belge eksik?
python3 liste.py ceviri --matris yol/free-programming-books/docs
```

Gerçek bir depodaki listeyi denetlemek için önce dosyayı indir; örneğin free-programming-books'un Türkçe kitap listesi:

```bash
curl -sO https://raw.githubusercontent.com/EbookFoundation/free-programming-books/main/books/free-programming-books-tr.md
python3 liste.py denetle free-programming-books-tr.md --hazir fpb --yerel tr
```

## Test

```bash
python3 -m unittest discover -s . -t .
```

71 test, yaklaşık 3 saniye. Bağlantı testleri `tests/yerel_sunucu.py` içindeki sunucuya gider: 200, 301, 302, 308, 404,
410, 429 (`Retry-After`), 500, HEAD'i reddeden uç ve 1 saniye bekleyen yavaş uç.

## Aşamalar

| Dosya                   | Aşama               | Ne öğretir                                                                                                                              |
| ----------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `asama1_ayristirici.py` | Ayrıştırma          | Satır tabanlı Markdown okuma, GitHub başlık kimliği (`İ` → `i̇` tuzağı), Türkçe sıralama anahtarı, "bayt sırası" ile "dil sırası" farkı  |
| `asama2_denetim.py`     | Denetleyici         | Kural kaydı deseni, 12 kural, hazır kural setleri (`varsayilan`, `awesome`, `go`, `python`, `fpb`, `pbl`)                               |
| `asama3_baglanti.py`    | Bağlantı denetimi   | HEAD → GET geri düşüşü, elle yönlendirme izleme, 301 ile 302 farkı, zaman aşımı, 429 sonrası bekleme, alan adı başına semafor           |
| `asama4_uretici.py`     | Veriden README      | Şema doğrulama, yerel sıralama, otomatik İçindekiler, ASCII çapa seçeneği, Prettier'a dayanıklı çıktı, tazelik farkı                    |
| `asama5_ceviri.py`      | Çeviri kapsamı      | `AD-dil.md` adlandırmasından dil matrisi, yapısal karşılaştırma, çevrilmemiş satır oranı                                                |
| `liste.py`              | Komut satırı        | Alt komutlar, JSON çıktı, CI için çıkış kodları                                                                                         |
| `tests/`                | Testler             | Her aşama ayrı test dosyası; `yerel_sunucu.py` internetsiz HTTP sunucusu                                                                |
| `ornekler/`             | Örnek veri ve liste | `turkce-kaynaklar.json`: free-programming-books ve awesome-go klonlarında doğrulanmış Türkçe kaynaklar; `bozuk-liste.txt`: hata vitrini |

`bozuk-liste.txt` bilerek `.txt` uzantılı: `.md` olsaydı deponun Prettier denetimi dosyayı "düzeltip" örnek hataları
silerdi.

## Gerçek depolardaki karşılıklar

| Mini'deki parça                             | Gerçek depodaki karşılığı (dosya yolu)                                                                                                  | Fark                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ayristir()` satır okuyucu                  | awesome-lint `rules/*.js` (remark sözdizimi ağacı); vinta/awesome-python `website/readme_parser.py` (markdown-it-py ağacı)              | Gerçekleri tam CommonMark ağacı kullanır; mini düzenli ifadeyle dar dilbilgisini okur                                  |
| `github_kimligi()`                          | `github-slugger` paketi (awesome-lint bağımlılığı)                                                                                      | Slugger üretilmiş dev bir karakter sınıfı kullanır; mini Unicode kategorisine bakar                                    |
| `kural_alfabetik` + `yerel="tr"`            | fpb-lint `lib/lint.js` → `remark-lint-alphabetize-lists` (`Intl.Collator(dil)`)                                                         | Gerçeği ICU harmanlamasını kullanır; mini Türk alfabesini elle sıralar                                                 |
| `yerel="bayt"`                              | avelino/awesome-go `main_test.go` → `checkAlphabeticOrder` (`strings.ToLower` + `sort.Strings`)                                         | Aynı davranış: "Bärner", "Brisbane"den sonra gelir                                                                     |
| `--hazir awesome` (sona ekleme, alfabe yok) | sindresorhus/awesome `pull_request_template.md` ("added at the bottom of the appropriate category"), `.github/workflows/repo_linter.sh` | Gerçeğinde CI ana listeyi lint etmez; yalnızca PR'da eklenen satırdaki listeyi klonlayıp `npx awesome-lint` çalıştırır |
| `kural_icindekiler`                         | awesome-lint `rules/toc.js`; project-based-learning `scripts/check_readme.py` (`github_slug`)                                           | Mini, Türkçe harf kaynaklı kırık çapalar için ipucu verir                                                              |
| `kural_tanitim_dili`, `kural_url_semasi`    | awesome-go `.github/scripts/check-pr-diff/main.go` (`promotionalWords`, `reviewEntrySafety`)                                            | Gerçeği yalnızca PR'da eklenen satırları denetler                                                                      |
| `kural_ust_sinir` (`python` seti)           | vinta/awesome-python `CONTRIBUTING.md` "Admission" (kullanım alanı başına en çok 5) ve `docs/audit-logs.md`                             | Gerçekte sınırı insanlar uygular; istisnalar denetim günlüğüne yazılır                                                 |
| `asama3_baglanti.py`                        | project-based-learning `scripts/check_readme.py` (`check_url`, `DomainLimiter`); fpb `.github/workflows/check-urls.yml`                 | Gerçeği "soft 404" başlık analizi ve alan adı politikası dosyası da içerir; fpb awesome_bot (Ruby) kullanır            |
| `durum_guncelle`, `kaldirma_adaylari`       | project-based-learning `.github/link-rot-state.json`, `.github/workflows/link-rot.yml` (`prune` adımı)                                  | Gerçeği iki hafta üst üste ölü girdiyi silen bir PR'ı kendisi açar                                                     |
| `asama4_uretici.py`                         | awesome-selfhosted-data `Makefile` + `.hecat/export-markdown.yml` (hecat `exporters/markdown_singlepage`)                               | Gerçeği YAML, dosya başına bir kayıt, HTML çıktısı (Sphinx) ve bot ile ayrı depoya itme içerir                         |
| `tazelik_farki` + `--denetle`               | awesome-selfhosted-data `.github/workflows/pull-request.yml` (`make export_markdown`)                                                   | Gerçeği farkı yalnızca gösterir; README'yi bot yeniden yazar                                                           |
| `asama5_ceviri.py`                          | free-programming-books `docs/README.md` (çeviri dizini); 996.ICU `i18n/README.md`                                                       | Gerçek depolarda böyle bir araç yok: kapsam elle izleniyor                                                             |

## Gerçek listelerde ne buldu?

Araç, klonlardaki dosyalara (incelenen commit'lerde) çalıştırıldığında:

- **free-programming-books `books/free-programming-books-tr.md`:** İçindekiler'deki `#algoritma-ve-veri-yapilari` ve
  `#guvenlik-ve-gizlilik` bağlantıları hiçbir başlığa gitmiyor; GitHub'ın ürettiği kimlikler `algoritma-ve-veri-yapıları`
  ve `güvenlik-ve-gizlilik`. Aynı depodaki `casts/free-podcasts-screencasts-tr.md` ise doğru biçimi (`#dil-bağımsız`)
  kullanıyor.
- **build-your-own-x `README.md`:** "Build your own `Distributed Systems`" bölümü İçindekiler'de yok.
- **awesome-python `README.md`:** `--hazir python` ile 5 sınırını aşan üç kullanım alanı bulunuyor. Bunlar, sorumlunun
  `docs/audit-logs.md` dosyasında "Cap Exceptions" başlığı altında kayda geçirdiği üç istisnanın tam karşılığı.
- **awesome-go `README.md`:** `--hazir go` ile alfabetik sıra ve yinelenen bağlantı hatası çıkmıyor (CI bunu zaten
  sağlıyor); açıklaması olmayan ya da noktasız biten 146 girdi bulunuyor, 101'i README'nin "Resources" kısmında.
- **996.ICU `i18n/`:** `en_US.md` temel alındığında `tr_TR.md` yapısal olarak tam; `de_DE.md` belirgin biçimde kısa.
  `ja_JP.md` başlık yerine kalın etiket kullandığı için "eksik başlık" uyarısı alıyor: yapısal karşılaştırmanın yanlış
  alarmı. (996.ICU başlıkları alt çizgiyle, "setext" biçiminde yazıyor; ayrıştırıcı bu yüzden setext başlıkları da tanır.)

## Gerçek ölçeğe giden yol

1. **Sözdizimi ağacı:** Düzenli ifadeler yerine bir CommonMark ayrıştırıcısı (Python'da markdown-it-py, JS'de remark).
   İç içe vurgu, referans bağlantıları ve HTML blokları ancak böyle güvenle okunur.
2. **Yalnızca değişeni denetle:** Büyük listelerde PR'daki farkı (`git diff`) ayrıştırıp yalnız eklenen satırlara kural
   uygula (awesome-go `check-pr-diff`, project-based-learning `check-diff`). Eski sorunlar yeni katkıcıyı cezalandırmaz.
3. **Vekil ve TLS:** `http.client` ortam değişkenindeki vekil sunucuyu kullanmaz. Kurumsal ağda `urllib.request` ve
   `ProxyHandler` ya da CONNECT tüneli gerekir.
4. **Soft 404 ve alan adı politikası:** 200 dönen "sayfa bulunamadı" sayfalarını başlıktan yakala; Medium, LinkedIn gibi
   otomatik denetimi engelleyen alan adlarını `ENGELLI` say (project-based-learning `scripts/linkcheck-domains.txt`).
5. **GitHub API'si:** GitHub depoları için HTML yerine API (arşivlendi mi, son itme, yıldız). Hız sınırı için jeton ve
   önbellek (awesome-go `.cache/repos`, 7 gün).
6. **Yayın hattı:** GitHub Actions'ta PR'da denetle, ana dalda üret, haftalık zamanlanmış görevde bağlantı tara, sonucu
   tek bir issue'da güncelle.
