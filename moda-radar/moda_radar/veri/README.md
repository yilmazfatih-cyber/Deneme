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

## Seçiciler doğrulanmadı

`content/perakende-kaynaklar.json`'daki URL'ler ve CSS seçicileri ağ erişimi olmadan, sitelerin bilinen yapısına göre
yazıldı; hepsi `"dogrulandi": false`. Vogue ayrıştırıcısı da sentetik fixture ile sınanmıştır. İlk gerçek çalıştırmada:

1. `python -m moda_radar topla --kaynak perakende --kuru` ile planı gör.
2. Actions günlüğünde her hedefin JSON satırına bak: `"bulunan": 0` ve `"uyari"` → URL veya `kart` seçicisi yanlış;
   `"HATA ... 404"` → kategori URL'si değişmiş; `TaramaYasak` → robots.txt izin vermiyor (hedefi kaldır, alanı
   `content/tarama-yasak.json`'a ekle).
3. Tarayıcıda sayfayı aç, geliştirici araçlarında ürün kartını incele; `kart`, `baslik`, `fiyat`, `link`, `gorsel`
   seçicilerini düzelt; `urunleri_ayikla` bir kartta başlık + fiyat + link döndürüyorsa `"dogrulandi": true` yap.
4. Podyumda `vogue: hiçbir strateji görsel bulamadı` uyarısı → sayfa yapısı değişmiş; `look_urlleri` stratejilerini
   güncelle. `HTTP Error 404` → `content/defileler.json`'daki slug yanlış.

Sayfa HTML'i ve görseller hiçbir koşulda diske yazılmaz (ADR-002); hata ayıklamak için tarayıcı kullanılır.
