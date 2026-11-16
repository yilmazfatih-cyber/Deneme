# Veri kartı: banka

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Banka hesapları ve 12 aylık hareketler (JSONL).

## Üretim

- Komut: `python -m verihavuzu uret banka --adet 10 --tohum 42 --bicim jsonl --sema --cikti ornekler/banka`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `hareketler.jsonl` | 3444 | 758814 |
| `hareketler.sema.json` | - | 1339 |
| `hesaplar.jsonl` | 10 | 1705 |
| `hesaplar.sema.json` | - | 860 |

## Bilinen yapı ve doğru cevaplar

- Her hesapta bakiye[i] = bakiye[i−1] + tutar[i] ve bakiye hiç eksiye düşmez.
- Doğalgaz faturası Kasım–Mart aylarında yüksektir.

## Sütunlar

### hareketler

Hesap hareketleri; tutar girişte pozitif, çıkışta negatif.

Birincil anahtar: `hareket_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `hareket_id` | metin | evet | benzersiz; desen `^HR\d{8}$` |  |
| `hesap_id` | metin | evet | desen `^H\d{5}$` |  |
| `zaman` | zaman | evet |  |  |
| `tur` | metin | evet | değerler: maas, kira, fatura, kart_harcamasi, atm, eft_giden, eft_gelen |  |
| `aciklama` | metin | evet |  |  |
| `tutar` | ondalık | evet |  |  |
| `bakiye` | ondalık | evet | [0, ∞] |  |
| `karsi_iban` | metin | hayır | Türkiye IBAN'ı (TR + 24 karakter, mod 97 sağlamalı) |  |
| `kanal` | metin | evet | değerler: mobil, internet, atm, pos, otomatik |  |

### hesaplar

Uydurma banka hesapları.

Birincil anahtar: `hesap_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `hesap_id` | metin | evet | benzersiz; desen `^H\d{5}$` |  |
| `ad_soyad` | metin | evet |  |  |
| `iban` | metin | evet | benzersiz; Türkiye IBAN'ı (TR + 24 karakter, mod 97 sağlamalı) | uydurma |
| `banka` | metin | evet |  |  |
| `acilis_tarihi` | tarih | evet |  |  |
| `acilis_bakiyesi` | ondalık | evet | [0, ∞] |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
