---
baslik: Segmentasyon ve RFM
ozet: Kural tabanlı RFM puanlaması (sabit analiz tarihi, NTILE eşitlik tuzağı), segment adları ve dönemler arası geçiş matrisi, kümelemeyle segmentasyon ve yorumlama, segmenti eyleme ve kontrol gruplu ölçüme bağlamak.
etiketler: [veri, segmentasyon, rfm, musteri, kumeleme, sql]
duzey: orta
guncellik: 2026-11
---

# Segmentasyon ve RFM

> Bu notu ne zaman okumalı: müşterileri gruplara ayırıp her gruba farklı bir şey yapılacakken (kampanya, hatırlatma,
> hizmet düzeyi); "müşterilerimizi segmentlere ayıralım" isteği geldiğinde; bir segment raporunun ne işe yaradığı
> sorulduğunda.

## Temel fikir

Segment, **farklı eyleme** yol açan müşteri grubudur. Eylemi değiştirmeyen segment rapordur, karar değil. İki yol:

- **Kural tabanlı RFM:** son alışverişten bu yana geçen süre (recency, R), alışveriş sayısı (frequency, F) ve toplam
  tutar (monetary, M) bir pencerede hesaplanır, iş anlamı olan eşiklerle 1–5 puanlanır, puanlardan adlı segmentler
  çıkar ("şampiyon", "risk altında"). Açıklanabilir, kararlı, SQL'le kurulur; çoğu iş için yeter.
- **Kümeleme:** davranış sütunlarından veriyle grup bulmak. Beklenmedik grupları gösterebilir ama ölçeğe, aykırı
  değere ve tohuma duyarlıdır; her zaman bir grup bulur ([kümeleme ve boyut indirgeme](../80-ml/kumeleme-ve-boyut-indirgeme.md)).

Her iki yolda da segment bir **anlık görüntüdür**: müşteriler segmentler arasında gezer. Asıl yönetilen şey
geçişlerdir ("geçen çeyreğin şampiyonlarından kaçı risk altına düştü?").

Ürün konumlandırmasındaki "segment" (kimin için ürün yapıyoruz) başka bir sorudur:
[segment ve konumlandırma](../95-urun/segment-ve-konumlandirma.md).

## Karar tablosu

| Durum | Seçim | Neden |
| --- | --- | --- |
| Tekrarlı alışveriş (e-ticaret, abonelik dışı hizmet) | RFM, eşikli puanlar | Davranışın özü üç sayıda |
| Abonelik ürünü | R yerine kullanım düşüşü, F yerine etkin gün, M yerine plan | Herkes her ay "alışveriş" yapıyor |
| Birkaç dev hesap var (kurumsal) | Önce kuralla ayrı segment, sonra kalanı segmentle | Dev hesap ortalamayı ve kümelemeyi bozar |
| Davranış sütunu çok (kategori, kanal, cihaz) ve sezgi yok | Kümeleme: log + ölçekleme; profil tablosuyla adlandırma | Kuralla düşünülemeyen grupları gösterir |
| Segmentin işe yarayıp yaramadığı sorulacak | Segment içinde rastgele kontrol grubu | Eylemin etkisi ancak böyle ölçülür ([etki modelleme](../80-ml/etki-modelleme.md)) |
| Segment sayısı ekip kapasitesini aşıyor | Aynı eylemi alan segmentleri birleştirin | 5–7 segmentten fazlası yönetilmez |

## RFM: SQL ile

Kurallar: analiz tarihi **sabit** yazılır (`date('now')` her çalıştırmada başka sonuç verir); pencere sabittir (son
365 gün); iptal ve iade edilen siparişler dışarıda; puan eşikleri iş anlamından gelir ("son 30 günde" = 5).
`NTILE` ile yüzdelik puanlama yaygın ama eşit değerleri keyfî bölüştürür:

```sql calistir
CREATE TABLE ozellik (musteri TEXT, son_gun INTEGER, aralik INTEGER, adet INTEGER, tutar REAL);
INSERT INTO ozellik VALUES ('m01', 5, 20, 12, 450), ('m02', 12, 30, 8, 300), ('m03', 40, 30, 6, 900),
  ('m04', 200, 25, 4, 350), ('m05', 3, 0, 1, 1200), ('m06', 10, 0, 1, 150), ('m07', 300, 0, 1, 200),
  ('m08', 250, 40, 2, 180), ('m09', 60, 60, 3, 260), ('m10', 90, 30, 2, 500), ('m11', 20, 0, 1, 90),
  ('m12', 150, 0, 1, 700);
-- Sipariş tablosunu özellikten üret: k. sipariş, 1 Kasım'dan (son_gun + k·aralik) gün önce
CREATE TABLE siparis AS
  WITH RECURSIVE k(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM k WHERE n < 11)
  SELECT musteri, date('2026-11-01', '-' || (son_gun + n * aralik) || ' days') AS tarih, tutar, 'teslim' AS durum
  FROM ozellik JOIN k ON n < adet;
INSERT INTO siparis VALUES ('m06', '2026-10-25', 5000, 'iptal');  -- iptal: RFM'ye girmez
CREATE TABLE donem (ad TEXT, tarih TEXT);  -- analiz tarihi SABİT yazılır, date('now') kullanılmaz
INSERT INTO donem VALUES ('agustos', '2026-08-01'), ('kasim', '2026-11-01');
CREATE VIEW rfm AS  -- her analiz tarihi için: o tarihe kadarki son 365 gün, yalnız teslim edilenler
  SELECT d.ad AS donem, s.musteri, CAST(julianday(d.tarih) - julianday(MAX(s.tarih)) AS INTEGER) AS r_gun,
         COUNT(*) AS f, SUM(s.tutar) AS m
  FROM donem d JOIN siparis s ON s.tarih <= d.tarih AND s.tarih > date(d.tarih, '-365 days') AND s.durum = 'teslim'
  GROUP BY d.ad, s.musteri;
CREATE VIEW segment AS
  SELECT donem, musteri,
         CASE WHEN r >= 4 AND fp >= 4 THEN 'şampiyon' WHEN r <= 2 AND fp >= 3 THEN 'risk altında'
              WHEN r >= 4 AND fp = 1 THEN 'yeni' WHEN r <= 2 THEN 'uykuda' ELSE 'gelişen' END AS ad
  FROM (SELECT donem, musteri,
               CASE WHEN r_gun <= 30 THEN 5 WHEN r_gun <= 60 THEN 4 WHEN r_gun <= 120 THEN 3
                    WHEN r_gun <= 240 THEN 2 ELSE 1 END AS r,  -- eşikler iş anlamından: "son 30 günde" …
               CASE WHEN f >= 8 THEN 5 WHEN f >= 4 THEN 4 WHEN f >= 3 THEN 3 WHEN f = 2 THEN 2 ELSE 1 END AS fp
        FROM rfm);
-- YANLIŞ: NTILE eşit değerleri keyfî bölüştürür → aynı sipariş sayısı iki ayrı puan alır
SELECT 'NTILE: ' || f || ' siparişli müşteriler', MIN(puan) || ' ve ' || MAX(puan) || ' puan almış' FROM (
  SELECT f, NTILE(5) OVER (ORDER BY f) AS puan FROM rfm WHERE donem = 'kasim')
GROUP BY f HAVING MIN(puan) <> MAX(puan);
-- Kasım segmentleri
SELECT ad, COUNT(*), GROUP_CONCAT(musteri, ' ') FROM (SELECT * FROM segment WHERE donem = 'kasim' ORDER BY musteri)
GROUP BY ad ORDER BY COUNT(*) DESC, ad;
-- Geçiş matrisi: Ağustos'taki segment → Kasım'daki segment
SELECT a.ad || ' → ' || k.ad, COUNT(*) FROM segment a JOIN segment k USING (musteri)
WHERE a.donem = 'agustos' AND k.donem = 'kasim' AND a.ad <> k.ad GROUP BY 1 ORDER BY 2 DESC, 1;
```

```cikti
NTILE: 1 siparişli müşteriler|1 ve 2 puan almış
NTILE: 2 siparişli müşteriler|2 ve 3 puan almış
uykuda|3|m07 m08 m12
yeni|3|m05 m06 m11
şampiyon|3|m01 m02 m03
gelişen|2|m09 m10
risk altında|1|m04
gelişen → risk altında|1
yeni → gelişen|1
yeni → uykuda|1
```

Okuma:

- `NTILE` ile tek siparişli beş müşterinin bir kısmı 1, bir kısmı 2 puan aldı: davranışları aynı, segmentleri farklı,
  hangisinin hangi puanı alacağı satır sırasına bağlı. Çoğu müşterinin 1–2 sipariş verdiği işlerde bu, segmentlerin
  yarısını keyfî yapar. Eşikli puan hem kararlı hem açıklanabilirdir ("son 30 günde alışveriş = 5").
- m06'nın 5.000 TL'lik iptal edilmiş siparişi M'ye girmedi; girseydi "yeni" değil "büyük müşteri" görünürdü.
- **Geçiş matrisi** asıl iş listesidir: m04 dört kez almış ama 200 gündür yok ("gelişen → risk altında"); m12 tek
  alışverişten sonra dönmedi. Ağustos'ta henüz olmayan müşteriler (m05) matriste yoktur; yeni gelenler ayrı sayılır.
- M çarpıktır: puanlarken eşikleri dağılımın yüzdeliklerine bakarak ama **yuvarlak, sabit değerler** olarak
  koyun (ör. 500, 1.500, 5.000 TL) ve her çeyrek aynı eşikleri kullanın; yoksa segmentler eşik kaydığı için değişir.

Havuzdaki örnek e-ticaret verisiyle (300 müşteri, 2.643 sipariş, iptal ve iade dahil) aynı sorgu denenebilir:
[`veri/ornekler/eticaret`](../../veri/ornekler/eticaret/VERI_KARTI.md) (`siparisler.csv`: `musteri_id`,
`siparis_zamani`, `toplam`, `durum`).

## Kümelemeyle segmentasyon

Üç davranış (sık-küçük, seyrek-büyük, kaybolan) ve üç dev kurumsal hesap. Ham değerlerle kümeleme ile "önce kural,
sonra log + ölçekleme":

```python calistir
import math
import random
import statistics
from collections import Counter

rng = random.Random(17)
KINDS = {  # (r_gun aralığı, sipariş sayısı ortalaması, sepet ortalaması TL)
    "sık-küçük": ((1, 40), 12, 150), "seyrek-büyük": ((20, 120), 2, 2500), "kaybolan": ((200, 360), 3, 300),
}
customers = []
for kind, ((r_lo, r_hi), f_mean, basket) in KINDS.items():
    for _ in range(200):
        f = max(1, round(rng.gauss(f_mean, f_mean / 3)))
        m = sum(rng.lognormvariate(math.log(basket), 0.5) for _ in range(f))
        customers.append((kind, (rng.uniform(r_lo, r_hi), f, m)))
customers += [("kurumsal", (rng.uniform(1, 60), 20, 150_000.0)) for _ in range(3)]  # birkaç dev hesap


def kmeans(points, k, restarts=5, rounds=25):  # birkaç farklı başlangıç; en küçük toplam uzaklık kazanır
    best = None
    for seed in range(restarts):
        centers = random.Random(seed).sample(points, k)
        for _ in range(rounds):
            groups = [min(range(k), key=lambda c: math.dist(p, centers[c])) for p in points]
            centers = [[statistics.fmean(p[d] for p, g in zip(points, groups) if g == c) if c in groups
                        else centers[c][d] for d in range(len(points[0]))] for c in range(k)]
        inertia = sum(math.dist(p, centers[g]) ** 2 for p, g in zip(points, groups))
        best = min(best or (inertia, groups), (inertia, groups))
    return best[1]


def standardize(rows):
    stats = [(statistics.fmean(c), statistics.pstdev(c)) for c in zip(*rows)]
    return [[(v - mu) / sd for v, (mu, sd) in zip(row, stats)] for row in rows]


def profile(name, members, groups, k):
    print(f"{name}:")
    for c in range(k):
        part = [(kind, x) for (kind, x), g in zip(members, groups) if g == c]
        med = [statistics.median(x[d] for _, x in part) for d in range(3)]
        top = ", ".join(f"{kind} {n}" for kind, n in Counter(kind for kind, _ in part).most_common(2))
        print(f"  {len(part):3d} müşteri | ortanca r {med[0]:3.0f} gün, f {med[1]:4.1f}, m {med[2]:7.0f} TL | {top}")


profile("ham değerlerle k=3", customers, kmeans([list(x) for _, x in customers], 3), 3)
rest = [c for c in customers if c[1][2] < 50_000]  # kural önce: dev hesaplar ayrı segment
logged = standardize([[math.log1p(r), math.log1p(f), math.log1p(m)] for _, (r, f, m) in rest])
profile("dev hesaplar ayrıldı, log + ölçekleme, k=3", rest, kmeans(logged, 3), 3)
```

```cikti
ham değerlerle k=3:
  485 müşteri | ortanca r  64 gün, f  4.0, m    1556 TL | sık-küçük 200, kaybolan 200
  115 müşteri | ortanca r  75 gün, f  2.0, m    6884 TL | seyrek-büyük 115
    3 müşteri | ortanca r  26 gün, f 20.0, m  150000 TL | kurumsal 3
dev hesaplar ayrıldı, log + ölçekleme, k=3:
  192 müşteri | ortanca r  71 gün, f  2.0, m    5301 TL | seyrek-büyük 192
  211 müşteri | ortanca r 280 gün, f  3.0, m    1011 TL | kaybolan 200, seyrek-büyük 8
  197 müşteri | ortanca r  20 gün, f 11.0, m    1935 TL | sık-küçük 197
```

Ham değerlerle kümeleme tutarı (en büyük sayı) böler: üç kümeden biri üç dev hesaba gitti ve en önemli ayrım
(**etkin** sık alıcı ↔ **kaybolmuş** müşteri) tek kümede eridi. Dev hesapları kuralla ayırıp log ve ölçekleme
yapınca üç davranış ortaya çıkıyor. Gerçek veride "doğru" küme bilinmez; kümeler profil tablosuyla (büyüklük,
ortanca R/F/M, birkaç örnek müşteri) adlandırılır, adlandırılamayan küme kullanılmaz. Kararlılık ve k seçimi:
[kümeleme ve boyut indirgeme](../80-ml/kumeleme-ve-boyut-indirgeme.md).

## Segmentten eyleme

Her segment için dört satır yazılmadan segment yayına girmez:

| Segment | Eylem | Başarı ölçütü | Kontrol |
| --- | --- | --- | --- |
| Şampiyon | Erken erişim, tavsiye daveti; indirim **yok** (zaten alıyorlar) | Tavsiye sayısı; kayıp oranı | Segmentin %10'u davetsiz |
| Risk altında | Kişisel "neden gelmediniz" iletisi, tek soru; ticari ileti izni olanlara teklif | 60 gün içinde dönüş oranı | %10–20 rastgele iletisiz |
| Yeni | İkinci alışverişe yönelik karşılama dizisi (2–3 ileti) | İkinci sipariş oranı (30 gün) | %10 iletisiz |
| Uykuda | En fazla bir geri kazanma iletisi; sonra listeden düşürme | Dönüş oranı; abonelikten çıkma oranı | %20 iletisiz |
| Kurumsal | Hesap yöneticisi, ayrı fiyat ve sözleşme | Yenileme oranı | Kontrol yok; az sayıda, nitel takip |

- Kontrol grubu olmadan "risk altındakilere e-posta attık, %18'i döndü" cümlesi hiçbir şey söylemez: belki %17'si
  zaten dönecekti ([etki modelleme](../80-ml/etki-modelleme.md)).
- Segment büyüklüğü değil, **geçiş oranları** izlenir: yeni → gelişen, şampiyon → risk altında. Panoya bu matris girer
  ([pano tasarımı](pano-tasarimi.md)).
- Ticari ileti göndermek için açık onay gerekir; segment bu onayı vermez
  ([içerik ve büyüme](../95-urun/icerik-ve-buyume.md)). Kişisel veriye dayalı profilleme aydınlatma metninde yazılır
  ([KVKK pratiği](../50-guvenlik/kvkk-pratik.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Segmentler her çalıştırmada biraz değişiyor | `date('now')` ya da kayan eşik (yüzdelik) | Sabit analiz tarihi; sabit, yuvarlak eşikler |
| Aynı davranıştaki müşteriler farklı segmentte | `NTILE` eşitlikleri keyfî bölüyor | Eşikli puan ya da eşitliğe aynı puan veren sıralama |
| "Büyük müşteri" segmentinde iade eden müşteri | İptal/iade siparişler M'ye girdi | `durum` süzgeci; iadeyi tutardan düşün |
| Kümeleme tutara göre bölüyor | Ölçeklenmemiş, çarpık M | log + ölçekleme; dev hesaplar önce kuralla ayrı |
| Bir küme adlandırılamıyor | Yapısız veri ya da k fazla | Kümeyi birleştirin; profil tablosu ve örneklerle bakın |
| Segment raporu var, kimse bir şey yapmıyor | Segment eyleme bağlanmamış | Segment → eylem → ölçüt → kontrol tablosu |
| "Kampanya %18 geri getirdi" | Kontrol grubu yok | Segment içinde rastgele kontrol |
| Segment sayısı 12, ekip 2 kişi | Fazla ince ayrım | Aynı eylemi alanları birleştirin |

## Denetim listesi

- [ ] Analiz tarihi ve pencere sabit yazıldı; iptal/iade siparişler hariç.
- [ ] R, F, M eşikleri iş anlamıyla, yuvarlak ve dönemden döneme sabit; `NTILE` eşitlik etkisi denetlendi.
- [ ] Dev hesaplar ve özel müşteri türleri kuralla ayrı segmentte.
- [ ] Kümeleme kullanıldıysa log + ölçekleme yapıldı, birkaç başlangıçla denendi, her küme profil tablosuyla adlandırıldı.
- [ ] Her segment için eylem, başarı ölçütü ve rastgele kontrol grubu yazıldı.
- [ ] Dönemler arası geçiş matrisi raporlanıyor.
- [ ] Ticari ileti onayı ve aydınlatma metni segment eylemleriyle uyumlu.

## Küçük modele yaptırırken

- **İsteme yazın:** "RFM'yi SQL'le hesapla: analiz tarihi '2026-11-01' sabit, son 365 gün, yalnız teslim edilen
  siparişler. Puanları NTILE ile değil şu eşiklerle ver: [eşik tablosu]. Segment kurallarını CASE olarak yaz.
  Önceki çeyrekle geçiş matrisini de çıkar. Her segment için eylem ve kontrol grubu önerisini ayrı tabloda yaz."
- **Modelin tipik hatası:** `date('now')` ve `NTILE(5)` kullanır; iptal edilen siparişleri sayar; kümelemeyi ham
  tutarla yapar; kümelere veriyi görmeden çekici adlar verir ("Sadık Elmaslar"); segment sayısını artırır; eylemin
  etkisini kontrol grubu olmadan ölçer.
- **Çıktıda denetleyin:** sorguda sabit tarih; eşiklerin CASE içinde yazılı olması; `durum` süzgeci; kümeleme
  kodunda log/ölçekleme; her segmentte kontrol grubu satırı.
- **Sorun:** "Bu iki segmente farklı ne yapacağız? Hiçbir şey farklı değilse neden iki segment?"

## İlgili

- [Kümeleme ve boyut indirgeme](../80-ml/kumeleme-ve-boyut-indirgeme.md) — ölçek, siluet, kararlılık
- [Birim ekonomisi ve LTV](birim-ekonomisi-ve-ltv.md) — segment başına değer · [Etki modelleme](../80-ml/etki-modelleme.md)
  — segmente eylemin gerçek etkisi
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — kohort, ilk/son olay · [Ürün ölçütleri](urun-olcutleri.md)
- [Segment ve konumlandırma](../95-urun/segment-ve-konumlandirma.md) — ürün kararındaki segment
- [Bildirim ve yeniden etkileşim](../95-urun/bildirim-ve-yeniden-etkilesim.md) — segmente ileti göndermenin sınırları
- Havuz: örnek e-ticaret verisi [`veri/ornekler/eticaret`](../../veri/ornekler/eticaret/VERI_KARTI.md)
