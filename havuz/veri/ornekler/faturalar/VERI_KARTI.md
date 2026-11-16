# Veri kartı: faturalar

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Excel-TR biçiminde (';', BOM, ondalık virgül) faturalar ve kalemleri.

## Üretim

- Komut: `python -m verihavuzu uret faturalar --adet 80 --tohum 42 --excel-tr --sema --cikti ornekler/faturalar`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `fatura_kalemleri.csv` | 1320 | 102655 |
| `fatura_kalemleri.sema.json` | - | 1284 |
| `faturalar.csv` | 664 | 105759 |
| `faturalar.sema.json` | - | 1527 |

## Bilinen yapı ve doğru cevaplar

- Her kalemde matrah + kdv_tutari = tutar; faturada matrah + kdv_tutari = genel_toplam.
- KDV oranları %1/%10/%20 (ayarla değiştirilebilir); ürün–oran eşlemesi kurgusaldır.

## Sütunlar

### fatura_kalemleri

Fatura kalemleri; kargo da bir kalemdir.

Birincil anahtar: `fatura_no, sira`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `fatura_no` | metin | evet | desen `^[A-Z]{3}\d{4}\d{9}$` |  |
| `sira` | tam sayı | evet | [1, ∞] |  |
| `aciklama` | metin | evet |  |  |
| `urun_id` | metin | hayır |  |  |
| `adet` | tam sayı | evet | [1, ∞] |  |
| `birim_fiyat` | ondalık | evet | [0, ∞] | KDV dahil |
| `kdv_orani` | tam sayı | evet | [0, 100] |  |
| `matrah` | ondalık | evet | [0, ∞] |  |
| `kdv_tutari` | ondalık | evet | [0, ∞] |  |
| `tutar` | ondalık | evet | [0, ∞] | KDV dahil = matrah + kdv_tutari |

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
