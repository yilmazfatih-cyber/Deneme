---
baslik: SQL sorgu yazımı
ozet: Birleştirmede satır çoğalması, LEFT JOIN'i bozan WHERE, gruplama ve HAVING, NULL'ın üç değerli mantığı ve NOT IN tuzağı, CTE, pencere işlevleri, DISTINCT yanılgıları ve tarih işlemleri; SQLite örnekleriyle.
etiketler: [sql, sqlite, sorgu, pencere-islevleri, veri-tabani]
duzey: orta
guncellik: 2026-11
---

# SQL sorgu yazımı

> Bu notu ne zaman okumalı: rapor, özet ya da liste için SQL yazarken; bir toplam beklenenden büyük ya da küçük
> çıkıyorsa; "hiç satır gelmiyor" ya da "bazı kayıtlar kayboluyor" diyorsanız; tarih aralığıyla süzerken.

## Temel fikir

- SQL hata vermeden **yanlış sonuç** döndürmeye çok yatkındır. Sorgunun çalışması doğru olduğunu göstermez; küçük
  bir veriyle elle hesaplanmış sonuçla karşılaştırın.
- Birleştirme (JOIN) satır sayısını **değiştirebilir**: bire-çok ilişkide sol satır çoğalır. Toplam (SUM, COUNT)
  çoğalmış satırlar üzerinden alınırsa şişer.
- `NULL` "bilinmiyor" demektir. `NULL` ile her karşılaştırma `NULL` (bilinmez) döner ve `WHERE` bilinmezi eler.
- `ORDER BY` yazılmayan sorgunun satır sırası **garanti değildir**; bugün doğru görünen sıra yarın değişebilir.
- Örnekler SQLite 3.53 ile çalıştırıldı; PostgreSQL farkları yanlarında yazıyor. Değerleri sorguya her zaman
  **parametreyle** (`?`, `$1`) verin, metin birleştirerek değil.

## Karar tablosu

| İstenen                                                         | Kalıp                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------- |
| İki tarafta da karşılığı olan satırlar                           | `INNER JOIN`                                                   |
| Soldakilerin hepsi, karşılık varsa yanında                       | `LEFT JOIN`; sağ tablonun koşulu `ON` içinde                    |
| Sağda karşılığı **olmayan** sol satırlar (ör. hiç sipariş vermemiş) | `NOT EXISTS (…)`                                           |
| Sağda karşılığı **olan** sol satırlar, çoğaltmadan               | `EXISTS (…)`                                                   |
| Birden çok "çok" tablodan toplam                                 | Her birini önce kendi içinde topla (CTE), sonra birleştir      |
| Grup başına en son / en büyük satır                              | `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) = 1`            |
| Birikimli toplam                                                 | `SUM(…) OVER (ORDER BY …, id ROWS UNBOUNDED PRECEDING)`        |
| Önceki / sonraki satırla fark                                    | `LAG` / `LEAD`                                                 |
| Hareketli ortalama (son 7 gün)                                   | `AVG(…) OVER (ORDER BY gun ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)` |
| Raporda satış olmayan günler de görünsün                          | Özyineli CTE ile gün dizisi + `LEFT JOIN`                      |
| Okunurluk için ara adımlar                                       | `WITH` (CTE); her adım tek iş                                   |

## Birleştirme: satır çoğalması

```sql calistir
CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri TEXT);
CREATE TABLE odeme (siparis_id INTEGER, miktar INTEGER);
CREATE TABLE kalem (siparis_id INTEGER, urun TEXT);
INSERT INTO siparis VALUES (1, 'Ayşe'), (2, 'Mehmet');
INSERT INTO odeme VALUES (1, 100), (1, 200), (2, 200);
INSERT INTO kalem VALUES (1, 'çay'), (1, 'simit'), (2, 'su');
-- YANLIŞ: iki "çok" tabloyu birlikte bağlamak satırları çarpar (2 ödeme × 2 kalem = 4 satır)
SELECT s.musteri, SUM(o.miktar) AS odenen, COUNT(k.urun) AS kalem
FROM siparis s
JOIN odeme o ON o.siparis_id = s.id
JOIN kalem k ON k.siparis_id = s.id
GROUP BY s.id
ORDER BY s.id;
-- DOĞRU: her "çok" tabloyu önce kendi içinde topla, sonra birleştir
WITH od AS (SELECT siparis_id, SUM(miktar) AS odenen FROM odeme GROUP BY siparis_id),
     ka AS (SELECT siparis_id, COUNT(*) AS kalem FROM kalem GROUP BY siparis_id)
SELECT s.musteri, COALESCE(od.odenen, 0), COALESCE(ka.kalem, 0)
FROM siparis s
LEFT JOIN od ON od.siparis_id = s.id
LEFT JOIN ka ON ka.siparis_id = s.id
ORDER BY s.id;
```

```cikti
Ayşe|600|4
Mehmet|200|1
Ayşe|300|2
Mehmet|200|1
```

Ayşe 300 ödedi; yanlış sorgu 600 diyor. Belirtisi: toplamlar "yuvarlak katlar" hâlinde şişer. Teşhis: birleştirmeden
önce ve sonra `COUNT(*)` alın; artış varsa bire-çok çoğalma vardır.

## LEFT JOIN'i bozan WHERE

```sql calistir
CREATE TABLE musteri (id INTEGER PRIMARY KEY, ad TEXT);
CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri_id INTEGER, durum TEXT);
INSERT INTO musteri VALUES (1, 'Ayşe'), (2, 'Mehmet'), (3, 'Zeynep');
INSERT INTO siparis VALUES (1, 1, 'iptal'), (2, 1, 'teslim'), (3, 2, 'iptal');
-- Amaç: HER müşteri ve teslim edilmiş sipariş sayısı
-- YANLIŞ: sağ tablonun koşulu WHERE'de → NULL satırlar elenir, LEFT JOIN iç birleştirmeye döner
SELECT m.ad, COUNT(s.id)
FROM musteri m LEFT JOIN siparis s ON s.musteri_id = m.id
WHERE s.durum = 'teslim'
GROUP BY m.id ORDER BY m.id;
-- DOĞRU: koşul ON içinde
SELECT m.ad, COUNT(s.id)
FROM musteri m LEFT JOIN siparis s ON s.musteri_id = m.id AND s.durum = 'teslim'
GROUP BY m.id ORDER BY m.id;
-- Hiç siparişi olmayanlar (anti-join)
SELECT ad FROM musteri m WHERE NOT EXISTS (SELECT 1 FROM siparis s WHERE s.musteri_id = m.id);
```

```cikti
Ayşe|1
Ayşe|1
Mehmet|0
Zeynep|0
Zeynep
```

`COUNT(*)` yerine `COUNT(s.id)` yazıldığına dikkat: `COUNT(*)` eşleşmeyen satırı da 1 sayardı.

## Gruplama ve HAVING

```sql calistir
CREATE TABLE satis (il TEXT, urun TEXT, adet INTEGER);
INSERT INTO satis VALUES ('İzmir', 'çay', 5), ('İzmir', 'simit', 2), ('Van', 'çay', 1), ('Van', 'çay', 9), ('Bursa', 'çay', 3);
-- WHERE satırları gruplamadan ÖNCE, HAVING grupları SONRA süzer
SELECT il, SUM(adet) AS cay_adedi
FROM satis
WHERE urun = 'çay'
GROUP BY il
HAVING SUM(adet) >= 5
ORDER BY cay_adedi DESC;
```

```cikti
Van|10
İzmir|5
```

SQLite, `GROUP BY`'da olmayan ve toplanmayan bir sütunu (`SELECT il, tarih, SUM(adet) … GROUP BY il`) hata vermeden
kabul eder ve gruptaki **herhangi bir** satırdan değer getirir. PostgreSQL bunu reddeder. Böyle bir sütun
gerekiyorsa grup başına satır seçimini pencere işleviyle yapın (aşağıda).

## NULL ve üç değerli mantık

```sql calistir
CREATE TABLE kisi (ad TEXT, telefon TEXT, sehir TEXT);
INSERT INTO kisi VALUES ('Ali', NULL, 'Van'), ('Ayşe', '555', NULL), ('Can', '444', 'İzmir');
SELECT COUNT(*), COUNT(telefon), COUNT(sehir) FROM kisi;
-- "Van dışındakiler": NULL <> 'Van' BİLİNMEZ döner, Ayşe gelmez
SELECT ad FROM kisi WHERE sehir <> 'Van';
-- NULL'ı da sayan karşılaştırma (SQLite: IS NOT; standart: IS DISTINCT FROM)
SELECT ad FROM kisi WHERE sehir IS NOT 'Van' ORDER BY ad;
```

```cikti
3|2|2
Can
Ayşe
Can
```

En pahalı NULL tuzağı `NOT IN`'dir:

```sql calistir
CREATE TABLE kisi (ad TEXT, telefon TEXT);
CREATE TABLE engelli (telefon TEXT);
INSERT INTO kisi VALUES ('Ali', NULL), ('Ayşe', '555'), ('Can', '444');
INSERT INTO engelli VALUES ('444'), (NULL);
-- YANLIŞ: alt sorguda tek bir NULL varsa NOT IN HİÇBİR satır döndürmez
SELECT 'NOT IN', COUNT(*) FROM kisi WHERE telefon NOT IN (SELECT telefon FROM engelli);
-- DOĞRU: NOT EXISTS
SELECT ad FROM kisi k
WHERE NOT EXISTS (SELECT 1 FROM engelli e WHERE e.telefon = k.telefon)
ORDER BY ad;
-- Toplama işlevleri NULL'ı atlar: ortalama (10 + 20) / 2, üçe bölünmez
SELECT AVG(x), SUM(x), COUNT(x), COUNT(*) FROM (SELECT 10 AS x UNION ALL SELECT NULL UNION ALL SELECT 20);
-- Hiç satır yoksa ya da hepsi NULL ise SUM NULL döner, 0 değil
SELECT SUM(x), COALESCE(SUM(x), 0) FROM (SELECT NULL AS x);
```

```cikti
NOT IN|0
Ali
Ayşe
15.0|30|2|3
|0
```

| İfade                    | Sonuç   | Not                                              |
| ------------------------ | ------- | ------------------------------------------------ |
| `NULL = NULL`            | `NULL`  | Eşitlik için `IS` / `IS NOT DISTINCT FROM`        |
| `1 + NULL`, `'a' \|\| NULL` | `NULL`  | Bir NULL bütün ifadeyi NULL yapar; `COALESCE`     |
| `COUNT(*)` / `COUNT(sütun)` | tüm satırlar / NULL olmayanlar | Hangisini istediğinizi seçin  |
| `AVG(sütun)`             | NULL'sız ortalama       | Eksik değeri 0 saymak istiyorsanız `AVG(COALESCE(x, 0))` |

## Alt sorgu ve CTE

Alt sorgu ile CTE (`WITH`) çoğu zaman aynı işi görür; CTE adımları adlandırdığı için okunur ve sınanır. Özyineli
CTE, raporlarda boş günleri doldurmanın standart yoludur:

```sql calistir
CREATE TABLE satis (tarih TEXT, tutar INTEGER);
INSERT INTO satis VALUES ('2026-11-01', 100), ('2026-11-01', 50), ('2026-11-03', 70);
-- Satış olmayan günler de raporda 0 ile görünsün
WITH RECURSIVE gunler(gun) AS (
  SELECT '2026-11-01'
  UNION ALL
  SELECT date(gun, '+1 day') FROM gunler WHERE gun < '2026-11-04'
)
SELECT g.gun, COALESCE(SUM(s.tutar), 0) AS ciro
FROM gunler g LEFT JOIN satis s ON s.tarih = g.gun
GROUP BY g.gun
ORDER BY g.gun;
```

```cikti
2026-11-01|150
2026-11-02|0
2026-11-03|70
2026-11-04|0
```

PostgreSQL'de aynı iş `generate_series('2026-11-01'::date, '2026-11-04', interval '1 day')` ile yapılır.

## Pencere işlevleri

Pencere işlevi satırları **gruplamadan** her satırın yanına bir hesap ekler. `WHERE` içinde kullanılamaz; süzmek
için önce CTE ya da alt sorguda hesaplayın.

```sql calistir
CREATE TABLE siparis (musteri TEXT, tarih TEXT, tutar INTEGER);
INSERT INTO siparis VALUES ('Ayşe', '2026-11-01', 120), ('Ayşe', '2026-11-09', 80), ('Can', '2026-11-03', 200), ('Can', '2026-11-07', 50), ('Can', '2026-11-08', 60);
-- Her müşterinin SON siparişi
WITH sirali AS (
  SELECT musteri, tarih, tutar,
         ROW_NUMBER() OVER (PARTITION BY musteri ORDER BY tarih DESC) AS sira
  FROM siparis
)
SELECT musteri, tarih, tutar FROM sirali WHERE sira = 1 ORDER BY musteri;
-- Bir önceki siparişe göre değişim (ilk siparişte önceki yok: NULL)
SELECT musteri, tarih, tutar - LAG(tutar) OVER (PARTITION BY musteri ORDER BY tarih) AS fark
FROM siparis
ORDER BY musteri, tarih;
```

```cikti
Ayşe|2026-11-09|80
Can|2026-11-08|60
Ayşe|2026-11-01|
Ayşe|2026-11-09|-40
Can|2026-11-03|
Can|2026-11-07|-150
Can|2026-11-08|10
```

Birikimli toplamın gizli tuzağı varsayılan **çerçevedir** (frame): `ORDER BY` varsa varsayılan `RANGE`'dir ve sıralama
değeri eşit satırlar aynı toplamı alır.

```sql calistir
CREATE TABLE satis (id INTEGER PRIMARY KEY, gun TEXT, tutar INTEGER);
INSERT INTO satis (gun, tutar) VALUES ('2026-11-01', 100), ('2026-11-02', 100), ('2026-11-02', 50), ('2026-11-03', 70);
SELECT gun, tutar,
       SUM(tutar) OVER (ORDER BY gun) AS varsayilan,
       SUM(tutar) OVER (ORDER BY gun, id ROWS UNBOUNDED PRECEDING) AS satir_satir
FROM satis
ORDER BY gun, id;
-- Eşitlikte: RANK boşluk bırakır (1, 1, 3), DENSE_RANK bırakmaz (1, 1, 2)
SELECT tutar, RANK() OVER w, DENSE_RANK() OVER w
FROM satis WINDOW w AS (ORDER BY tutar DESC)
ORDER BY tutar DESC, gun;
```

```cikti
2026-11-01|100|100|100
2026-11-02|100|250|200
2026-11-02|50|250|250
2026-11-03|70|320|320
100|1|1
100|1|1
70|3|2
50|4|3
```

Kural: birikimli toplamda `ORDER BY`'a eşsiz bir sütun (`id`) ekleyin ve `ROWS` çerçevesini açıkça yazın.

## DISTINCT yanılgıları

```sql calistir
CREATE TABLE siparis (id INTEGER PRIMARY KEY, musteri TEXT, tutar INTEGER);
INSERT INTO siparis VALUES (1, 'Ayşe', 100), (2, 'Ayşe', 100), (3, 'Can', 50);
-- DISTINCT bütün SATIRA uygulanır, tek sütuna değil
SELECT DISTINCT musteri, tutar FROM siparis ORDER BY musteri;
-- YANLIŞ: SUM(DISTINCT) aynı tutarlı iki AYRI siparişi bir kez sayar
SELECT SUM(DISTINCT tutar), SUM(tutar) FROM siparis;
SELECT COUNT(DISTINCT musteri) FROM siparis;
```

```cikti
Ayşe|100
Can|50
150|250
2
```

`SELECT DISTINCT` çoğu zaman yanlış bir birleştirmenin çoğalttığı satırları **gizlemek** için yazılır. Çoğalma
görürseniz `DISTINCT` eklemeyin; birleştirmeyi düzeltin.

## Tarih ve sayı işlemleri

```sql calistir
CREATE TABLE olay (ad TEXT, zaman TEXT);
INSERT INTO olay VALUES ('a', '2026-11-30 10:00:00'), ('b', '2026-11-01 00:00:00'), ('c', '2026-12-01 00:00:00');
-- YANLIŞ: BETWEEN '…-30' son günün 00:00'ından sonrasını kaçırır
SELECT COUNT(*) FROM olay WHERE zaman BETWEEN '2026-11-01' AND '2026-11-30';
-- DOĞRU: yarı açık aralık [ayın başı, sonraki ayın başı)
SELECT COUNT(*) FROM olay WHERE zaman >= '2026-11-01' AND zaman < '2026-12-01';
-- Metin karşılaştırması yalnız sıfırla doldurulmuş ISO biçimde doğrudur
SELECT '2026-11-16' < '2026-9-1', '01.12.2026' < '16.11.2025';
-- Ay ekleme taşar: 31 Ocak + 1 ay = 3 Mart
SELECT date('2026-01-31', '+1 month');
-- Tamsayı bölme: yüzde hesabında 100.0 ile başlayın
SELECT 5 / 2, 5 / 2.0, 100 * 1 / 3, ROUND(100.0 * 1 / 3, 1);
```

```cikti
1
2
1|1
2026-03-03
2|2.5|33|33.3
```

- SQLite'ta tarih türü yoktur; zamanı **UTC** ve ISO 8601 metni (`2026-11-16 07:00:00` ya da `…T07:00:00Z`) olarak
  saklayın. `16.11.2026` biçimi sıralanamaz ve karşılaştırılamaz.
- `date('now')` UTC'dir. "Bugün" Türkiye saatine göre isteniyorsa sınırı uygulamada hesaplayıp parametre verin.
- Aylık gruplama: `strftime('%Y-%m', zaman)`; PostgreSQL'de `date_trunc('month', zaman)`.
- PostgreSQL'de de `5 / 2 = 2`'dir (tamsayı bölme).

## Tuzaklar

| Belirti                                                      | Neden                                                  | Çözüm                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------ | --------------------------------------------------------- |
| Toplam 2–3 kat şişmiş                                         | Bire-çok birleştirmede satır çoğalması                  | Önce kendi içinde topla (CTE), sonra birleştir             |
| LEFT JOIN'e rağmen bazı kayıtlar listede yok                  | Sağ tablonun koşulu `WHERE`'de                         | Koşulu `ON`'a taşıyın                                      |
| Karşılığı olmayanlar için `COUNT` 1 çıkıyor                    | `COUNT(*)` NULL satırı da sayar                        | `COUNT(sag_tablo.id)`                                      |
| `NOT IN` sorgusu hiç satır döndürmüyor                        | Alt sorguda NULL var                                    | `NOT EXISTS`                                               |
| "X olmayanlar" listesinde boş alanlılar yok                    | `<>` NULL ile bilinmez döner                            | `IS NOT` / `IS DISTINCT FROM` ya da `OR sutun IS NULL`     |
| Rapor toplamı boşken NULL, uygulama çöküyor                   | `SUM` satır yokken NULL döner                           | `COALESCE(SUM(x), 0)`                                      |
| Grup sorgusu SQLite'ta çalışıyor, PostgreSQL'de hata          | Gruplanmamış çıplak sütun                               | Sütunu gruba ekleyin ya da pencere işleviyle seçin         |
| Birikimli toplamda aynı güne ait satırlar aynı değeri alıyor    | Varsayılan `RANGE` çerçevesi                            | `ORDER BY …, id ROWS UNBOUNDED PRECEDING`                  |
| `WHERE ROW_NUMBER() …` hata veriyor                            | Pencere işlevi `WHERE`'de kullanılamaz                  | CTE'de hesaplayıp dışarıda süzün                           |
| `SUM(DISTINCT …)` eksik topluyor                              | Eşit tutarlı ayrı kayıtlar bir sayılır                  | Çoğalmayı düzeltin, düz `SUM`                              |
| Ayın son günü rapora girmiyor                                 | `BETWEEN` üst sınırı günün başı                          | Yarı açık aralık `>= başlangıç AND < sonraki`              |
| Tarihe göre sıralama karışık                                  | Tarih `GG.AA.YYYY` ya da sıfırsız metin                  | ISO 8601, sıfırla doldurulmuş                              |
| Yüzde hep 0 ya da tam sayı çıkıyor                            | Tamsayı bölme                                           | `100.0 * a / b`                                            |
| Sıralama bazen değişiyor, sayfalarda kayıt tekrar ediyor        | `ORDER BY` yok ya da eşsiz değil                         | Eşsiz sütunla biten `ORDER BY`                             |

## Denetim listesi

- [ ] Sorgu, sonucu elle hesaplanmış 5–10 satırlık bir veriyle sınandı.
- [ ] Her birleştirmeden sonra satır sayısı beklenenle aynı (`COUNT(*)` önce/sonra).
- [ ] Birden çok "çok" tablodan gelen toplamlar önce kendi içinde toplanmış.
- [ ] `LEFT JOIN`'de sağ tablonun koşulları `ON` içinde.
- [ ] `NOT IN (SELECT …)` yok; yerine `NOT EXISTS`.
- [ ] NULL olabilecek her sütunun karşılaştırması ve toplamı bilinçli (`COALESCE`, `IS NOT`).
- [ ] Her listeleme sorgusunda eşsiz bir sütunla biten `ORDER BY` var.
- [ ] Tarih süzgeçleri yarı açık aralık; zamanlar UTC ISO metni.
- [ ] Değerler parametreyle veriliyor; sorguda metin birleştirme yok.

## Küçük modele yaptırırken

- **İsteme yazın:** tablo şemasını (`CREATE TABLE`), 5–10 örnek satırı (`INSERT`) ve **beklenen çıktıyı** verin;
  "sorguyu yaz ve bu veriyle çalıştırıp çıktının beklenenle aynı olduğunu göster" deyin. Hangi veritabanı (SQLite
  mı PostgreSQL mi) olduğunu açıkça yazın.
- **Modelin tipik hatası:** iki bire-çok tabloyu birlikte birleştirip toplar; `LEFT JOIN` sonrası `WHERE` ile sağ
  tabloyu süzer; `NOT IN` kullanır; `BETWEEN` ile ay süzer; `ORDER BY` unutur; çoğalmayı `DISTINCT` ile örter;
  PostgreSQL işlevini (`date_trunc`, `ILIKE`) SQLite'ta kullanır.
- **Çıktıda arayın:** `NOT IN (SELECT`, `BETWEEN`, `DISTINCT`, `LEFT JOIN` + `WHERE sag.`, `ORDER BY` eksikliği,
  `f"…{` ya da `+` ile kurulmuş sorgu metni.
- **Doğrulama:** Sonucu bir de farklı yoldan (ör. Python'da küçük döngüyle) hesaplatıp karşılaştırın.

## İlgili

- [SQL performans ve işlem](sql-performans-ve-islem.md): dizin, sorgu planı, sayfalama, işlem ve yalıtım
- [Veri biçimleri](veri-bicimleri.md): tarih/saat biçimi ve saat dilimi
- [Python tuzakları](python-tuzaklar.md): Python'dan SQLite kullanırken
- Türkçe arama için katlanmış sütun: [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md)
- [Analitik SQL kalıpları](../70-veri/analitik-sql-kaliplari.md): kohort, huni, tutma, oturumlama
