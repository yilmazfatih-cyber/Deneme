# Veri kartı: kisiler

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Kişi tablosu: doğrulama, profil, maskeleme ve yineleme alıştırması.

## Üretim

- Komut: `python -m verihavuzu uret kisiler --adet 500 --tohum 42 --sema --cikti ornekler/kisiler`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `kisiler.csv` | 500 | 76202 |
| `kisiler.sema.json` | - | 1801 |

## Bilinen yapı ve doğru cevaplar

- İlçe her zaman ile bağlıdır; posta kodunun ilk iki hanesi plakadır.
- TCKN, e-posta benzersizdir; TCKN sağlaması geçerlidir ama numaralar uydurmadır.

## Sütunlar

### kisiler

Uydurma kişiler. Gerçek kişilerle ilgisi yoktur.

Birincil anahtar: `kisi_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `kisi_id` | metin | evet | benzersiz; desen `^K\d{6}$` |  |
| `ad` | metin | evet |  |  |
| `soyad` | metin | evet |  |  |
| `cinsiyet` | metin | evet | değerler: K, E | K: kadın, E: erkek |
| `dogum_tarihi` | tarih | evet | 1930-01-01 – 2026-01-01 |  |
| `tckn` | metin | evet | benzersiz; T.C. kimlik numarası (11 hane, sağlamalı) | uydurma |
| `telefon` | metin | evet | cep telefonu numarası (+905 ile, 13 karakter) | uydurma cep numarası |
| `eposta` | metin | evet | benzersiz; e-posta adresi |  |
| `il` | metin | evet | il adı |  |
| `ilce` | metin | evet |  |  |
| `plaka` | tam sayı | evet | [1, 81] |  |
| `posta_kodu` | metin | evet | posta kodu (5 hane, ilk ikisi plaka kodu) |  |
| `adres` | metin | evet |  | uydurma açık adres (mahalle, cadde/sokak, no) |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
