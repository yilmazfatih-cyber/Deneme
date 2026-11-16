---
baslik: Keşifsel veri analizi
ozet: Yeni bir veri kümesine ilk saatte bakılacaklar: tanecik ve anahtar, dönem ve gün başına satır, eksik ve tuhaf değerler, yazım çeşitleri, birleştirme denetimi; çalışan SQL ilk bakış sorgularıyla.
etiketler: [veri, analiz, kesif, sql, veri-kalitesi, profil]
duzey: temel
guncellik: 2026-11
---

# Keşifsel veri analizi

> Bu notu ne zaman okumalı: size (ya da modele) bir CSV, bir tablo ya da bir veritabanı dökümü verilip "şunu
> analiz et" denildiğinde; ilk sonucu raporlamadan önce; bir analiz "fazla iyi" ya da "fazla kötü" çıktığında.

## Temel fikir

Keşifsel veri analizi (exploratory data analysis, EDA), soruya geçmeden veriyi tanımaktır. Analiz hatalarının çoğu
hesaptan değil, **veriyi yanlış tanımaktan** gelir: tanecik sanıldığı gibi değildir, anahtar yinelenir, bir hafta
eksiktir, `999` "bilinmiyor" demektir. Bu yüzden soruya geçmeden önce veriye bir saat ayrılır ve altı soru yanıtlanır:

1. Bir satır neyi temsil ediyor? Anahtar gerçekten benzersiz mi?
2. Hangi dönem? Gün başına kaç satır; boşluk ya da sıçrama var mı?
3. Hangi sütunlar eksik, hangi değerler olamayacak kadar tuhaf?
4. Kategorilerde aynı şeyin birden çok yazımı var mı?
5. Sayıların dağılımı makul mü (birim, kod değeri, negatif)?
6. Öteki tablolarla anahtarlar tutuyor mu?

Yöntem: **önce beklentini yaz, sonra bak.** "Yaklaşık 3.000 müşteri olmalı" diye yazıp sorguyu çalıştırın; şaşırtan
her sayı ya veri hatasıdır ya bulgudur, ikisi de not edilir. Sonuç kısa bir **veri notudur**.

## Karar tablosu

| İlk bakışta görülen | Olası neden | Ne yapılır |
| --- | --- | --- |
| Satır sayısı > tekil anahtar sayısı | Çift yükleme ya da tanecik yanlış anlaşıldı | Yinelenenleri sayın; tanecik cümlesini düzeltin |
| Gün başına satırda boşluk | Hat durdu, kaynak kesildi, tatil | Takvimle birleştirip eksik günleri listeleyin |
| Gün başına satırda ani sıçrama | Çift yükleme, kampanya, bot | O günün satırlarını inceleyin |
| Dönem beklenenden kısa ya da uzun | Dışa aktarım süzgeci, eski test verisi | Kaynağa sorun; dönemi rapora yazın |
| Gelecek tarihli ya da 1970 tarihli satır | Cihaz saati, varsayılan değer | Ayırın; sayısını yazın |
| Bir sütun hep aynı değer | Kullanılmayan alan, varsayılan değer | Analizden çıkarın, nedenini not edin |
| `999`, `-1`, `0` yığılması | Kod değeri | Eksik sayın |
| Oran sütununda 1'den büyük değer | Yüzde (0–100) ile oran (0–1) karışık | Birim kuralı yazın |
| Aynı şehrin birkaç yazımı | Elle giriş, büyük/küçük harf, boşluk | Türkçe katlanmış anahtar + eşleme tablosu |
| Birleştirmede eşleşmeyen anahtar | Eksik boyut, baştaki sıfır, biçim farkı | Eşleşmeyenleri sayın ve örnek gösterin |

## İlk bakış sorguları

Ekilmiş sorunlu küçük bir sipariş tablosu. Sorgular sırayla altı soruyu yanıtlar:

```sql calistir
CREATE TABLE musteri (musteri_id TEXT);
CREATE TABLE siparis (siparis_id TEXT, musteri_id TEXT, sehir TEXT, tutar REAL, zaman TEXT);
INSERT INTO musteri VALUES ('M1'), ('M2'), ('M3');
INSERT INTO siparis VALUES
  ('S1', 'M1', 'İstanbul', 120, '2026-11-01 10:00:00'), ('S2', 'M2', 'istanbul ', 80, '2026-11-01 12:00:00'),
  ('S3', 'M3', 'Ankara', 999, '2026-11-02 09:00:00'), ('S3', 'M3', 'Ankara', 999, '2026-11-02 09:00:00'),
  ('S4', 'M1', 'İzmir', 60, '2026-11-04 15:00:00'), ('S5', 'M7', 'İstanbul', 45, '2026-11-04 16:00:00'),
  ('S6', 'M2', NULL, 70, '2026-11-05 11:00:00'), ('S7', 'M2', 'Ankara', -30, '2027-11-05 11:00:00');
-- 1. Tanecik: bir satır = bir sipariş mi?
SELECT '1 satır / tekil anahtar', COUNT(*), COUNT(DISTINCT siparis_id) FROM siparis;
-- 2. Dönem ve gün başına satır (takvimle: boş gün de görünsün)
SELECT '2 dönem', MIN(zaman), MAX(zaman) FROM siparis;
WITH RECURSIVE takvim(gun) AS (
  SELECT '2026-11-01' UNION ALL SELECT date(gun, '+1 day') FROM takvim WHERE gun < '2026-11-05'
)
SELECT '2 gün', t.gun, COUNT(s.siparis_id) FROM takvim t LEFT JOIN siparis s ON date(s.zaman) = t.gun
GROUP BY t.gun ORDER BY t.gun;
-- 3. Eksik ve tuhaf değerler
SELECT '3 eksik şehir', SUM(sehir IS NULL), 'tutar 999', SUM(tutar = 999), 'negatif tutar', SUM(tutar < 0),
       'gelecek tarih', SUM(zaman > '2026-11-16') FROM siparis;
-- 4. Yazım çeşitleri: SQLite lower() Türkçe İ/I harfini katlamaz; önce elle çevirin
SELECT '4 yazım', lower(replace(replace(trim(sehir), 'İ', 'i'), 'I', 'ı')) AS anahtar,
       COUNT(DISTINCT sehir) AS farkli_yazim
FROM siparis WHERE sehir IS NOT NULL GROUP BY anahtar HAVING COUNT(DISTINCT sehir) > 1;
-- 5. Dağılım: kod değeri ayrılınca ortalama ne oluyor?
SELECT '5 ortalama tutar', round(AVG(tutar), 1), 'kod değeri ve negatif hariç',
       round(AVG(CASE WHEN tutar <> 999 AND tutar >= 0 THEN tutar END), 1) FROM siparis;
-- 6. Birleştirme: müşteri tablosunda olmayan anahtarlar
SELECT '6 eşleşmeyen müşteri', s.musteri_id, COUNT(*) FROM siparis s
WHERE NOT EXISTS (SELECT 1 FROM musteri m WHERE m.musteri_id = s.musteri_id) GROUP BY s.musteri_id;
```

```cikti
1 satır / tekil anahtar|8|7
2 dönem|2026-11-01 10:00:00|2027-11-05 11:00:00
2 gün|2026-11-01|2
2 gün|2026-11-02|2
2 gün|2026-11-03|0
2 gün|2026-11-04|2
2 gün|2026-11-05|1
3 eksik şehir|1|tutar 999|2|negatif tutar|1|gelecek tarih|1
4 yazım|istanbul|2
5 ortalama tutar|292.9|kod değeri ve negatif hariç|75.0
6 eşleşmeyen müşteri|M7|1
```

Sekiz satırlık tabloda sekiz sorun: yinelenen sipariş (S3), boş gün (3 Kasım), eksik şehir, kod değeri (999),
negatif tutar, gelecek yıl tarihli satır, aynı şehrin iki yazımı ve müşteri tablosunda olmayan bir müşteri. Ham
ortalama 292,9; kod değeri ve negatif ayrılınca 75. Bunların hiçbiri hata vermez; hepsi sonucu değiştirir.

Büyük dosyada aynı soruları hazır araç yanıtlar: `python -m verihavuzu profil veri.csv` her sütun için tür, eksik,
tekillik, dağılım, aykırı değer ve kişisel veri ipucu verir. Araç sütunlara tek tek bakar; tanecik, boş gün ve
birleştirme sorularını (1, 2 ve 6) yukarıdaki gibi siz sorarsınız.

## Beklenti yazmak

```text
Beklenti                                  Gerçek             Not
Siparişler 2026 Kasım'ı kapsar            1 Kas – 5 Kas 2027 Gelecek tarihli bir satır var (S7) → kaynağa sor
Günde yaklaşık 2 sipariş                  0–2                3 Kasım boş: hat mı durdu, gerçekten sipariş yok mu?
Her sipariş bir kez                       S3 iki kez         Yükleme yinelenmiş → tekilleştir
Ortalama tutar 50–150 TL                  292,9              999 kod değeri ve −30 → temizlik kuralı
```

Beklenti yazmak iki işe yarar: tuhaflığı gözden kaçırmamak ve veriyi bilen kişiye (kaynak sistemin sahibine) doğru
soruyu sormak. Beklentisi yazılmamış sayı, ne kadar tuhaf olursa olsun "doğru" görünür.

## Veri notu şablonu

```markdown
**Kaynak:** <tablo/dosya, kimden, ne zaman alındı>
**Tanecik:** bir satır = <…>; anahtar <sütunlar> (benzersiz mi: evet/hayır, kaç yineleme)
**Dönem:** <ilk – son>; eksik günler: <liste>; saat dilimi: <UTC / Türkiye / bilinmiyor>
**Sütunlar:** <anlamı belirsiz olanlar ve sorular>
**Bilinen sorunlar:** <eksik oranları, kod değerleri, birim karışıklığı, yazım çeşitleri>
**Birleştirme:** <hangi tabloyla, eşleşmeyen oranı>
**Açık sorular:** <kaynağa sorulacaklar>
```

Bu not analizin ilk bölümüdür; modele analiz yaptırırken isteme de eklenir.

## Tuzaklar

| Belirti | Neden | Çözüm |
| --- | --- | --- |
| Analiz sonucu iki katı | Tanecik denetlenmedi; satırlar yinelenmiş | Satır ↔ tekil anahtar sayısı ilk sorgudur |
| Bir haftanın düşüşü "bulgu" diye raporlandı | O hafta veri eksikti | Takvimle gün başına satır |
| Ortalama tutar tuhaf | Kod değerleri (999) ve negatifler | Önce tuhaf değerleri sayın |
| "İstanbul" iki satırda iki şehir | Büyük/küçük harf ve boşluk; SQLite `lower()` İ'yi katlamaz | Türkçe katlanmış anahtar |
| Birleştirmeden sonra satır kayboldu | Eşleşmeyen anahtarlar iç birleştirmede düştü | Eşleşmeyenleri sayan sorgu |
| Gelecek yıl tarihli olaylar | Cihaz saati ya da test verisi | Ayırıp sayısını yazın |
| Model ilk bakışı atlayıp doğrudan grafiğe geçti | İstemde ilk bakış istenmedi | İstemde veri notunu ilk adım olarak isteyin |
| Profil aracı "temiz" dedi ama sonuç yanlış | Araç sütun sütun bakar; tanecik ve boşluk görmez | 1, 2 ve 6. soruları ayrıca sorun |

## Denetim listesi

- [ ] Satır sayısı ile tekil anahtar sayısı karşılaştırıldı; tanecik tek cümleyle yazıldı.
- [ ] Dönem ve gün başına satır sayısı takvimle görüldü; boş ve sıçrayan günler listelendi.
- [ ] Her sütunun eksik oranı ve tuhaf değerleri (kod değerleri, negatif, gelecek tarih) sayıldı.
- [ ] Kategorik sütunlarda yazım çeşitleri Türkçe katlanmış anahtarla arandı.
- [ ] Sayısal sütunların birimi ve aralığı denetlendi.
- [ ] Öteki tablolarla birleştirmede eşleşmeyenler sayıldı.
- [ ] Beklentiler sorgudan önce yazıldı; şaşırtan her sayı not edildi.
- [ ] Veri notu yazıldı ve analize eklendi.

## Küçük modele yaptırırken

- **İsteme yazın:** "Analize geçmeden önce veri notunu doldur: tanecik ve anahtarın benzersizliği, dönem ve gün
  başına satır (takvimle), sütun başına eksik oranı ve tuhaf değerler, kategorilerde yazım çeşitleri, öteki
  tablolarla eşleşmeyen anahtarlar. Bulduğun her sorunu say ve örnek göster; düzeltme. Notu bana göster, onaydan
  sonra analize geç."
- **Modelin tipik hatası:** veriye bakmadan doğrudan ortalama ve grafik üretir; `df.describe()` çıktısını yorumsuz
  yapıştırır; yinelenen satırları görmez; boş günleri fark etmez; `lower()` ile Türkçe harfleri katladığını sanır;
  sorunları kendi başına "düzeltir" ve söylemez.
- **Çıktıda denetleyin:** satır ↔ tekil anahtar sayısı var mı; takvimli gün sayımı var mı; kod değerleri sayıldı mı;
  her sorun için sayı ve örnek verildi mi.
- **Sorun:** "Bu veride bir satır neyi temsil ediyor ve bunu nasıl doğruladın?"

## İlgili

- [Veri temizleme yöntemi](veri-temizleme-yontemi.md) — ilk bakıştan sonra kurallar ve düzeltme
- [Analitik veri modeli](analitik-veri-modeli.md) — tanecik ve birleştirme
- [Betimsel istatistik](betimsel-istatistik.md) — özet tablo okumak, aykırı değerin etkisi
- [Analitik SQL kalıpları](analitik-sql-kaliplari.md) — takvim omurgası, tekilleştirme
- [Veri kalitesi sözleşmeleri](veri-kalitesi-sozlesmeleri.md) — ilk bakışta bulunanı kalıcı denetime çevirmek
- [Türkçe büyük/küçük harf](../97-turkce/buyuk-kucuk-harf.md) — katlanmış anahtar
- Sütun profili aracı: [`veri/verihavuzu/kalite/profile.py`](../../veri/verihavuzu/kalite/profile.py)
  (`python -m verihavuzu profil dosya.csv`); alıştırma için kirli dosya:
  [`veri/ornekler/kirli_faturalar/`](../../veri/ornekler/kirli_faturalar/VERI_KARTI.md)
