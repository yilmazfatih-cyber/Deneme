---
baslik: Analitik SQL kalıpları
ozet: Kohort tablosu, sıralı huni, tutma eğrisi, boşluğa göre oturumlama, hareketli ortalama, yüzdelik, ilk/son olay ve tekilleştirme; çalışan SQLite örnekleri ve beklenen çıktılarıyla.
etiketler: [sql, analitik, kohort, huni, pencere-islevi, sqlite]
duzey: orta
guncellik: 2026-11
---

# Analitik SQL kalıpları

> Bu notu ne zaman okumalı: olay tablosundan kohort, huni, tutma, oturum, hareketli ortalama ya da yüzdelik
> hesaplayan bir sorgu yazarken ya da modele yazdırırken; sonuç "biraz tuhaf" göründüğünde.

## Temel fikir

Analitik soruların çoğu sekiz kalıbın birleşimidir. Her kalıbın bir "makul görünen ama yanlış" sürümü vardır ve
yanlış sürüm hata vermez, yalnız sayı yanlış çıkar. Aşağıdaki her blok bellek içi SQLite'ta çalışır; altındaki
çıktı gerçek çıktıdır. Ortak kurallar:

- Zaman metinleri tek biçimde (`YYYY-MM-DD HH:MM:SS`); aralıklar yarı açık: `>= başlangıç AND < bitiş`.
- Oranda en az bir taraf ondalık olsun: `100.0 * a / b`. SQLite'ta `100 * 1 / 3` = 33, `1 / 2` = 0 (DuckDB'de
  farklıdır; lehçe tablosu: [araç seçimi](arac-secimi.md)).
- Eşik karşılaştırmasında saniye tam sayısı kullanın (`strftime('%s', t)`); `julianday` farkı kayan noktalıdır.
- Henüz gözlenemeyen hücre **boş** (NULL) kalır, sıfır yazılmaz.

## Karar tablosu

| Soru | Kalıp | Yanlış kestirme |
| --- | --- | --- |
| Hangi ay gelenler daha iyi tutuluyor? | Kohort tablosu | Aylık etkin kullanıcıyı ay ay karşılaştırmak |
| Kullanıcılar hangi adımda dökülüyor? | Sıralı huni (adım zamanı bir öncekinden sonra) | Her olayın tekil kullanıcısını ayrı saymak |
| Kayıttan N gün sonra kaçı geri geliyor? | Tutma eğrisi + olgunluk | Paydaya henüz N. gününe varmamışları katmak |
| Bir ziyaret ne kadar sürüyor? | Boşluğa göre oturumlama | Takvim gününe göre gruplamak |
| Gürültülü günlük seride eğilim | Takvim omurgalı hareketli ortalama | Var olan satırlar üzerinde `ROWS` çerçevesi |
| Tipik ve en kötü yanıt süresi | Yüzdelik (p50, p90, p99) | Ortalama |
| İlk/son kanal, ilk sipariş | `ROW_NUMBER()` + eşitlik bozan sütun | `MIN(zaman)` yanında çıplak sütun |
| Aynı kayıt birden çok kez yüklenmiş | Anahtar başına son sürüm | `DISTINCT` |

## 1. Kohort tablosu

Satır: kayıt ayı (kohort). Sütun: kayıttan sonra geçen ay. Hücre: o ay etkin olanların kohorta oranı.

```sql calistir
CREATE TABLE uye (uye_id TEXT, kayit_ayi TEXT);
CREATE TABLE etkin_ay (uye_id TEXT, ay TEXT);
INSERT INTO uye VALUES ('u1', '2026-01'), ('u2', '2026-01'), ('u3', '2026-01'), ('u4', '2026-01'),
  ('u5', '2026-02'), ('u6', '2026-02'), ('u7', '2026-02'), ('u9', '2026-02'), ('u8', '2026-03');
INSERT INTO etkin_ay VALUES ('u1', '2026-01'), ('u1', '2026-02'), ('u1', '2026-03'), ('u2', '2026-01'),
  ('u2', '2026-03'), ('u3', '2026-01'), ('u4', '2026-01'), ('u4', '2026-02'), ('u5', '2026-02'),
  ('u5', '2026-03'), ('u6', '2026-02'), ('u7', '2026-02'), ('u7', '2026-03'), ('u8', '2026-03');
-- Ay numarası = yıl * 12 + ay. Son veri ayı: 2026-03. u9 hiç etkin olmadı.
WITH ayno AS (
  SELECT uye_id, kayit_ayi, CAST(substr(kayit_ayi, 1, 4) AS INTEGER) * 12 + CAST(substr(kayit_ayi, 6, 2) AS INTEGER) AS k
  FROM uye
), hucre AS (
  SELECT a.kayit_ayi, CAST(substr(e.ay, 1, 4) AS INTEGER) * 12 + CAST(substr(e.ay, 6, 2) AS INTEGER) - a.k AS fark,
         COUNT(DISTINCT e.uye_id) AS etkin
  FROM ayno a JOIN etkin_ay e USING (uye_id) GROUP BY 1, 2
), boyut AS (  -- payda üye tablosundan: hiç etkin olmayan da sayılır
  SELECT kayit_ayi, COUNT(*) AS uye, (2026 * 12 + 3) - MIN(k) AS gozlenen FROM ayno GROUP BY kayit_ayi
)
SELECT b.kayit_ayi AS kohort, b.uye,
  round(100.0 * COALESCE((SELECT etkin FROM hucre h WHERE h.kayit_ayi = b.kayit_ayi AND fark = 0), 0) / b.uye) AS ay0,
  CASE WHEN b.gozlenen >= 1 THEN
    round(100.0 * COALESCE((SELECT etkin FROM hucre h WHERE h.kayit_ayi = b.kayit_ayi AND fark = 1), 0) / b.uye) END AS ay1,
  CASE WHEN b.gozlenen >= 2 THEN
    round(100.0 * COALESCE((SELECT etkin FROM hucre h WHERE h.kayit_ayi = b.kayit_ayi AND fark = 2), 0) / b.uye) END AS ay2
FROM boyut b ORDER BY b.kayit_ayi;
-- YANLIŞ payda: birleştirilmiş tablodan sayınca hiç etkin olmayan üye kohorttan düşer
SELECT 'Şubat kohortu, birleştirilmiş paydayla', COUNT(DISTINCT uye_id) FROM uye JOIN etkin_ay USING (uye_id)
WHERE kayit_ayi = '2026-02';
```

```cikti
2026-01|4|100.0|50.0|50.0
2026-02|4|75.0|50.0|
2026-03|1|100.0||
Şubat kohortu, birleştirilmiş paydayla|3
```

Okuma: köşegenler aynı takvim ayıdır (Mart, üç kohortun da son sütunu). Boş hücreler "henüz gözlenmedi"dir;
sıfır yazılırsa son kohortlar çökmüş gibi görünür. Kohort büyüklüğü üye tablosundan gelir: payda birleştirilmiş
tablodan alınırsa hiç etkin olmamış üyeler (u9) kaybolur ve oranlar şişer. Kohortu kayıt ayına göre değil ilk
çekirdek eyleme göre de kurabilirsiniz; hangisi olduğunu başlığa yazın.

## 2. Sıralı huni

Her olayın tekil kullanıcı sayısını ayrı saymak huni (funnel) değildir: sırayı ve "önce bunu yaptı mı?" koşulunu bilmez.

```sql calistir
CREATE TABLE olay (kullanici_id TEXT, olay TEXT, zaman TEXT);
INSERT INTO olay VALUES
  ('k1', 'urun_goruntuleme', '2026-11-05 10:00:00'), ('k1', 'sepete_ekle', '2026-11-05 10:05:00'),
  ('k1', 'odeme_baslat', '2026-11-05 10:07:00'), ('k1', 'satin_al', '2026-11-05 10:09:00'),
  ('k2', 'urun_goruntuleme', '2026-11-05 11:00:00'), ('k2', 'sepete_ekle', '2026-11-05 11:02:00'),
  ('k3', 'urun_goruntuleme', '2026-11-05 12:00:00'),
  ('k4', 'sepete_ekle', '2026-11-05 09:00:00'), ('k4', 'urun_goruntuleme', '2026-11-05 09:10:00'),
  ('k4', 'odeme_baslat', '2026-11-05 09:20:00'), ('k4', 'satin_al', '2026-11-05 09:25:00'),
  ('k5', 'satin_al', '2026-11-05 13:00:00');
-- YANLIŞ: olay başına tekil kullanıcı (satın alan, ödemeye başlayandan fazla çıkıyor)
SELECT 'sırasız', olay, COUNT(DISTINCT kullanici_id) FROM olay GROUP BY olay
ORDER BY CASE olay WHEN 'urun_goruntuleme' THEN 1 WHEN 'sepete_ekle' THEN 2 WHEN 'odeme_baslat' THEN 3 ELSE 4 END;
-- DOĞRU: her adım, bir önceki adımdan SONRA olmalı
WITH a1 AS (SELECT kullanici_id, MIN(zaman) AS t FROM olay WHERE olay = 'urun_goruntuleme' GROUP BY kullanici_id),
a2 AS (SELECT o.kullanici_id, MIN(o.zaman) AS t FROM olay o JOIN a1 USING (kullanici_id)
       WHERE o.olay = 'sepete_ekle' AND o.zaman >= a1.t GROUP BY o.kullanici_id),
a3 AS (SELECT o.kullanici_id, MIN(o.zaman) AS t FROM olay o JOIN a2 USING (kullanici_id)
       WHERE o.olay = 'odeme_baslat' AND o.zaman >= a2.t GROUP BY o.kullanici_id),
a4 AS (SELECT o.kullanici_id, MIN(o.zaman) AS t FROM olay o JOIN a3 USING (kullanici_id)
       WHERE o.olay = 'satin_al' AND o.zaman >= a3.t GROUP BY o.kullanici_id),
adim(no, ad, n) AS (SELECT 1, 'urun_goruntuleme', COUNT(*) FROM a1 UNION ALL SELECT 2, 'sepete_ekle', COUNT(*) FROM a2
  UNION ALL SELECT 3, 'odeme_baslat', COUNT(*) FROM a3 UNION ALL SELECT 4, 'satin_al', COUNT(*) FROM a4)
SELECT 'sıralı', ad, n, round(100.0 * n / LAG(n) OVER (ORDER BY no)) AS onceki_adima_gore,
       round(100.0 * n / FIRST_VALUE(n) OVER (ORDER BY no)) AS ilk_adima_gore
FROM adim ORDER BY no;
```

```cikti
sırasız|urun_goruntuleme|4
sırasız|sepete_ekle|3
sırasız|odeme_baslat|2
sırasız|satin_al|3
sıralı|urun_goruntuleme|4||100.0
sıralı|sepete_ekle|2|50.0|50.0
sıralı|odeme_baslat|1|50.0|25.0
sıralı|satin_al|1|100.0|25.0
```

Sırasız sayımda satın alan (3) ödemeye başlayandan (2) fazla: k5 önceki adımların hiçbirinde görünmüyor (başka
kanaldan gelmiş), k4 ürünü görüntülemeden önce sepete eklemiş (ör. eski bir sepetten). Gerçek işte her adıma bir de
**pencere** koyun (ör. ilk adımdan sonraki 1 gün: `AND o.zaman < datetime(a1.t, '+1 day')`) ve huninin oturum mu
kullanıcı mı düzeyinde olduğunu yazın. Sınanmış DuckDB sürümü (oturum düzeyinde, sırasız):
[`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md) 14. tarif.

## 3. Tutma eğrisi

N. gün tutma (retention) = kaydın N. gününde etkin olanlar / **N. gününe ulaşmış** üyeler. Son veri günü 15 Kasım.

```sql calistir
CREATE TABLE uye (uye TEXT, kayit TEXT);
CREATE TABLE etkin (uye TEXT, gun TEXT);
INSERT INTO uye VALUES ('v1', '2026-11-01'), ('v2', '2026-11-01'), ('v3', '2026-11-02'),
  ('v4', '2026-11-05'), ('v5', '2026-11-10'), ('v6', '2026-11-12');
INSERT INTO etkin VALUES ('v1', '2026-11-02'), ('v1', '2026-11-08'), ('v2', '2026-11-03'), ('v2', '2026-11-12'),
  ('v3', '2026-11-03'), ('v3', '2026-11-09'), ('v4', '2026-11-08'), ('v5', '2026-11-11'), ('v6', '2026-11-13');
WITH n(gun) AS (VALUES (1), (3), (7)),
bayrak AS (
  SELECT n.gun,
         date(u.kayit, '+' || n.gun || ' days') <= '2026-11-15' AS olgun,
         EXISTS (SELECT 1 FROM etkin e WHERE e.uye = u.uye AND e.gun = date(u.kayit, '+' || n.gun || ' days')) AS tam,
         EXISTS (SELECT 1 FROM etkin e WHERE e.uye = u.uye AND e.gun >= date(u.kayit, '+' || n.gun || ' days')) AS sonra
  FROM uye u CROSS JOIN n
)
SELECT gun AS N, SUM(olgun) AS olgun_uye,
       round(100.0 * SUM(olgun AND tam) / SUM(olgun)) AS klasik,
       round(100.0 * SUM(olgun AND sonra) / SUM(olgun)) AS sinirsiz,
       round(100.0 * SUM(tam) / COUNT(*)) AS yanlis_payda
FROM bayrak GROUP BY gun ORDER BY gun;
```

```cikti
1|6|67.0|100.0|67.0
3|6|17.0|67.0|17.0
7|4|50.0|75.0|33.0
```

`yanlis_payda` 7. günde %33 diyor; doğrusu %50, çünkü altı üyeden yalnız dördü 7. gününe ulaştı. Klasik tutma
"tam o gün", sınırsız tutma "o gün ya da sonra" der; eğrinin başlığına hangisi olduğunu yazın
([ürün ölçütleri](urun-olcutleri.md)).

## 4. Boşluğa göre oturumlama

Oturumlama (sessionization): aynı kullanıcının iki olayı arasında 30 dakikadan uzun boşluk varsa yeni oturum başlar.
Sıra: boşluğu hesapla → yeni oturum işaretle → işaretlerin birikimli toplamı oturum numarasıdır.

```sql calistir
CREATE TABLE olay (kullanici_id TEXT, zaman TEXT);
INSERT INTO olay VALUES ('k1', '2026-11-05 09:00:00'), ('k1', '2026-11-05 09:10:00'), ('k1', '2026-11-05 09:35:00'),
  ('k1', '2026-11-05 10:06:00'), ('k1', '2026-11-05 10:20:00'), ('k1', '2026-11-05 14:00:00'),
  ('k2', '2026-11-05 13:15:00'), ('k2', '2026-11-05 13:45:00');
-- Tuzak: julianday farkı kayan noktalıdır; tam 30 dakika bazen 30'dan büyük, bazen küçük çıkar
SELECT 'julianday', (julianday('2026-11-05 09:30:00') - julianday('2026-11-05 09:00:00')) * 1440 > 30,
       (julianday('2026-11-05 13:45:00') - julianday('2026-11-05 13:15:00')) * 1440 > 30;
WITH bosluk AS (
  SELECT kullanici_id, zaman,
         strftime('%s', zaman) - strftime('%s', LAG(zaman) OVER (PARTITION BY kullanici_id ORDER BY zaman)) AS sn
  FROM olay
), numarali AS (
  SELECT *, SUM(CASE WHEN sn IS NULL OR sn > 1800 THEN 1 ELSE 0 END)
              OVER (PARTITION BY kullanici_id ORDER BY zaman ROWS UNBOUNDED PRECEDING) AS oturum
  FROM bosluk
)
SELECT kullanici_id, oturum, substr(MIN(zaman), 12, 5) AS bas, substr(MAX(zaman), 12, 5) AS son, COUNT(*) AS olay,
       (strftime('%s', MAX(zaman)) - strftime('%s', MIN(zaman))) / 60 AS sure_dk
FROM numarali GROUP BY kullanici_id, oturum ORDER BY kullanici_id, oturum;
```

```cikti
julianday|1|0
k1|1|09:00|09:35|3|35
k1|2|10:06|10:20|2|14
k1|3|14:00|14:00|1|0
k2|1|13:15|13:45|2|30
```

Tek olaylı oturumun süresi 0'dır (son olaydan sonra ne kadar kaldığını bilemezsiniz); ortalama oturum süresini
raporlarken bunu söyleyin ya da ortanca kullanın. 30 dakika bir gelenektir, yasa değil: eşiği boşluk dağılımına
bakarak seçin ve yazın. Gece yarısını aşan oturum tek oturumdur; takvim gününe göre bölmeyin.

## 5. Hareketli ortalama

Hareketli ortalamada (moving average) `ROWS BETWEEN 2 PRECEDING` "son üç satır" demektir, "son üç gün" değil. Eksik
gün varsa pencere genişler.

```sql calistir
CREATE TABLE satis (gun TEXT, adet INTEGER);
INSERT INTO satis VALUES ('2026-11-01', 10), ('2026-11-02', 20), ('2026-11-04', 30), ('2026-11-05', 40);
-- YANLIŞ: "son üç satır" (3 Kasım yok; 4 Kasım'ın penceresi 1, 2 ve 4 Kasım olur)
SELECT 'satırla', gun, round(AVG(adet) OVER (ORDER BY gun ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2)
FROM satis ORDER BY gun;
-- DOĞRU: takvim omurgası + eksik gün 0 + dolmamış pencere boş
WITH RECURSIVE takvim(gun) AS (
  SELECT '2026-11-01' UNION ALL SELECT date(gun, '+1 day') FROM takvim WHERE gun < '2026-11-05'
), tam AS (
  SELECT t.gun, COALESCE(s.adet, 0) AS adet FROM takvim t LEFT JOIN satis s USING (gun)
)
SELECT 'takvimle', gun, CASE WHEN COUNT(*) OVER w = 3 THEN round(AVG(adet) OVER w, 2) END
FROM tam WINDOW w AS (ORDER BY gun ROWS BETWEEN 2 PRECEDING AND CURRENT ROW) ORDER BY gun;
```

```cikti
satırla|2026-11-01|10.0
satırla|2026-11-02|15.0
satırla|2026-11-04|20.0
satırla|2026-11-05|30.0
takvimle|2026-11-01|
takvimle|2026-11-02|
takvimle|2026-11-03|10.0
takvimle|2026-11-04|16.67
takvimle|2026-11-05|23.33
```

3 Kasım'da satış yoktu. 4 Kasım için takvimli ortalama 3 Kasım'ı 0 sayar (16,67); satır temelli olan 1, 2 ve
4 Kasım'ı tek pencereye katar (20). İlk iki günde pencere dolmadığı için değer boş bırakıldı; doldurursanız ilk
değerler daha az günün ortalaması olur ve serinin geri kalanıyla karşılaştırılamaz. Eksik gün "satış yok" değil
"ölçüm yok" ise sıfır yazmayın; `NULL` bırakın (`AVG` onu atlar) ve grafikte boşluk gösterin. Panolarda ve
tahminde geriye bakan (trailing) pencere kullanın; ortalanmış pencere geleceği görür.

## 6. Yüzdelik

Yüzdelik (percentile) için taşınabilir yol `ROW_NUMBER()` ile sıralayıp sıra numarasından okumaktır. İki yaygın tanım
farklı sonuç verir:

```sql calistir
CREATE TABLE istek (sure_ms INTEGER);
INSERT INTO istek VALUES (120), (85), (300), (95), (110), (2500), (130), (105), (90), (140);
WITH s AS (SELECT sure_ms, ROW_NUMBER() OVER (ORDER BY sure_ms) AS r, COUNT(*) OVER () AS n FROM istek),
q(p) AS (VALUES (0.5), (0.9))
SELECT 'p' || CAST(p * 100 AS INTEGER) AS yuzdelik,
  (SELECT sure_ms FROM s WHERE r >= p * n ORDER BY r LIMIT 1) AS en_yakin_sira,
  (SELECT round(a.sure_ms + (1 + p * (a.n - 1) - a.r) * (COALESCE(b.sure_ms, a.sure_ms) - a.sure_ms), 1)
   FROM s a LEFT JOIN s b ON b.r = a.r + 1 WHERE a.r = CAST(1 + p * (a.n - 1) AS INTEGER)) AS dogrusal
FROM q;
SELECT 'ortalama', AVG(sure_ms) FROM istek;
```

```cikti
p50|110|115.0
p90|300|520.0
ortalama|367.5
```

"En yakın sıra" (nearest rank) her zaman veride olan bir değer verir; "doğrusal ara değer" (Excel
`YÜZDEBİRLİK.DAHİL`, NumPy varsayılanı) iki değerin arasını doldurur. Az veride fark büyüktür: p90 için 300 ile
520. Panoda hangisini kullandığınızı yazın ve hep aynısını kullanın. Ortalama (367,5) on istekten dokuzunun
üstünde: gecikme, tutar, süre gibi çarpık verilerde ortalama değil yüzdelik raporlanır
([betimsel istatistik](betimsel-istatistik.md)). Bazı SQLite derlemelerinde `median()` ve `percentile()` vardır,
hepsinde yoktur; DuckDB'de `quantile_cont` ve `quantile_disc` bulunur.

## 7. İlk ve son olay

Kullanıcı başına ilk kanal (ilk dokunuş) ve satın almadan önceki son kanal:

```sql calistir
CREATE TABLE ziyaret (olay_id INTEGER, kullanici_id TEXT, zaman TEXT, kanal TEXT);
INSERT INTO ziyaret VALUES (1, 'k1', '2026-11-01 10:00:00', 'reklam'), (2, 'k1', '2026-11-03 18:00:00', 'organik'),
  (3, 'k1', '2026-11-05 20:00:00', 'eposta'), (4, 'k2', '2026-11-02 09:00:00', 'sosyal'),
  (5, 'k2', '2026-11-02 09:00:00', 'reklam');
WITH sirali AS (
  SELECT kullanici_id, kanal,
         ROW_NUMBER() OVER (PARTITION BY kullanici_id ORDER BY zaman, olay_id) AS bastan,
         ROW_NUMBER() OVER (PARTITION BY kullanici_id ORDER BY zaman DESC, olay_id DESC) AS sondan
  FROM ziyaret
)
SELECT kullanici_id, MAX(CASE WHEN bastan = 1 THEN kanal END) AS ilk_kanal,
       MAX(CASE WHEN sondan = 1 THEN kanal END) AS son_kanal
FROM sirali GROUP BY kullanici_id ORDER BY kullanici_id;
```

```cikti
k1|reklam|eposta
k2|sosyal|reklam
```

k2'nin iki olayı aynı saniyede: `ORDER BY` içine eşitliği bozan bir sütun (`olay_id`) yazılmazsa sonuç her
çalıştırmada değişebilir. SQLite `SELECT kullanici_id, MIN(zaman), kanal ... GROUP BY kullanici_id` sorgusunu
kabul eder ve kanalı en küçük zamanlı satırdan alır; ama aynı sorguda iki `MIN`/`MAX` varsa çıplak sütunun hangi
satırdan geleceği tanımsızdır ve başka veritabanları bu sorguyu hiç çalıştırmaz. `ROW_NUMBER()` kullanın.

## 8. Tekilleştirme: anahtar başına son sürüm

```sql calistir
CREATE TABLE musteri_yukleme (musteri_id INTEGER, eposta TEXT, sehir TEXT, guncelleme TEXT, yukleme_no INTEGER);
INSERT INTO musteri_yukleme VALUES
  (1, 'ayse@ornek.com', 'Ankara', '2026-01-05', 1), (1, 'ayse@ornek.com', 'İzmir', '2026-06-01', 2),
  (1, 'ayse@ornek.com', 'İzmir', '2026-06-01', 3), (2, 'Mehmet@Ornek.com ', 'Bursa', '2026-02-01', 1),
  (3, 'mehmet@ornek.com', 'Bursa', '2026-03-01', 2);
SELECT 'ham satır', COUNT(*) FROM musteri_yukleme;
SELECT 'DISTINCT * (yükleme no farklı)', COUNT(*) FROM (SELECT DISTINCT * FROM musteri_yukleme);
SELECT 'kimlik başına son sürüm', musteri_id, sehir FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY musteri_id ORDER BY guncelleme DESC, yukleme_no DESC) AS r
  FROM musteri_yukleme) WHERE r = 1 ORDER BY musteri_id;
-- E-posta makine dilidir: ASCII küçültme + boşluk kırpma doğru anahtardır
SELECT 'e-postaya göre kişi', COUNT(DISTINCT lower(trim(eposta))) FROM musteri_yukleme;
```

```cikti
ham satır|5
DISTINCT * (yükleme no farklı)|5
kimlik başına son sürüm|1|İzmir
kimlik başına son sürüm|2|Bursa
kimlik başına son sürüm|3|Bursa
e-postaya göre kişi|2
```

`DISTINCT` yalnız bütün sütunları aynı satırları atar; yükleme numarası ya da zaman damgası farklıysa hiçbir şey
yapmaz. "Son sürüm" için sıralama sütununu (güncelleme zamanı + eşitlik bozan yükleme no) açıkça yazın. 2 ve 3
numaralı müşteri büyük olasılıkla aynı kişidir; bunu birleştirmek bir iş kararıdır, sorgu kararı değil. Bulanık
eşleşme için: [`veri/verihavuzu/kalite/dedupe.py`](../../veri/verihavuzu/kalite/dedupe.py). Ad ve şehir gibi
Türkçe metni anahtar yaparken SQLite `lower()` kullanmayın ([Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)).

## Ortak SQL tuzakları

```sql calistir
SELECT 'tam sayı bölmesi', 1 / 2, 100 * 1 / 3, round(100.0 * 1 / 3, 1);
CREATE TABLE siparis (musteri_id INTEGER, zaman TEXT);
CREATE TABLE kara_liste (musteri_id INTEGER);
INSERT INTO siparis VALUES (1, '2026-11-30 14:00:00'), (2, '2026-11-15 10:00:00');
INSERT INTO kara_liste VALUES (9), (NULL);
-- NOT IN listesinde NULL varsa sonuç BOŞ döner
SELECT 'NOT IN', COUNT(*) FROM siparis WHERE musteri_id NOT IN (SELECT musteri_id FROM kara_liste);
SELECT 'NOT EXISTS', COUNT(*) FROM siparis s
WHERE NOT EXISTS (SELECT 1 FROM kara_liste k WHERE k.musteri_id = s.musteri_id);
-- BETWEEN ile ayın son günü: '2026-11-30 14:00:00' > '2026-11-30' olduğu için düşer
SELECT 'BETWEEN', COUNT(*) FROM siparis WHERE zaman BETWEEN '2026-11-01' AND '2026-11-30';
SELECT 'yarı açık', COUNT(*) FROM siparis WHERE zaman >= '2026-11-01' AND zaman < '2026-12-01';
```

```cikti
tam sayı bölmesi|0|33|33.3
NOT IN|0
NOT EXISTS|2
BETWEEN|1
yarı açık|2
```

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Oranlar 0 ya da yuvarlak tam sayı | Tam sayı bölmesi | `100.0 * a / b` |
| Hunide sonraki adım öncekinden büyük | Sırasız sayım; adımlar farklı kaynaklardan | Sıralı huni; adımları aynı kaynaktan alın |
| Son kohortlar çökmüş görünüyor | Gözlenmemiş hücrelere 0 yazıldı | Gözlenmeyen hücre NULL; olgunluk koşulu |
| N. gün tutması olması gerekenden düşük | Paydada N. gününe ulaşmamışlar var | Payda = olgun üyeler |
| 30 dakikalık eşik bazen tutuyor bazen tutmuyor | `julianday` farkı kayan noktalı | `strftime('%s', …)` ile tam saniye |
| Hareketli ortalama eksik günlerde sıçrıyor | `ROWS` çerçevesi satır sayar, gün değil | Takvim omurgası (özyinelemeli CTE) |
| İlk kanal her çalıştırmada değişiyor | Aynı zaman damgası, eşitlik bozan sütun yok | `ORDER BY zaman, olay_id` |
| `NOT IN` hiç satır döndürmüyor | Alt sorguda NULL var | `NOT EXISTS` |
| Ayın son günü raporda yok | `BETWEEN '…-01' AND '…-30'` saatli değerleri dışlar | Yarı açık aralık |
| `DISTINCT` yinelenenleri atmadı | Satırlar bir sütunda (zaman, yükleme no) farklı | `ROW_NUMBER()` ile anahtar başına son sürüm |
| p90 başka araçta farklı | Yüzdelik tanımı farklı | Tanımı yazın; tek yöntem kullanın |

## Denetim listesi

- [ ] Her oran sorgusunda en az bir ondalık işlenen var.
- [ ] Zaman aralıkları yarı açık; saat dilimi düzeltmesi uygulandı ([analitik veri modeli](analitik-veri-modeli.md)).
- [ ] Kohort ve tutma tablolarında gözlenmemiş hücreler boş; olgunluk koşulu var.
- [ ] Huni sıralı; pencere ve düzey (oturum/kullanıcı) yazılı.
- [ ] Oturum eşiği yazılı ve tam saniyeyle karşılaştırılıyor.
- [ ] Günlük seriler takvim omurgasıyla dolduruldu; eksik gün sıfır mı NULL mı kararı yazılı.
- [ ] Her `ROW_NUMBER()` sıralamasında eşitlik bozan sütun var.
- [ ] Yüzdelik yöntemi yazılı.
- [ ] Sonuç, elle sayılabilecek küçük bir örnekte doğrulandı (bu nottaki gibi).

## Küçük modele yaptırırken

- **İsteme yazın:** "SQLite sorgusu yaz. Oranlarda `100.0 *` kullan. Tarih aralıklarını `>= ve <` ile yaz.
  Huniyi sıralı kur (her adım öncekinden sonra). Günlük seride özyinelemeli takvim CTE'si kullan. Eşitlikte
  `ROW_NUMBER()` sıralamasına kimlik sütunu ekle. Sorgunun yanına, sonucu elle doğrulayabileceğim 5–10 satırlık
  bir örnek veri ve beklenen çıktıyı yaz."
- **Modelin tipik hatası:** sırasız huni; `AVG` ile olaysız günleri atlamak; `ROWS` çerçevesini gün sanmak;
  `BETWEEN` ile ay sonu; `NOT IN` + NULL; `MIN(zaman)` yanında çıplak sütun; PostgreSQL ya da DuckDB işlevini
  (`date_trunc`, `QUALIFY`, `percentile_cont ... WITHIN GROUP`) SQLite'ta kullanmak.
- **Çıktıda denetleyin:** küçük örnek veride sonucu elle sayın; `100 *` ve `BETWEEN` aratın; her pencere işlevinin
  `PARTITION BY` ve `ORDER BY`'ını okuyun.
- Hangi veritabanı için yazdığını isteme açıkça yazın; lehçeler (tarih işlevleri, yüzdelik) farklıdır.

## İlgili

- [Analitik veri modeli](analitik-veri-modeli.md) — tanecik, saat dilimi, olay tablosu
- [Ürün ölçütleri](urun-olcutleri.md) — tutma ve kayıp tanımları, olgunlaşmamış kohort
- [Betimsel istatistik](betimsel-istatistik.md) — ortalama, ortanca, yüzdelik
- [Araç seçimi](arac-secimi.md) — SQLite, DuckDB ve dataframe ne zaman
- DuckDB ile sınanmış 15 tarif (aylık ciro, huni, kayıp oranı, ortanca):
  [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md)
- [SQL sorgu yazımı](../10-diller/sql-sorgu.md) — birleştirme, NULL, CTE ve pencere işlevlerinin temeli
- [SQL performans ve işlem](../10-diller/sql-performans-ve-islem.md) — büyük tabloda dizin ve sorgu planı
