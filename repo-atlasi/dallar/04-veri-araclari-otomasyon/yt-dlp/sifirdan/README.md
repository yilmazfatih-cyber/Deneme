# yt-dlp — sıfırdan mini sürüm: çıkarıcı kaydı, format dili, devam eden indirme, şablon, son işlem

Bu mini, yt-dlp'nin beş temel mekanizmasını sıfırdan yazar ve **yalnızca yerel test sunucusuna** karşı
çalışır. Gerçek bir video sitesi için çıkarıcı içermez; örnek çıkarıcılar `127.0.0.1`/`localhost`
adreslerini tanır, orkestratör de varsayılan olarak başka sunuculara bağlanmayı reddeder
(`allowed_hosts`). Kod orijinaldir; asıl projeyle aynı sözleşmeleri ve aynı seçenek adlarını kullanır.

## Gereksinimler

- Python 3.11+, yalnızca standart kütüphane.
- İsteğe bağlı: `ffmpeg` + `ffprobe` (birleştirme ve ses çıkarma). Yoksa ilgili testler açıklamayla atlanır.

## Çalıştırma

Kendi içeriğini barındıran bir yerel sunucu ile dene (testlerdeki `tests/sahte_site.py` örnek olabilir):

```bash
cd sifirdan
python3 cli.py http://127.0.0.1:8000/izle/v1 -F                     # formatları listele
python3 cli.py http://127.0.0.1:8000/izle/v1 -f "b[height<=480]"     # seçim dili
python3 cli.py http://127.0.0.1:8000/izle/v1 -S "res:720,+size"      # sıralama
python3 cli.py http://127.0.0.1:8000/liste/gezi -o "%(playlist)s/%(playlist_index)02d - %(title)s.%(ext)s"
python3 cli.py http://127.0.0.1:8000/izle/v1 -x --write-info-json    # sesi çıkar + bilgi dosyası
python3 cli.py http://127.0.0.1:8000/izle/v1 --limit-rate 200K       # sunucuya nazik ol
```

## Test

```bash
python3 -m unittest discover -s . -t .        # sifirdan/ içinden: 30 test (~6 sn)
```

`tests/sahte_site.py` gerçek bir "video sitesi" taklit eder: gömülü JSON'lu izleme sayfası, liste sayfası,
yalnızca `<video src>` içeren sayfa ve **Range destekli** medya dosyaları. Davranış bayrakları ile ilk
istekte bağlantıyı koparabilir (`kes`) ya da Range'i yok sayabilir (`range_yok`). ffmpeg testleri gerçek
küçük medya dosyalarını `testsrc` ve `sine` kaynaklarından üretir.

## Aşamalar

| Aşama | Dosya                | Ne öğretir                                                                                                                                                         |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `asama1_cikarici.py` | `_VALID_URL` + `suitable()` + `_real_extract()` sözleşmesi; `__init_subclass__` ile otomatik kayıt; genel çıkarıcı en sonda; gömülü JSON'dan bilgi sözlüğü         |
| 2     | `asama2_format.py`   | Formatları kötüden iyiye sıralama (`-S`, `res:720`, `+size`); `-f` dili için sözcük ayırıcı + özyinelemeli iniş ayrıştırıcı; `/ + , ( ) [süzgeç]`; `bv*+ba/b`      |
| 3     | `asama3_indirici.py` | `.part` dosyası, `Range` ile devam, `Content-Range` doğrulaması, 416, üstel geri çekilmeli yeniden deneme, ilerleme kancaları, hız sınırı                          |
| 4     | `asama4_sablon.py`   | `%(alan)s` şablonu, varsayılan (`\|`), noktalı yol, `NA`, dosya adı temizleme (tam genişlikli karakterler, `--restrict-filenames`), dizin dışına çıkmayı engelleme |
| 5     | `asama5_sonislem.py` | `run(bilgi) -> (silinecekler, bilgi)` zinciri; ffmpeg ile birleştirme ve ses çıkarma; `.info.json`                                                                 |
| 6     | `asama6_ydl.py`      | Orkestratör: çıkar → `_type` çöz (url/playlist/video) → sırala+seç → adlandır → indir → son işle                                                                   |
| -     | `cli.py`             | yt-dlp ile aynı seçenek adları (`-f -S -F -o -P -x -k -s --limit-rate`)                                                                                            |

## Gerçek depoyla eşleme

| Mini'deki parça                         | Gerçek depodaki karşılığı                                                                  | Fark                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `BilgiCikarici`                         | `yt_dlp/extractor/common.py` → `InfoExtractor`                                             | Asıl dosya ~4.200 satır: giriş, çerez, coğrafi engel, m3u8/DASH ayrıştırma yardımcıları           |
| `__init_subclass__` kaydı               | `yt_dlp/extractor/_extractors.py` + `extractors.py` + `devscripts/make_lazy_extractors.py` | Asıl proje ~1.750 sınıfı açıkça içe aktarır; hız için "tembel" (lazy) kayıt üretir                |
| `GenelIE`                               | `yt_dlp/extractor/generic.py` → `GenericIE`                                                | Asıl sürüm gömülü oynatıcıları, OEmbed'i, JSON-LD'yi de arar                                      |
| `formatlari_sirala()`                   | `yt_dlp/utils/_utils.py` → `FormatSorter`                                                  | Asıl sürümde codec/HDR/protokol tercih tabloları çok daha zengin                                  |
| `ayristir()` / `formatlari_sec()`       | `yt_dlp/YoutubeDL.py` → `build_format_selector`                                            | Asıl sürüm Python'un `tokenize` modülünü kullanır (kodda "HACK" ve "TODO" notlarıyla)             |
| `formatlari_birlestir()`                | `build_format_selector` içindeki `_merge`                                                  | Aynı kural: zaten alınmış akış türünü getiren parça atılır                                        |
| `HttpIndirici`                          | `yt_dlp/downloader/http.py` → `HttpFD`, `downloader/common.py` → `FileDownloader`          | Asıl sürümde parçalı (chunked) indirme, `.ytdl` dosyası, HLS/DASH için ayrı indiriciler var       |
| `sablonu_uygula()`                      | `YoutubeDL.prepare_outtmpl` / `evaluate_outtmpl`                                           | Asıl dil matematik, tarih biçimi, alternatif alan, `l`/`j`/`q` dönüşümleri de bilir               |
| `dosya_adini_temizle()`                 | `yt_dlp/utils/_utils.py` → `sanitize_filename`                                             | Aynı fikir (tam genişlikli karakterler); asıl sürüm zaman damgası gibi özel durumları da ele alır |
| `SonIslemci`, `run_pp`                  | `yt_dlp/postprocessor/common.py`, `YoutubeDL.run_pp` / `run_all_pps`                       | Asıl sürümde 8 aşama var (`POSTPROCESS_WHEN`); bizde 2                                            |
| `FFmpegSesCikarPP`, `FFmpegBirlestirPP` | `postprocessor/ffmpeg.py` → `FFmpegExtractAudioPP`, `FFmpegMergerPP`                       | Yeniden kodlama, kalite, kapak gömme yok                                                          |
| `MiniYDL`                               | `yt_dlp/YoutubeDL.py` → `YoutubeDL`                                                        | İndirme arşivi, filtreler, altyazı, çerezler, ağ katmanı yok                                      |

## Etik ve hukuk notu

İndirme araçları tarafsızdır ama kullanım tarafsız değildir: telif hakkıyla korunan içeriği izinsiz
indirmek ve sitelerin kullanım koşullarını ihlal etmek hukuki sorun doğurur (Türkiye'de 5846 sayılı
FSEK). Bu mini yalnızca kendi içeriğin ya da indirme izni olan içerik için tasarlandı; `--allow-host`
bayrağını yalnızca böyle sunucular için kullan, `--limit-rate` ile sunucuya yük bindirme.
