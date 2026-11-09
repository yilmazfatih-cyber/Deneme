# moda_radar/veri — veri katmanı

| Modül             | İş                                                                                     |
| ----------------- | -------------------------------------------------------------------------------------- |
| `depo.py`         | SQLite deposu `veri/moda.db` (ADR-005): tablolar, `sinyaller()`, `gozlemler()`, upsert |
| `zaman_kilidi.py` | `kilitle(depo, T)` → T'den sonraki hiçbir kaydı görmeyen salt okunur görünüm           |
| `sinyal.py`       | `content/sinyaller/*.json` (rapor sinyalleri) okuma + DB'ye yazma                      |
| `podyum_vogue.py` | Vogue Runway look URL'leri; saf ayrıştırıcı `look_urlleri(html)`                       |
| `perakende.py`    | `content/perakende-kaynaklar.json` ile sürülen raf toplayıcısı; `urunleri_ayikla()`    |
| `gecikme_olc.py`  | Podyum→raf gecikmesi (gün) ölçümü ve özeti                                             |
| `ag.py`           | Dürüst User-Agent, robots.txt, `tarama-yasak.json`, ≤ 1 istek/sn                       |
| `renk_koprusu.py` | `moda_radar.renk` varsa görsel baytından RenkKaydi; yoksa yalnız URL                   |
| `komut.py`        | `topla`, `db-ozet`, `gecikme-olc`, `sinyal-yukle`                                      |

## Perakende hedefleri — canlı doğrulama (2026-11-09)

Dürüst UA (`ModaRadar/0.1`), robots.txt denetimi, saniyede ≤ 1 istek ile ölçüldü. HTML yalnız geçici olarak
incelendi, silindi; depoda yalnız sentetik fixture var (`tests/fixtures/perakende_magazalar.html`).

| Segment | Marka   | Durum                                                                                                         | Sayfa başına |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------- | -----------: |
| luks    | Beymen  | `dogrulandi: true` (önceki ölçüm 96 ürün); prova gününde oturum ağı alanı açmadı                              |            — |
| premium | Ipekyol | `dogrulandi: true`; Next.js ama kartlar sunucuda işleniyor (`li[data-productid]`)                             |           20 |
| orta    | Koton   | `dogrulandi: true`; sunucu tarafı (`div.product-item`, fiyat `1299.99` biçimi)                                |           24 |
| orta    | DeFacto | `dogrulandi: true`; sunucu tarafı (`div.product-card`, kampanya + üstü çizili fiyat)                          |        23–24 |
| deger   | Addax   | `js: true`, `dogrulandi: false`: liste farktorcdn.com betikleriyle doluyor; bu oturumun ağı o alanı açmıyordu |            0 |

**Kapalı (bot engeli — aşılmaz):** Zara (403, robots.txt dahil), Massimo Dutti (403), Trendyol (dürüst UA'ya 403),
LC Waikiki (captcha). Alanlar `content/tarama-yasak.json`'da gerekçeli; `perakende-kaynaklar.json`'da `"etkin": false` +
`"neden"`. Tarayıcı kimliği taklidi, captcha çözme, proxy ya da başlık oynaması yapılmaz: engelleyen site = yasak listesi.

`topla` yasak/robots nedeniyle reddedilen hedefi hata saymaz; `{"hedef": ..., "bulunan": 0, "atlandi": "<neden>"}` yazar.
Neden ayrılır: `tarama-yasak.json listesinde`, `robots.txt izin vermiyor`, `robots.txt alınamadı (...)` (ağ hatası →
kibar taraf taramaz). Görsel alınamazsa hedef satırında `gorsel_alinamadi` sayısı çıkar; günlüğe yalnız ilki yazılır.

### İlk GitHub Actions çalışmasında karşılaştır

Actions çalıştırıcılarının IP'leri bu oturumdan farklıdır; bir site burada açıkken orada 403/captcha verebilir (ya da
tersi). İlk çalışmada her hedefin JSON satırını yukarıdaki tabloyla karşılaştır:

- `bulunan` beklenenden çok düşük ya da `HTTP Error 403` → bot engeli olabilir; aşma, alanı yasak listesine ekle.
- `renkli: 0` ve `gorsel_alinamadi > 0` → görsel CDN'i (ktnimg2.mncdn.com, dfcdn.defacto.com.tr, ipekyol.sm.mncdn.com)
  erişilemiyor; bu oturumda üçü de ağ katmanında kapalıydı, bu yüzden renk çıkarımı burada kanıtlanamadı.
- Addax'ta `bulunan > 0` gelirse kart seçicilerini düzelt ve `dogrulandi: true` + `dogrulama_tarihi` yaz.

## Seçici bakımı

Doğrulanmamış (`"dogrulandi": false`) hedefler ve bozulan seçiciler için. Vogue ayrıştırıcısı sentetik fixture ile
sınanmıştır. Bir hedef `bulunan: 0` verdiğinde:

1. `python -m moda_radar topla --kaynak perakende --kuru` ile planı gör.
2. Actions günlüğünde her hedefin JSON satırına bak: `"bulunan": 0` ve `"uyari"` → URL veya `kart` seçicisi yanlış;
   `"HATA ... 404"` → kategori URL'si değişmiş; `"atlandi"` → yasak liste / robots.txt / robots'a ulaşılamadı
   (nedeni satırda; bot engeliyse hedefi `"etkin": false` yap, alanı `content/tarama-yasak.json`'a ekle).
3. Tarayıcıda sayfayı aç, geliştirici araçlarında ürün kartını incele; `kart`, `baslik`, `fiyat`, `link`, `gorsel`
   seçicilerini düzelt; `urunleri_ayikla` gerçek sayfada ≥ 20 ürün (başlık + fiyat + link + görsel) döndürüyorsa
   `"dogrulandi": true` ve `"dogrulama_tarihi": "YYYY-AA-GG"` yaz (doğrulama ikisini birlikte ister).
4. Podyumda `vogue: hiçbir strateji görsel bulamadı` uyarısı → sayfa yapısı değişmiş; `look_urlleri` stratejilerini
   güncelle. `HTTP Error 404` → `content/defileler.json`'daki slug yanlış.

Sayfa HTML'i ve görseller hiçbir koşulda diske yazılmaz (ADR-002); hata ayıklamak için tarayıcı kullanılır.
