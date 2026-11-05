# Örnek sorular (ornek/dukkan.sqlite)

Her başlık bir soru, altındaki `sql` bloğu beklenen sorgudur. Bu dosya üç yerde kullanılır:
testler (her sorgu örnek veritabanında çalışmalı), `text2sql degerlendir` (modelin ürettiği sorgunun
sonucu beklenen sonuçla karşılaştırılır) ve `--ornekler` seçeneğinin biçim örneği olarak.
Kendi veritabanınız için aynı biçimde bir dosya yazabilirsiniz.

## 1. Kaç müşteri var?

```sql
SELECT COUNT(*) AS musteri_sayisi FROM musteriler;
```

## 2. İstanbul'da yaşayan müşterilerin adları ve soyadları neler?

```sql
SELECT m.ad, m.soyad
FROM musteriler m
JOIN sehirler s ON s.id = m.sehir_id
WHERE s.ad = 'İstanbul';
```

## 3. Stokta kalmayan ürünler hangileri?

```sql
SELECT ad FROM urunler WHERE stok = 0;
```

## 4. Her kategoride kaç ürün var?

```sql
SELECT kategori, COUNT(*) AS urun_sayisi
FROM urunler
GROUP BY kategori
ORDER BY urun_sayisi DESC;
```

## 5. En pahalı 3 ürün hangisi?

```sql
SELECT ad, fiyat FROM urunler ORDER BY fiyat DESC LIMIT 3;
```

## 6. İptal edilen siparişlerin sayısı kaç?

```sql
SELECT COUNT(*) AS iptal_sayisi FROM siparisler WHERE durum = 'iptal';
```

## 7. En çok sipariş veren müşteri kim?

```sql
SELECT m.ad, m.soyad, COUNT(*) AS siparis_sayisi
FROM siparisler s
JOIN musteriler m ON m.id = s.musteri_id
GROUP BY m.id
ORDER BY siparis_sayisi DESC
LIMIT 1;
```

## 8. Mart 2025'te kaç sipariş verildi?

```sql
SELECT COUNT(*) AS siparis_sayisi
FROM siparisler
WHERE strftime('%Y-%m', siparis_tarihi) = '2025-03';
```

## 9. İptal edilmeyen siparişlerden elde edilen toplam ciro ne kadar?

```sql
SELECT SUM(k.adet * k.birim_fiyat) AS toplam_ciro
FROM siparis_kalemleri k
JOIN siparisler s ON s.id = k.siparis_id
WHERE s.durum <> 'iptal';
```

## 10. Hiç sipariş vermemiş müşteriler kimler?

```sql
SELECT m.ad, m.soyad
FROM musteriler m
LEFT JOIN siparisler s ON s.musteri_id = m.id
WHERE s.id IS NULL;
```
