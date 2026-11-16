# Veri kartı: kirli_faturalar

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Kirli veri: temiz karşılık + bozulma kaydıyla temizleme alıştırması.

## Üretim

- Komut: `python -m verihavuzu uret faturalar --adet 40 --tohum 7 --tablo faturalar --kirli --kirlilik 0.08 --sema --cikti ornekler/kirli_faturalar`
- Tohum: 7 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `faturalar.bozulmalar.jsonl` | 285 | 43118 |
| `faturalar.kirli.csv` | 366 | 59726 |
| `faturalar.sema.json` | - | 1527 |
| `faturalar.temiz.csv` | 357 | 58583 |

## Bilinen yapı ve doğru cevaplar

- faturalar.bozulmalar.jsonl her bozulmanın satırını, sütununu, türünü, temiz ve kirli değerini taşır; kirli satır k'nin temiz karşılığı k − (önceki yineleme satırı sayısı).
- Bozulmalar: eksik, yineleme, yazım hatası, tarih biçimi, ondalık, mojibake, boşluk.
- faturalar.sema.json TEMİZ verinin şemasıdır; kirli dosya bilerek ona uymaz.

## Sütunlar

### faturalar

Uydurma e-arşiv benzeri faturalar (tutarlar TL).

Birincil anahtar: `fatura_no`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `fatura_no` | metin | evet | benzersiz; desen `^[A-Z]{3}\d{4}\d{9}$` |  |
| `siparis_id` | metin | evet | benzersiz; desen `^SP\d{7}$` |  |
| `fatura_tarihi` | tarih | evet |  |  |
| `alici_ad_soyad` | metin | evet |  |  |
| `alici_tckn` | metin | evet | T.C. kimlik numarası (11 hane, sağlamalı) | uydurma |
| `alici_il` | metin | evet | il adı |  |
| `matrah` | ondalık | evet | [0, ∞] | KDV hariç toplam |
| `kdv_tutari` | ondalık | evet | [0, ∞] |  |
| `genel_toplam` | ondalık | evet | [0, ∞] | KDV dahil |
| `kdv_dokumu` | metin | evet |  | oran:tutar çiftleri, ör. '10:12.50\|20:40.00' |
| `yazi_ile` | metin | evet | desen `^Yalnız ` |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
