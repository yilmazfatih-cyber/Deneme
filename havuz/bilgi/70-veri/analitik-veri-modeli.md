---
baslik: Analitik veri modeli
ozet: Olay ve durum tablosu, olgu–boyut (yıldız) şeması, tanecik, saat dilimi, yavaş değişen boyut ve analiz için hangi ham verinin saklanacağı.
etiketler: [veri, analitik, veri-modeli, sql, zaman, saat-dilimi]
duzey: orta
guncellik: 2026-11
---

# Analitik veri modeli

> Bu notu ne zaman okumalı: ürün verisini analiz için tabloya dökmeden önce; "1 Mart'ta kaç premium kullanıcı
> vardı?" gibi geçmişe dönük bir soru yanıtlanamadığında; bir birleştirmeden (join) sonra toplamlar şiştiğinde;
> günlük ya da aylık sayılar iki raporda tutmadığında.

## Temel fikir

Uygulamanın veritabanı "şu an ne durumda?" sorusuna göre kurulur: her kullanıcı tek satırdır, plan değişince satır
güncellenir (**durum tablosu**). Analiz ise "ne oldu, ne zaman oldu?" diye sorar. Güncellenen satır geçmişi siler;
geçmiş silinince "geçen ay", "1 Mart'ta" ile başlayan her soru yanıtsız kalır.

Analizin asıl kaynağı bu yüzden **olay tablosudur**: her satır olmuş bir şeydir, yalnız eklenir (append-only),
hiç güncellenmez. Durum, olaylardan her an yeniden hesaplanabilir; tersi olmaz.

**Yıldız şema** (star schema) bu olayları düzenler: ortada ölçülen şeyin satırları (**olgu**, fact), çevresinde
"kim, ne, nerede, ne zaman" betimlemeleri (**boyut**, dimension). Her olgu tablosunun ilk cümlesi **tanecik**
(grain) bildirimidir: "bir satır = bir sipariş kalemi". Tanecik yazılmamışsa toplamlar sessizce şişer.

Zaman için tek kural: **anı UTC olarak sakla, raporlama gününü yerel saatten türet** (Türkiye 2016'dan beri sabit UTC+3).

## Karar tablosu

| Soru ya da durum | Seçim | Neden |
| --- | --- | --- |
| Şu an kaç premium kullanıcı var? | Durum tablosu | Tek okuma yeter |
| 1 Mart'ta kaç premium kullanıcı vardı? | Olay tablosu + "o ana kadar" (as-of) sorgu | Durum tablosu geçmişi silmiştir |
| Günlük bakiye, stok, abone sayısı eğrisi | Dönemsel anlık görüntü (periodic snapshot): her gün, her varlık için bir satır | Her gün olaylardan yeniden hesaplamak pahalı; gün sonu fotoğrafı yeter |
| Ciro, adet, süre gibi toplanabilir ölçü | Olgu tablosu, en ince anlamlı tanecikte | İnce tanecik kabaya toplanır; tersi olmaz |
| Ürünün kategorisi, müşterinin şehri değişebilir | Yavaş değişen boyut tür 2 ya da değeri olguya yazmak | Geçmiş, o günkü değerle raporlanır |
| Yalnız yazım düzeltmesi (yanlış yazılmış ad) | Tür 1: üstüne yaz | Geçmişi korumaya değmez |
| Küçük proje, tek geliştirici | Değişebilen niteliği olay anında olgu satırına kopyalamak | Tür 2 tablosu kurmadan aynı doğruluk |
| "Kullanıcılar günün hangi saatinde etkin?" | UTC sakla, yerel saati sorguda türet | Sunucu saatine göre gece yarısı kayar |

## Durum tablosu geçmişi siler

Aynı soru iki kaynaktan. Durum tablosu bugünü söyler; olay tablosu istenen anı.

```sql calistir
CREATE TABLE kullanici (kullanici_id INTEGER PRIMARY KEY, plan TEXT);
INSERT INTO kullanici VALUES (1, 'premium'), (2, 'ucretsiz'), (3, 'premium'), (4, 'premium');
CREATE TABLE plan_olayi (kullanici_id INTEGER, zaman TEXT, yeni_plan TEXT);
INSERT INTO plan_olayi VALUES
  (1, '2026-01-10T09:00:00Z', 'ucretsiz'), (1, '2026-02-20T12:00:00Z', 'premium'),
  (2, '2026-01-12T08:00:00Z', 'ucretsiz'), (2, '2026-02-01T10:00:00Z', 'premium'),
  (2, '2026-04-05T10:00:00Z', 'ucretsiz'), (3, '2026-03-15T18:00:00Z', 'premium'),
  (4, '2026-04-02T07:00:00Z', 'premium');
-- Soru: 1 Mart 2026, 00:00 Türkiye saatinde (= 28 Şubat 21:00 UTC) kaç premium vardı?
-- YANLIŞ: durum tablosu bugünün cevabını verir
SELECT 'durum tablosu', COUNT(*) FROM kullanici WHERE plan = 'premium';
-- DOĞRU: her kullanıcının o ana kadarki son olayı
SELECT 'olay tablosu', COUNT(*) FROM (
  SELECT yeni_plan, ROW_NUMBER() OVER (PARTITION BY kullanici_id ORDER BY zaman DESC) AS sira
  FROM plan_olayi WHERE zaman < '2026-02-28T21:00:00Z'
) WHERE sira = 1 AND yeni_plan = 'premium';
```

```cikti
durum tablosu|3
olay tablosu|2
```

Olay tablosu henüz yoksa değişiklikleri bugünden itibaren olay olarak yazmaya başlayın; olay geçmişi birikene kadar
her gece bir **anlık görüntü** (kullanıcı, plan, gün) de saklayın. Geçmişi geri getiremezsiniz ama bugünden
sonrasını kaybetmezsiniz.

## Tanecik: şişen toplamın nedeni

Sipariş tablosunun taneciği "bir sipariş", kalem tablosununki "bir kalem". Birleştirince her sipariş satırı kalem
sayısı kadar çoğalır (fan-out); sipariş düzeyindeki ölçü de onunla birlikte.

```sql calistir
CREATE TABLE siparis (siparis_id INTEGER, musteri TEXT, toplam INTEGER);
CREATE TABLE kalem (siparis_id INTEGER, urun TEXT, tutar INTEGER);
INSERT INTO siparis VALUES (1, 'Ayşe', 300), (2, 'Mehmet', 100);
INSERT INTO kalem VALUES (1, 'çay', 100), (1, 'fincan', 200), (2, 'kahve', 100);
-- YANLIŞ: birleştirip sipariş toplamını toplamak
SELECT 'birleştirip topla', SUM(s.toplam) FROM siparis s JOIN kalem k USING (siparis_id);
-- DOĞRU: önce kendi taneciğinde topla, sonra birleştir
WITH kalem_ozet AS (SELECT siparis_id, COUNT(*) AS kalem_sayisi FROM kalem GROUP BY siparis_id)
SELECT 'önce özetle', SUM(s.toplam), SUM(k.kalem_sayisi) FROM siparis s JOIN kalem_ozet k USING (siparis_id);
```

```cikti
birleştirip topla|700
önce özetle|400|3
```

Belirti hep aynıdır: ciro "birden" iki-üç katına çıkar ya da `COUNT(*)` beklenenden büyük gelir. Her birleştirmeden
sonra bir **mutabakat sorgusu** çalıştırın: olgu tablosunun kendi toplamı, birleştirilmiş sorgunun toplamına eşit mi?

## Yıldız şema ve kaybolan satırlar

Olgu tablosu anahtar ve sayı taşır; boyut tablosu betimleme. Boyutta karşılığı olmayan olgu (yeni ürün, silinmiş
müşteri, yazım hatalı kod) iç birleştirmede (inner join) **sessizce düşer**.

```sql calistir
CREATE TABLE urun (urun_id INTEGER PRIMARY KEY, ad TEXT, kategori TEXT);
CREATE TABLE satis (gun TEXT, urun_id INTEGER, adet INTEGER, tutar INTEGER);
INSERT INTO urun VALUES (1, 'Çay', 'İçecek'), (2, 'Simit', 'Fırın');
INSERT INTO satis VALUES ('2026-11-02', 1, 3, 90), ('2026-11-02', 2, 5, 75), ('2026-11-03', 3, 2, 60);
SELECT 'olgu toplamı', SUM(tutar) FROM satis;
-- YANLIŞ: urun_id 3 boyutta yok; satışı kayboldu
SELECT 'iç birleştirme', SUM(tutar) FROM satis JOIN urun USING (urun_id);
-- DOĞRU: dış birleştirme + "(bilinmeyen)" etiketi
SELECT COALESCE(u.kategori, '(bilinmeyen)'), SUM(s.tutar)
FROM satis s LEFT JOIN urun u USING (urun_id) GROUP BY 1 ORDER BY 1;
```

```cikti
olgu toplamı|225
iç birleştirme|165
(bilinmeyen)|60
Fırın|75
İçecek|90
```

Kalıcı çözüm: boyuta "bilinmeyen" anlamında bir satır (ör. `urun_id = -1`) ekleyip yükleme sırasında eşleşmeyen
anahtarları ona yönlendirmek ve sayısını kalite raporuna yazmak.

## Zaman damgası ve saat dilimi

- **Anı UTC sakla**, tek biçimde: `2026-03-31T21:30:00Z`. Karışık ofsetler (`Z` ile `+03:00`) metin olarak yanlış
  sıralanır; aşağıdaki ilk sorgu bunu gösterir.
- **Raporlama gününü yerel saatten türet:** Türkiye için `date(zaman, '+3 hours')`. 2016 öncesi veride Türkiye yaz
  saati uyguluyordu; o yıllar için sabit +3 değil saat dilimi veritabanı (`Europe/Istanbul`) gerekir.
- **İki zaman sakla:** olayın cihazdaki zamanı (davranış analizi için) ve sunucuya varış zamanı (hat ve artımlı
  yükleme için). Çevrimdışı uygulamada olay saatler sonra gelebilir; cihaz saati yanlış olabilir (1970, gelecek yıl).
- Ofsetsiz zaman (`2025-03-03T00:16:01`) gördüğünüzde ilk soru "bu hangi saat dilimi?" olmalıdır.

```sql calistir
-- Karışık ofsetler: 23:30+03:00 aslında 20:30Z'dir, yani 21:30Z'den ÖNCE
SELECT 'metin karşılaştırması', '2026-03-31T21:30:00Z' < '2026-03-31T23:30:00+03:00';
SELECT 'zaman karşılaştırması', datetime('2026-03-31T21:30:00Z') < datetime('2026-03-31T23:30:00+03:00');
CREATE TABLE olay (olay_id INTEGER, zaman TEXT);
INSERT INTO olay VALUES (1, '2026-03-31T20:30:00Z'), (2, '2026-03-31T21:30:00Z'),
  (3, '2026-03-31T23:59:00Z'), (4, '2026-04-01T09:00:00Z');
-- YANLIŞ: UTC ayı. Türkiye'de 21:00 UTC'den sonrası ertesi gündür
SELECT 'UTC ayı', strftime('%Y-%m', zaman) AS ay, COUNT(*) FROM olay GROUP BY ay ORDER BY ay;
-- DOĞRU: Türkiye ayı
SELECT 'TR ayı', strftime('%Y-%m', zaman, '+3 hours') AS ay, COUNT(*) FROM olay GROUP BY ay ORDER BY ay;
```

```cikti
metin karşılaştırması|1
zaman karşılaştırması|0
UTC ayı|2026-03|3
UTC ayı|2026-04|1
TR ayı|2026-03|1
TR ayı|2026-04|3
```

Mart ayının olay sayısı tanıma göre 3 ya da 1. Ay sonu raporları bu yüzden tutmaz. Raporlama gününün tanımını bir
kez yazın ("gün = Türkiye saatiyle gün") ve bütün sorgular aynı görünümden (view) okusun.

## Yavaş değişen boyut

Müşteri 1 Haziran'da Ankara'dan İzmir'e taşındı. "Şehre göre ciro" raporu hangi şehri kullanmalı?

| Tür | Ne yapar | Ne zaman |
| --- | --- | --- |
| Tür 0 | Hiç değişmez | Doğum tarihi, kayıt tarihi |
| Tür 1 | Üstüne yazar; geçmiş yeni değerle görünür | Yazım düzeltmesi |
| Tür 2 | Her değişiklikte yeni satır: `gecerli_bas`, `gecerli_bit` | Şehir, plan, segment, liste fiyatı |
| Olguya yazmak | Olay anındaki değer olgu satırında durur | Küçük projede tür 2'nin kısa yolu |

```sql calistir
CREATE TABLE musteri_t2 (musteri_id INTEGER, sehir TEXT, gecerli_bas TEXT, gecerli_bit TEXT);
INSERT INTO musteri_t2 VALUES (7, 'Ankara', '2025-01-01', '2026-06-01'), (7, 'İzmir', '2026-06-01', '9999-12-31');
CREATE TABLE siparis (musteri_id INTEGER, gun TEXT, tutar INTEGER);
INSERT INTO siparis VALUES (7, '2026-03-10', 500), (7, '2026-06-01', 300), (7, '2026-07-02', 200);
-- YANLIŞ (tür 1 gibi): bütün geçmiş güncel şehre yazılır
SELECT 'güncel şehir', m.sehir, SUM(s.tutar) FROM siparis s
JOIN musteri_t2 m ON m.musteri_id = s.musteri_id AND m.gecerli_bit = '9999-12-31' GROUP BY m.sehir;
-- YANLIŞ: BETWEEN iki ucu da kapsar; değişiklik günü iki kez sayılır
SELECT 'BETWEEN', SUM(s.tutar) FROM siparis s
JOIN musteri_t2 m ON m.musteri_id = s.musteri_id AND s.gun BETWEEN m.gecerli_bas AND m.gecerli_bit;
-- DOĞRU: yarı açık aralık [bas, bit)
SELECT 'o günkü şehir', m.sehir, SUM(s.tutar) FROM siparis s
JOIN musteri_t2 m ON m.musteri_id = s.musteri_id AND s.gun >= m.gecerli_bas AND s.gun < m.gecerli_bit
GROUP BY m.sehir ORDER BY m.sehir;
```

```cikti
güncel şehir|İzmir|1000
BETWEEN|1300
o günkü şehir|Ankara|500
o günkü şehir|İzmir|500
```

## Analiz için hangi ham veri saklanır

| Saklayın | Neden |
| --- | --- |
| Olay kimliği (istemcide üretilen benzersiz kimlik) | Yeniden gönderilen olayı tekilleştirmek için tek yol |
| Kullanıcı kimliği + anonim cihaz kimliği | Giriş öncesi ve sonrası davranışı birleştirmek |
| Olay adı + özellikler (sürümlü sözlükten) | Sonradan yeni soru sorabilmek |
| Olay zamanı (UTC) + sunucuya varış zamanı | Davranış analizi ↔ geç gelen veri ayrımı |
| Bağlam: platform, uygulama sürümü, ekran, dil | Hata ve kırılım analizi; sonradan eklenemez |
| Para: tam sayı kuruş ya da ondalık metin + para birimi | Kayan noktalı TL kuruş kaybettirir |
| İptal, iade, geri alma: ayrı olay olarak | Satır silmek geçmiş ciroyu değiştirir |
| Ham katmanın değişmez kopyası; dönüşüm kodu sürüm denetiminde | Hata bulunca baştan hesaplamak |

Saklamayın: parola, tam kart numarası, amaç dışı kişisel veri, serbest metne gömülmüş kimlik bilgisi. Kişisel veri
taşıyan ham olayların saklama süresini baştan yazın ([gizlilik notu](gizlilik-ve-anonimlestirme.md)).

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| "Geçen ay kaç premium vardı?" yanıtlanamıyor | Yalnız durum tablosu var; `UPDATE` geçmişi sildi | Değişiklikleri olay olarak yazın; olay geçmişi birikene kadar her gece anlık görüntü alın |
| Birleştirmeden sonra ciro 2–3 kat | Fan-out: kaba tanecikli ölçü ince tanecikle çoğaldı | Önce kendi taneciğinde özetleyin; mutabakat sorgusu |
| Kategori kırılımının toplamı genel toplamdan az | İç birleştirme boyutta olmayan satırları attı | Dış birleştirme + "(bilinmeyen)" satırı; eşleşmeyenleri sayın |
| Ay sonu cirosu iki raporda farklı | Biri UTC günü, biri Türkiye günü kullanıyor | Tek tanım, tek görünüm: `date(zaman, '+3 hours')` |
| Gece 00:00–03:00 etkinliği önceki güne yazılıyor | Sunucu UTC'de; `date('now')` ya da `date(zaman)` | Gün hesabında saat dilimi düzeltmesi |
| Zaman sıralaması tutarsız | `Z` ile `+03:00` ofsetleri karışık metin | Yazarken UTC'ye çevirin; tek biçim |
| 2016 öncesi kış aylarının saatleri bir saat kayık | Sabit +3 uygulandı; o yıllarda kışın UTC+2 geçerliydi | `zoneinfo` ile `Europe/Istanbul` |
| Eski raporlar kendiliğinden değişiyor | Boyut üstüne yazıldı (tür 1) | Tür 2 ya da değeri olguya yazma |
| Değişiklik gününde satır iki kez sayılıyor | `BETWEEN` iki ucu da kapsar | Yarı açık aralık: `>= bas AND < bit` |
| 1970 ya da gelecek tarihli olaylar | Cihaz saati bozuk | Varış zamanını da saklayın; aralık dışını işaretleyin |
| Geçmiş ay cirosu her hafta değişiyor | İptal edilen sipariş satırı siliniyor | İptal/iade ayrı olay; silme yok |

## Denetim listesi

- [ ] Her tablonun belgesinde tanecik tek cümleyle yazıyor: "bir satır = …".
- [ ] Analizde gereken her değişiklik (plan, durum, fiyat) olay olarak ekleniyor; olay satırı güncellenmiyor, silinmiyor.
- [ ] Zamanlar UTC ve tek biçimde; raporlama günü tanımı yazılı ve tek bir görünümde.
- [ ] Olay zamanı ve varış zamanı ayrı sütunlar.
- [ ] Her birleştirmeli sorgu için mutabakat çalıştırıldı: olgu toplamı = birleştirilmiş toplam.
- [ ] Boyutta karşılığı olmayan olgular "(bilinmeyen)" altında görünüyor; sayıları raporda.
- [ ] Değişebilen boyut nitelikleri için tür seçildi (1, 2 ya da olguya yazma) ve gerekçesi yazıldı.
- [ ] Geçerlilik aralıkları yarı açık; değişiklik gününde çift sayım yok.
- [ ] Para tam sayı kuruş ya da ondalık; kayan noktalı TL yok.
- [ ] Ham olaylarda gereksiz kişisel veri yok; saklama süresi yazılı.

## Küçük modele yaptırırken

- **İsteme yazın:** "Her tablo için önce taneciği tek cümleyle yaz. Durum değişikliklerini yalnız ekleme yapılan
  bir olay tablosuna yaz; analiz tablolarında `UPDATE` ve `DELETE` kullanma. Zamanları UTC ISO-8601 (`Z`) sakla;
  gün ve ay hesabında `'+3 hours'` düzeltmesi uygula. Ölçüleri kendi taneciğinde özetle, sonra birleştir. Her
  birleştirmeli sorgunun yanına bir mutabakat sorgusu yaz."
- **Modelin tipik hatası:** siparişi kalemlerle birleştirip sipariş toplamını toplar; `date(zaman)` ile UTC günü
  alır; boyutla iç birleştirme yapar; zaman damgasını saat dilimsiz üretir (`datetime.now()`); geçerlilik
  aralığında `BETWEEN` kullanır.
- **Çıktıda denetleyin:** her `JOIN`'den sonra toplam değişiyor mu; `date(` ve `strftime(` çağrılarında saat
  dilimi düzeltmesi var mı; analiz tablosuna `UPDATE` yazan kod var mı; `BETWEEN` geçen tarih koşulu var mı.
- **Sorun:** "Bu tabloda bir satır neyi temsil ediyor?" ve "1 Mart'taki durumu bu tablodan nasıl bulurum?"
  İkisine de net yanıt yoksa model tasarımı bitmemiştir.

## İlgili

- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — kohort, huni, tutma, oturumlama
- [Olay izleme planı](olay-izleme-plani.md) — olay adları, özellikler, kimlik birleştirme
- [Veri hattı tasarımı](veri-hatti-tasarimi.md) — geç gelen veri, idempotent ve artımlı yükleme
- [Ürün ölçütleri](urun-olcutleri.md) — tanımı yazılı ölçütler bu modelin üstüne kurulur
- Türkiye saati, "an" ile "takvim günü" ayrımı: [`kutuphane/py/kutuphane/tarih.py`](../../kutuphane/py/kutuphane/tarih.py)
- Olay tablosu örneği (ofsetsiz `zaman` alanıyla):
  [`veri/ornekler/web_olaylari/`](../../veri/ornekler/web_olaylari/VERI_KARTI.md)
- Yıldız şemaya benzer birleştirmeli sorgular (DuckDB):
  [`veri/docs/ANALIZ_TARIFLERI.md`](../../veri/docs/ANALIZ_TARIFLERI.md)
- [Zaman ve saat dilimi](../30-arkauc/zaman-ve-saat-dilimi.md) — an, duvar saati, takvim günü; uygulama tarafı
- [SQL sorgu yazımı](../10-diller/sql-sorgu.md) — birleştirmede satır çoğalması, NULL mantığı
- [Veritabanı tasarımı](../30-arkauc/veritabani-tasarimi.md) — uygulamanın (durum) şeması
- [Veri yaşam döngüsü](../40-sistem-tasarimi/veri-yasam-dongusu.md) — saklama süresi, silme talebi
- [Keşifsel veri analizi](kesifsel-veri-analizi.md) — tanecik ve anahtarı veride doğrulamak
