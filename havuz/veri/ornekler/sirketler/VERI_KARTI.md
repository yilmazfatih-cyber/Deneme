# Veri kartı: sirketler

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Şirket tablosu: VKN, IBAN ve unvan alanları.

## Üretim

- Komut: `python -m verihavuzu uret sirketler --adet 200 --tohum 42 --sema --cikti ornekler/sirketler`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `sirketler.csv` | 200 | 28509 |
| `sirketler.sema.json` | - | 1592 |

## Bilinen yapı ve doğru cevaplar

- Telefonun alan kodu şirketin ilinindir; IBAN banka kodu tr/banka_kodlari.json'dandır.

## Sütunlar

### sirketler

Uydurma şirketler. Gerçek şirketlerle ilgisi yoktur.

Birincil anahtar: `sirket_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `sirket_id` | metin | evet | benzersiz; desen `^S\d{5}$` |  |
| `unvan` | metin | evet | benzersiz; desen `(A\.Ş\.\|Ltd\. Şti\.)$` |  |
| `tur` | metin | evet | değerler: Ltd. Şti., A.Ş. |  |
| `vkn` | metin | evet | benzersiz; vergi kimlik numarası (10 hane, sağlamalı) | uydurma |
| `sektor` | metin | evet |  |  |
| `il` | metin | evet | il adı |  |
| `ilce` | metin | evet |  |  |
| `plaka` | tam sayı | evet | [1, 81] |  |
| `kurulus_yili` | tam sayı | evet | [1960, 2025] |  |
| `calisan_sayisi` | tam sayı | evet | [1, ∞] |  |
| `telefon` | metin | evet | telefon numarası (+90 ile, 13 karakter) | ilin alan koduyla |
| `iban` | metin | evet | Türkiye IBAN'ı (TR + 24 karakter, mod 97 sağlamalı) | uydurma |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
