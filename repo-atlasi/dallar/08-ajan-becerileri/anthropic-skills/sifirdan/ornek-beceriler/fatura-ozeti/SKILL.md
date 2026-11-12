---
name: fatura-ozeti
description: Faturalardan satıcı, tarih, ara toplam, KDV ve genel toplamı çıkarıp tablo hâlinde özetler. Kullanıcı fatura, makbuz, KDV toplamı, gider raporu ya da muhasebe için tutar çıkarma istediğinde kullan.
license: MIT
metadata:
  dil: tr
  surum: '1.0'
---

# Fatura özeti

Bu beceri, D08 dalının öğretim örneğidir: aşamalı açılımın üç düzeyini de kullanır.

## Adımlar

1. Her faturadan şu alanları çıkar: satıcı, fatura tarihi, ara toplam, KDV tutarı, genel toplam.
2. KDV oranını doğrulaman gerekirse [KDV oran tablosunu](references/kdv-oranlari.md) oku. Gerekmiyorsa okuma:
   tablo her faturada lazım değildir, bağlamı boşuna doldurur.
3. Tutarları elle toplama. Satırları `tutar` sütunlu bir CSV olarak `scripts/topla.py` betiğine ver ve
   betiğin çıktısını kullan; aritmetiği modelden değil koddan al.
4. Sonucu şu tabloyla ver:

| Satıcı | Tarih | Ara toplam | KDV | Genel toplam |
| ------ | ----- | ---------- | --- | ------------ |

## Dikkat

- Okunamayan alanı tahmin etme; hücreye "okunamadı" yaz ve kullanıcıya hangi faturada olduğunu söyle.
- Para birimini koru; farklı para birimlerini toplama.
