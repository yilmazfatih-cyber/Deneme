# Analiz tarifleri (DuckDB)

Örnek kümeler (`ornekler/`) ve başvuru verileri (`tr/`) üzerinde çalışan, **çıktısı sınanmış** SQL
sorguları. Her sorgunun altındaki "beklenen çıktı" bloğu gerçek çalıştırmadan yazılmıştır;
`tests/test_analiz.py` her denetimde sorguları yeniden çalıştırıp çıktının aynı kaldığını doğrular.

Çalıştırma (temel klasöründen; `analiz` ekstrası gerekir):

```bash
.venv/bin/python -c "import duckdb; print(duckdb.sql(open('sorgu.sql').read()))"
python -m verihavuzu.analiz          # bu belgedeki tüm tarifleri denetler
python -m verihavuzu.analiz --yaz    # örnekler bilerek değiştiyse beklenen çıktıları yeniler
```

Not: Tutarlar sentetik veriden gelir; sonuçlar gerçek bir işletmeyi anlatmaz.

## 1. Aylık ciro (iptal edilen siparişler hariç)

```sql
SELECT strftime(siparis_zamani, '%Y-%m') AS ay,
       count(*) AS siparis,
       round(sum(toplam), 2) AS ciro
FROM read_csv('ornekler/eticaret/siparisler.csv')
WHERE durum <> 'iptal'
GROUP BY ay
ORDER BY ay;
```

```text
ay | siparis | ciro
2025-01 | 208 | 455954.4
2025-02 | 126 | 357926.93
2025-03 | 168 | 466256.9
2025-04 | 185 | 457898.52
2025-05 | 193 | 418969.53
2025-06 | 190 | 409916.98
2025-07 | 212 | 514615.06
2025-08 | 161 | 449840.44
2025-09 | 218 | 568680.99
2025-10 | 229 | 546379.13
2025-11 | 366 | 810903.76
2025-12 | 322 | 863445.18
```

## 2. Haftanın günlerine göre sipariş (başvuru tablosuyla birleştirme)

`tr/gunler.csv` ISO gün numarasını (Pazartesi = 1) Türkçe ada çevirir.

```sql
SELECT g.ad AS gun, count(*) AS siparis
FROM read_csv('ornekler/eticaret/siparisler.csv') s
JOIN read_csv('tr/gunler.csv') g ON g.no = isodow(s.siparis_zamani)
GROUP BY g.no, g.ad
ORDER BY g.no;
```

```text
gun | siparis
Pazartesi | 345
Salı | 308
Çarşamba | 314
Perşembe | 348
Cuma | 448
Cumartesi | 438
Pazar | 442
```

## 3. En çok satan beş ürün

```sql
SELECT u.urun_adi, u.kategori, sum(k.adet) AS adet, round(sum(k.tutar), 2) AS ciro
FROM read_csv('ornekler/eticaret/siparis_kalemleri.csv') k
JOIN read_csv('ornekler/eticaret/urunler.csv') u USING (urun_id)
GROUP BY u.urun_id, u.urun_adi, u.kategori
ORDER BY adet DESC, u.urun_id
LIMIT 5;
```

```text
urun_adi | kategori | adet | ciro
Lodos Kırmızı Mercimek | Gıda | 1095 | 103338.03
Ihlamur Duvar Saati | Ev | 518 | 1015469.22
Yakamoz Pirinç | Gıda | 351 | 38197.5
Bozkır Yürüyüş Ayakkabısı | Ayakkabı | 304 | 1382320.3
Ladin Oyun Hamuru Seti | Oyuncak | 224 | 48474.78
```

## 4. Kategoriye göre iade oranı

```sql
WITH satis AS (
    SELECT u.kategori, sum(k.adet) AS satilan
    FROM read_csv('ornekler/eticaret/siparis_kalemleri.csv') k
    JOIN read_csv('ornekler/eticaret/urunler.csv') u USING (urun_id)
    GROUP BY u.kategori
), iade AS (
    SELECT u.kategori, sum(i.adet) AS iade_edilen
    FROM read_csv('ornekler/eticaret/iadeler.csv') i
    JOIN read_csv('ornekler/eticaret/siparis_kalemleri.csv') k USING (kalem_id)
    JOIN read_csv('ornekler/eticaret/urunler.csv') u ON u.urun_id = k.urun_id
    GROUP BY u.kategori
)
SELECT s.kategori, s.satilan, coalesce(i.iade_edilen, 0) AS iade_edilen,
       round(100.0 * coalesce(i.iade_edilen, 0) / s.satilan, 1) AS iade_yuzde
FROM satis s LEFT JOIN iade i USING (kategori)
ORDER BY iade_yuzde DESC, s.kategori;
```

```text
kategori | satilan | iade_edilen | iade_yuzde
Giyim | 466 | 68 | 14.6
Ayakkabı | 474 | 64 | 13.5
Ev | 984 | 40 | 4.1
Elektronik | 174 | 6 | 3.4
Yapı Market | 105 | 3 | 2.9
Oyuncak | 224 | 6 | 2.7
Kırtasiye | 117 | 3 | 2.6
Kozmetik | 157 | 4 | 2.5
Anne ve Bebek | 96 | 2 | 2.1
Evcil Hayvan | 284 | 6 | 2.1
Spor | 117 | 1 | 0.9
Gıda | 2081 | 11 | 0.5
```

## 5. Kampanya günleri ile sıradan günlerin karşılaştırması

```sql
WITH gunluk AS (
    SELECT CAST(siparis_zamani AS DATE) AS gun, any_value(kampanya) AS kampanya, count(*) AS siparis
    FROM read_csv('ornekler/eticaret/siparisler.csv')
    GROUP BY gun
)
SELECT CASE WHEN kampanya IS NULL THEN 'sıradan gün' ELSE 'kampanya günü' END AS gun_turu,
       count(*) AS gun_sayisi, round(avg(siparis), 2) AS ortalama_siparis
FROM gunluk
GROUP BY gun_turu
ORDER BY gun_turu;
```

```text
gun_turu | gun_sayisi | ortalama_siparis
kampanya günü | 12 | 24.25
sıradan gün | 353 | 6.66
```

## 6. Bölgeye göre müşteri sayısı (il tablosuyla birleştirme)

```sql
SELECT i.bolge, count(*) AS musteri, round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS yuzde
FROM read_csv('ornekler/eticaret/musteriler.csv') m
JOIN read_csv('tr/iller.csv') i ON i.plaka = m.plaka
GROUP BY i.bolge
ORDER BY musteri DESC, i.bolge;
```

```text
bolge | musteri | yuzde
Karadeniz | 58 | 19.3
Doğu Anadolu | 49 | 16.3
Akdeniz | 42 | 14.0
İç Anadolu | 39 | 13.0
Güneydoğu Anadolu | 38 | 12.7
Marmara | 38 | 12.7
Ege | 36 | 12.0
```

## 7. En çok harcayan beş müşteri

```sql
SELECT m.musteri_id, m.ad || ' ' || m.soyad AS ad_soyad, count(*) AS siparis,
       round(sum(s.toplam), 2) AS harcama
FROM read_csv('ornekler/eticaret/siparisler.csv') s
JOIN read_csv('ornekler/eticaret/musteriler.csv') m USING (musteri_id)
WHERE s.durum <> 'iptal'
GROUP BY m.musteri_id, ad_soyad
ORDER BY harcama DESC, m.musteri_id
LIMIT 5;
```

```text
musteri_id | ad_soyad | siparis | harcama
M000282 | Tamer Pala | 91 | 254318.98
M000078 | Tamer Aksoy | 84 | 208015.97
M000044 | Mert Uyar | 59 | 149723.14
M000262 | Zerrin Şahin | 58 | 143232.93
M000042 | Saadet Demir | 58 | 137548.82
```

## 8. Excel-TR CSV okuma: KDV oranına göre matrah ve KDV

`faturalar` örneği noktalı virgül ayraçlı ve ondalık virgüllüdür; DuckDB'ye bunu söylemek gerekir.

```sql
SELECT kdv_orani, count(*) AS kalem, round(sum(matrah), 2) AS matrah,
       round(sum(kdv_tutari), 2) AS kdv, round(sum(tutar), 2) AS tutar
FROM read_csv('ornekler/faturalar/fatura_kalemleri.csv', delim = ';', decimal_separator = ',')
GROUP BY kdv_orani
ORDER BY kdv_orani;
```

```text
kdv_orani | kalem | matrah | kdv | tutar
1 | 401 | 67650.42 | 676.86 | 68327.28
10 | 245 | 716399.36 | 71639.8 | 788039.16
20 | 674 | 688381.47 | 137677.31 | 826058.78
```

## 9. Banka hareketleri: türe göre giriş ve çıkış (JSONL)

```sql
SELECT tur, count(*) AS adet, round(sum(tutar), 2) AS toplam
FROM read_json('ornekler/banka/hareketler.jsonl')
GROUP BY tur
ORDER BY toplam DESC;
```

```text
tur | adet | toplam
maas | 120 | 4361043.72
eft_gelen | 93 | 202247.19
eft_giden | 118 | -242561.11
atm | 186 | -290700.0
fatura | 591 | -302582.27
kira | 47 | -386152.59
kart_harcamasi | 2289 | -1082014.25
```

## 10. Doğalgaz faturası: kış ile yaz farkı

```sql
SELECT CASE WHEN month(CAST(zaman AS TIMESTAMP)) IN (11, 12, 1, 2, 3) THEN 'kış' ELSE 'yaz' END AS donem,
       count(*) AS fatura, round(avg(-tutar), 2) AS ortalama_tutar
FROM read_json('ornekler/banka/hareketler.jsonl')
WHERE aciklama = 'DOĞALGAZ FATURASI'
GROUP BY donem
ORDER BY donem;
```

```text
donem | fatura | ortalama_tutar
kış | 47 | 1450.6
yaz | 70 | 308.31
```

## 11. Zaman serisi: anomali türleri ve sapma

```sql
SELECT coalesce(anomali_turu, 'yok') AS tur, count(*) AS gun,
       round(avg(deger / beklenen), 3) AS ortalama_oran
FROM read_csv('ornekler/zaman_serisi/zaman_serisi.csv')
GROUP BY tur
ORDER BY gun DESC, tur;
```

```text
tur | gun | ortalama_oran
yok | 1374 | 0.999
seviye_kaymasi | 69 | 1.494
ani_dusus | 6 | 0.335
eksik | 6 | NULL
ani_artis | 5 | 2.445
```

## 12. Churn: sözleşme türüne göre kayıp oranı

```sql
SELECT sozlesme, count(*) AS musteri, round(100.0 * avg(churn), 1) AS churn_yuzde,
       round(100.0 * avg(gercek_olasilik), 1) AS beklenen_yuzde
FROM read_csv('ornekler/churn/churn.csv')
GROUP BY sozlesme
ORDER BY churn_yuzde DESC;
```

```text
sozlesme | musteri | churn_yuzde | beklenen_yuzde
aylik | 2489 | 34.1 | 34.3
yillik | 1754 | 11.1 | 10.6
iki_yillik | 757 | 8.9 | 7.9
```

## 13. Churn: kıdem dilimine göre kayıp oranı

```sql
WITH d AS (
    SELECT (kidem_ay - 1) // 12 AS dilim, churn
    FROM read_csv('ornekler/churn/churn.csv')
)
SELECT dilim * 12 + 1 || '–' || (dilim + 1) * 12 AS kidem_ay,
       count(*) AS musteri, round(100.0 * avg(churn), 1) AS churn_yuzde
FROM d
GROUP BY dilim
ORDER BY dilim;
```

```text
kidem_ay | musteri | churn_yuzde
1–12 | 1037 | 39.9
13–24 | 1362 | 26.6
25–36 | 1433 | 19.0
37–48 | 527 | 7.6
49–60 | 478 | 4.2
61–72 | 163 | 1.2
```

## 14. Web hunisi: adım adım dönüşüm

```sql
WITH adim AS (
    SELECT olay, count(DISTINCT oturum_id) AS oturum
    FROM read_json('ornekler/web_olaylari/web_olaylari.jsonl')
    GROUP BY olay
), sirali AS (
    SELECT olay, oturum,
           list_position(['sayfa_goruntuleme', 'urun_goruntuleme', 'sepete_ekle', 'odeme_baslat', 'satin_al'], olay) AS sira
    FROM adim
)
SELECT olay, oturum,
       round(100.0 * oturum / lag(oturum) OVER (ORDER BY sira), 1) AS onceki_adima_gore_yuzde
FROM sirali
ORDER BY sira;
```

```text
olay | oturum | onceki_adima_gore_yuzde
sayfa_goruntuleme | 800 | NULL
urun_goruntuleme | 800 | 100.0
sepete_ekle | 187 | 23.4
odeme_baslat | 104 | 55.6
satin_al | 53 | 51.0
```

## 15. Destek: kategoriye göre ortanca çözüm süresi ve memnuniyet

```sql
SELECT kategori, count(*) AS talep, median(cozum_suresi_saat) AS ortanca_saat,
       round(avg(memnuniyet), 2) AS ortalama_memnuniyet
FROM read_csv('ornekler/destek/destek_talepleri.csv')
GROUP BY kategori
ORDER BY ortanca_saat;
```

```text
kategori | talep | ortanca_saat | ortalama_memnuniyet
hesap | 119 | 5.3 | 4.36
odeme | 92 | 10.75 | 4.09
fatura | 109 | 16.2 | 4.17
kargo | 108 | 17.95 | 4.24
urun | 84 | 26.8 | 3.93
iade | 88 | 27.65 | 4.15
```
