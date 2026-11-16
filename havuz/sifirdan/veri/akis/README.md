# akis — olay zamanlı akış işleme: pencere, filigran, geç gelen olay

"Son 5 dakikadaki satış toplamı" gibi sorular sürekli akan olaylar üzerinde sorulur. Zorluk: olaylar
**geç ve karışık sırayla** gelir (telefon çevrimdışıydı, ağ yavaştı). Bu klasör olayları kendi
zamanlarına (olay zamanı) göre pencerelere koyar, "bu pencere artık tamam" kararını **filigranla**
(watermark) verir, izin verilen gecikme içinde gelen geç olayla sonucu **düzeltir**, daha geç geleni
ayırır. (Apache Flink / Beam'in temel modeli.) Yalnız standart kitaplık.

```python
from akis import AGGREGATES, Event, StreamProcessor, Tumbling

p = StreamProcessor(
    Tumbling(60_000), AGGREGATES["toplam"], out_of_orderness=5_000, allowed_lateness=60_000
)
for olay in [Event("satış", 120.0, time=1_000), Event("satış", 80.0, time=70_000)]:
    for sonuc in p.process(olay):
        print(sonuc)  # Result(window=(0, 60000), key='satış', value=120.0, kind='ilk')
p.flush()  # akış bitti: kalan pencereler "son" sonucunu verir
p.late  # pencereye giremeyecek kadar geç gelenler
```

## Nasıl çalışır

```
olay zamanı ekseni:  0 ─────── 10 ─────── 20 ─────── 30
pencereler (boy 10): [ 0,10 )  [10,20 )   [20,30 )

varış sırası:  t=3  t=12  t=7  t=25  t=9 ...
filigran W = görülen en büyük olay zamanı − karışıklık payı (D = 2)
  t=12 gelince W = 10  → [0,10) bitişi 10 ≤ W: "ilk" sonuç (t=3'ü içerir)
  t=7  gelince         → [0,10) zaten sonuç verdi ama izinli gecikme (L = 5) sürüyor: "düzeltme"
  t=25 gelince W = 23  → 10 + L = 15 ≤ 23: [0,10) KAPANIR ("son"); [10,20) "ilk"
  t=9  gelince         → [0,10) kapalı: olay `late` listesine
```

- **Pencere atayıcıları** (`windows.py`): atlayan `Tumbling(boy)` → her olay bir pencerede; kayan
  `Sliding(boy, kayma)` → her olay boy/kayma pencerede. Pencereler yarı açık `[başlangıç, bitiş)`.
- **Filigran:** `W = max(olay zamanı) − out_of_orderness`; hiç geri gitmez. Gerçek karışıklık bu payı
  aşmıyorsa "ilk" sonuçlar zaten kesindir (hiç düzeltme olmaz).
- **İzin verilen gecikme:** pencere `bitiş + allowed_lateness ≤ W` olana dek açık kalır; o sürede gelen
  olay sonucu düzeltir. Sonra pencere kapanır ve belleği boşalır.
- **Kümeleme** (`aggregates.py`): sayı, toplam, ortalama, en küçük, en büyük. Toplam `math.fsum` ile
  hesaplanır: varış sırası sonucu değiştirmez.

## Dosya haritası

| Dosya           | Sorumluluk                                                         |
| --------------- | ------------------------------------------------------------------ |
| `engine.py`     | `StreamProcessor`: kabul, filigran, "ilk/düzeltme/son", geç olaylar |
| `windows.py`    | `Tumbling`, `Sliding` pencere atayıcıları                          |
| `aggregates.py` | kümeleme işlevleri (`AGGREGATES` kaydı, `YENİ ... BURAYA`)          |

## Güvenceler (testle kanıtlanan)

- **Toplu hesapla aynılık:** tamamen karışık varış sırasında, her filigran payı ve izinli gecikme için,
  pencerelerin son sonuçları, kabul edilen olaylar üzerinden yapılan toplu (batch) hesapla aynıdır; geç
  sayılan olaylar, belgelenen kuralı bağımsız uygulayan başvuruyla birebir aynıdır (5 kümeleme × 2
  pencere türü, Hypothesis).
- **Sınırlı karışıklık:** karışıklık ≤ filigran payıysa hiç düzeltme ve geç olay yoktur ve "ilk"
  sonuçlar toplu hesapla aynıdır.
- **Yaşam döngüsü:** her (pencere, anahtar) tam bir "ilk" ve tam bir "son" verir; düzeltmeler ilkten
  sonradır; akış bitince açık pencere kalmaz; filigran geri gitmez.
- **Testin dişleri:** 5 bilerek bozulmuş sürüm (kapalı pencereye kabul, erken sonuç, kayan pencere
  kayması, düzeltmeyi yaymama, geri giden filigran) yakalandı.

## Sağlamadıkları (dürüst sınırlar)

- **Tek süreç, bellek içi:** durum (açık pencereler, filigran) kalıcı değildir; çökmede kaybolur.
  "Tam bir kez" çıktı ve denetim noktası (checkpoint) yok.
- **Filigran sezgiseldir:** karışıklık payı yanlış seçilirse sonuçlar düzeltilir (ya da olaylar geç
  sayılır); boşta kalan kaynakta filigran ilerlemez (zaman aşımıyla ilerletme yok).
- Oturum (session) penceresi, birleştirme (join), çok kaynaklı filigran (en küçüğünü alma) yok.
- Sonuç listesi her olayda sıralanmış pencere taraması yapar (çok sayıda açık pencere için yavaş).

## Buradan nereye

1. **Oturum penceresi:** boşluk `gap`'i aşınca kapanan, yeni olayla birleşebilen pencereler.
2. **Denetim noktası:** açık pencereleri ve filigranı `anahtar_deger`'e yazıp çökmeden sonra sürdürmek.
3. **Çok kaynak:** her kaynağın filigranı ayrı; genel filigran = en küçüğü; boşta kalan kaynak için zaman aşımı.
4. **Akış birleştirme:** iki akışı aynı pencere ve anahtarda birleştirmek (ör. sipariş + ödeme).
5. **Yaklaşık kümeleme:** HyperLogLog (farklı sayısı), t-digest (yüzdelik) — bellekte küçük özetler.
6. **Geri basınç:** girdi hızı işleme hızını aşınca kaynağı yavaşlatan sınırlı kuyruk.
