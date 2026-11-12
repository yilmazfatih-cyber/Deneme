# Sıfırdan: sistem tasarımının yapı taşları

System Design Primer'in anlattığı (ya da yalnızca bağlantı verdiği) altı yapı taşını, çalışan ve test edilen küçük
Python modüllerine çeviriyoruz. Amaç üretim kodu değil, **ödünleşimleri ölçülebilir hâle getirmek**: "tutarlı hash
anahtarların ~1/N'ini taşır", "least-connections karışık yükte daha iyidir", "write-through soğuk yazmalarda önbelleği
kirletir" cümlelerinin her biri bir testle doğrulanıyor.

## Gereksinimler

- Python 3.11 veya üstü (3.13 ile denendi). Yalnızca standart kütüphane; ağ ve dış servis yok.

## Çalıştırma

```bash
cd repo-atlasi/dallar/09-bilgisayar-bilimi/system-design-primer/sifirdan
python3 load_balancer.py      # round-robin / least-connections / random karşılaştırması
python3 cache_strategies.py   # iki senaryoda üç önbellek stratejisinin maliyet ve isabet oranı
```

Örnek çıktı (4 eş sunucu, saniyede ~40 istek, isteklerin %5'i ~1 sn süren ağır iş):

```text
karışık  round-robin        ort=  799.3 ms  p95= 3327.1 ms  en kötü= 4543.3 ms
karışık  least-connections  ort=  218.9 ms  p95= 1090.8 ms  en kötü= 2854.1 ms
tekdüze  round-robin        ort=   20.1 ms  p95=   20.0 ms  en kötü=   31.9 ms
```

## Test

```bash
python3 -m unittest discover -s repo-atlasi/dallar/09-bilgisayar-bilimi/system-design-primer/sifirdan \
  -t repo-atlasi/dallar/09-bilgisayar-bilimi/system-design-primer/sifirdan
```

49 test (modüllerdeki doctest'ler ve Anki destesinin biçim denetimi dahil). Saat gerektiren her şey sahte saatle
(`clock` parametresi) test edilir; hiçbir test `sleep` yapmaz.

## Aşamalar

1. **`lru_cache.py`** — sözlük + nöbetçi düğümlü çift yönlü liste; isabet/ıskalama/atma sayaçları. Sonraki iki modül
   bunu kullanır.
2. **`consistent_hashing.py`** — MD5'in ilk 8 baytından 64 bitlik halka, `bisect` ile saat yönünde arama, sanal düğüm,
   ağırlık, çoğaltma için "ilk N farklı sunucu". Karşılaştırma için `modulo_assign` ve `moved_fraction`.
3. **`rate_limiter.py`** — token kovası (tembel dolum, `retry_after`), sabit pencere (sınır sorunu bilerek bırakıldı),
   kayan pencere günlüğü, kayan pencere sayacı ve sınırlayıcıları LRU'da tutan `KeyedRateLimiter`.
4. **`url_shortener.py`** — base62 kodla/çöz, atomik `put_if_absent` sözleşmeli KV deposu, hash tabanlı kısaltıcı
   (çakışmada deneme numarasını artırır, aynı URL'ye aynı kodu verir) ve sayaç tabanlı kısaltıcı; yalnızca http/https.
5. **`load_balancer.py`** — FIFO sunuculu ayrık olay simülasyonu; round-robin, least-connections, rastgele; ortalama,
   p95 ve en kötü gecikme.
6. **`cache_strategies.py`** — cache-aside, write-through, write-behind; maliyet modeli (önbellek 1, DB 10 birim),
   bayat okuma sayacı, iki iş yükü ve cache-aside yarış durumunun adım adım yeniden üretimi.

## Eşleme tablosu

| Mini'deki parça               | Primer'deki karşılığı                                                                          | Fark                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `lru_cache.py`                | `solutions/object_oriented_design/lru_cache/lru_cache.py`, README "Cache"                      | Orijinalde gövdeler `pass`; burada çalışan, testli, istatistikli       |
| `consistent_hashing.py`       | README "Database > Sharding" (dış bağlantı), "Under development" listesi                       | Primer konuyu işlemiyor; burada ölçümlü uygulama                       |
| `rate_limiter.py`             | "Additional system design interview questions" > "Design an API rate limiter"; "Back pressure" | Primer yalnızca bağlantı veriyor; dört algoritma ve karşılaştırma      |
| `url_shortener.py`            | `solutions/system_design/pastebin/README.md` (MD5 + base62, 7 karakter)                        | SHA-256 + son 7 karakter (düzgün dağılım), atomik yazma, idempotentlik |
| `load_balancer.py`            | README "Load balancer" (random, least loaded, round robin…)                                    | Stratejilerin simülasyonla karşılaştırılması                           |
| `cache_strategies.py`         | README "Cache > When to update the cache"                                                      | Dezavantaj maddeleri ölçülebilir testlere dönüştü                      |
| `anki/sistem-tasarimi-tr.tsv` | `resources/flash_cards/*.apkg` (56 İngilizce kart)                                             | 40 özgün Türkçe kart; Anki'ye metin olarak içe aktarılır               |

## Türkçe Anki destesi

`anki/sistem-tasarimi-tr.tsv` sekmeyle ayrılmış üç sütundur: ön yüz, arka yüz, etiketler. Dosyanın başındaki
`#separator:tab`, `#html:true`, `#notetype:Basic`, `#deck:…`, `#tags column:3` satırları Anki'nin metin içe aktarma
başlıklarıdır (Anki 2.1.55 ve sonrası, doğrulanmadı; daha eski sürümde bu satırları silip içe aktarma penceresinde "Sekme" ayırıcısını
seç). Ayrıntılı kullanım: [nasıl çalışılır](../nasil-calisilir.md).
