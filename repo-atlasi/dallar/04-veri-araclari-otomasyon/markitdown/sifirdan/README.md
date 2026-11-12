# markitdown — sıfırdan mini sürüm: öncelikli dönüştürücü kayıt defteri

Bu mini, markitdown'un çekirdek fikrini sıfırdan yazar: **her girdi bir ikili akışa çevrilir, akışın ne
olduğu tahmin edilir, dönüştürücüler öncelik sırasıyla denenir.** Biçim desteği bilerek dar tutuldu
(HTML, CSV, JSON, düz metin, DOCX, ZIP); amaç mimariyi göstermek. Kod orijinal değildir ama aynı
sözleşmeleri (`accepts()` / `convert()`, öncelik, tahmin listesi, eklenti) uygular.

## Gereksinimler

- Python 3.11+, yalnızca standart kütüphane (`html.parser`, `zipfile`, `xml.etree`, `csv`, `json`).
  Asıl proje `beautifulsoup4`, `markdownify`, `mammoth`, `magika`, `charset-normalizer`, `defusedxml` kullanır.

## Çalıştırma

```bash
cd sifirdan
python3 asama4_cli.py rapor.docx                 # Markdown'ı ekrana yaz
python3 asama4_cli.py rapor.docx -o rapor.md     # dosyaya yaz
cat veri.csv | python3 asama4_cli.py -x csv      # stdin + uzantı ipucu (asıl CLI'daki -x gibi)
python3 asama4_cli.py -c cp1254 eski.csv         # karakter kümesi ipucu (asıl CLI'daki -c gibi)
python3 asama4_cli.py --listele                  # dönüştürücüler, deneme sırasıyla
python3 asama4_cli.py --eklenti tests.ornek_eklenti tablo.tsv   # eklenti yükle
```

## Test

```bash
python3 -m unittest discover -s . -t .        # sifirdan/ içinden: 28 test
```

Testler DOCX dosyasını Word olmadan, `zipfile` ile XML parçalarını yazarak üretir (`tests/yardimci.py`).
Türkçe Word'ün "Başlık 1" stili için yazdığı `Balk1` kimliği de bu sayede denenir.

## Aşamalar

| Aşama | Dosya                      | Ne öğretir                                                                                                                      |
| ----- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `asama1_cekirdek.py`       | `AkisBilgisi` (değişmez veri sınıfı), dönüştürücü sözleşmesi, öncelikli kayıt, deneme döngüsü, hata biriktirme, eklenti yükleme |
| 2     | `asama2_tahmin.py`         | Uzantı/MIME tahmini, sihirli baytlar (`%PDF-`, `PK\x03\x04`), ZIP içine bakarak DOCX tanıma, UTF-8 → cp1254 → latin-1           |
| 3     | `asama3_donusturuculer.py` | HTML ağacı → Markdown (liste, tablo, kod, alıntı), CSV tablosu, JSON kod bloğu, DOCX XML okuma, ZIP özyinelemesi                |
| 4     | `asama4_cli.py`            | stdin desteği (geri sarılamayan akışı belleğe alma), ipuçları, çıkış kodları                                                    |

Önemli sözleşmeler:

- `accepts()` akıştan okursa konumu geri almak **zorundadır**; çekirdek bunu denetler (`test_accepts_konumu_bozamaz`).
- Aynı öncelikte **en son kaydedilen önce** denenir; özel biçimler 0.0, "neredeyse her şeyi" kabul edenler 10.0.
- Bir dönüştürücü hata verirse sıradaki denenir; hepsi başarısızsa denemeler tek bir hatada raporlanır.
- Uzantı ile içerik çelişirse iki tahmin üretilir, önce uzantınınki denenir. Bizim `DuzMetinDonusturucu`
  ikili veride hata verdiği için `.txt` adı taşıyan bir DOCX ikinci tahminle yine dönüştürülür. Asıl
  projede bu olmaz: `PlainTextConverter` ikili veriyi hata vermeden çözüp (`charset_normalizer` tahminiyle ya
  da `errors="ignore"` ile) başarılı döner, döngü de ikinci tahmine geçmez.

## Gerçek depoyla eşleme

| Mini'deki parça                          | Gerçek depodaki karşılığı (`packages/markitdown/src/markitdown/`)        | Fark                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AkisBilgisi.guncelle()`                 | `_stream_info.py` → `StreamInfo.copy_and_update`                         | Aynı fikir                                                                                                                                                                                           |
| `Donusturucu`, `Sonuc`                   | `_base_converter.py` → `DocumentConverter`, `DocumentConverterResult`    | Ad farkı                                                                                                                                                                                             |
| `MiniMarkItDown.kaydet()`, `_donustur()` | `_markitdown.py` → `register_converter`, `_convert`                      | Asıl sürüm LLM/Azure seçeneklerini de dönüştürücülere iletir                                                                                                                                         |
| `tahminleri_uret()`                      | `_markitdown.py` → `_get_stream_info_guesses`                            | Asıl sürüm Google `magika` modeliyle içerik tanır; biz sihirli bayt tablosu kullanırız                                                                                                               |
| `charset_tahmini()`                      | `_read_charset_sample` + `charset_normalizer`                            | Bizimki kural tabanlı (Türkçe cp1254 sezgisi var)                                                                                                                                                    |
| `DuzMetinDonusturucu`                    | `converters/_plain_text_converter.py`                                    | Biz ikili veride (NUL baytı) hata veririz; asıl sürüm hata vermeden çözer (`charset_normalizer` ya da `errors="ignore"`)                                                                             |
| `HtmlDonusturucu`, `MarkdownYazici`      | `converters/_html_converter.py`, `converters/_markdownify.py`            | Asıl sürüm BeautifulSoup + markdownify                                                                                                                                                               |
| `DocxDonusturucu`                        | `converters/_docx_converter.py` (+ `converter_utils/docx/`)              | Asıl sürüm mammoth ile önce HTML'e çevirir; biz XML'i doğrudan okuruz                                                                                                                                |
| `CsvDonusturucu`                         | `converters/_csv_converter.py`                                           | Benzer: BOM silme, `\|` kaçışı, satır doldurma. Asıl sürüm `\|` önündeki ters eğik çizgileri ikiler ve yalnızca baştaki/sondaki (ve başlık sonrası) boş satırları atar; biz tüm boş satırları atarız |
| `JsonDonusturucu`                        | (yok) — asıl projede JSON `_plain_text_converter.py` ile düz metin geçer | Kod bloğu bizim eklememiz                                                                                                                                                                            |
| `ZipDonusturucu`                         | `converters/_zip_converter.py`                                           | Biz boyut/derinlik sınırı ekledik                                                                                                                                                                    |
| `guvenli_xml()`                          | `defusedxml` bağımlılığı                                                 | Yalnızca DTD reddi (ucuz önlem)                                                                                                                                                                      |
| `eklentileri_etkinlestir()`              | `_load_plugins` + `enable_plugins` (`markitdown.plugin` giriş noktası)   | Ek olarak modül adıyla yükleme                                                                                                                                                                       |
| `asama4_cli.py`                          | `__main__.py`                                                            | `-d` (Document Intelligence), `--keep-data-uris` gibi seçenekler yok                                                                                                                                 |

## Bilerek eksik bırakılanlar

PDF, PPTX, XLSX, resim (EXIF + LLM açıklaması), ses (konuşmadan metne), EPUB, Outlook `.msg`, YouTube ve
Wikipedia dönüştürücüleri; URL/`data:` URI girişleri; MCP sunucusu (`packages/markitdown-mcp`). Dossier'deki
"Gerçek ölçeğe giden yol" bölümü bunları hangi sırayla ekleyeceğini anlatır.
