# Veri kartı: churn

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Nedensel yapısı bilinen müşteri kaybı kümesi (model sınaması için).

## Üretim

- Komut: `python -m verihavuzu uret churn --adet 5000 --tohum 42 --sema --cikti ornekler/churn`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `churn.csv` | 5000 | 382313 |
| `churn.sema.json` | - | 2157 |

## Bilinen yapı ve doğru cevaplar

- Gerçek katsayılar (logit): sabit −1,2 · aylık sözleşme +1,1 · kıdem_ay −0,04 · destek_talebi +0,35 · ödeme_gecikmesi +0,55 · kullanım_saat −0,03 · aylık_ücret/100 +0,08.
- eposta_acma_orani, yas, bolge, rastgele_ozellik churn'e DOĞRUDAN etki etmez; eposta_acma_orani gizli bir 'ilgi' değişkeni üzerinden kullanımla ilişkilidir.
- gercek_olasilik yalnız değerlendirme içindir; modele girdi yapmayın (sızıntı).

## Sütunlar

### churn

Bilinen nedensel yapılı churn kümesi. gercek_olasilik yalnız değerlendirme içindir.

Birincil anahtar: `musteri_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `musteri_id` | metin | evet | benzersiz; desen `^C\d{6}$` |  |
| `yas` | tam sayı | evet | [18, 80] |  |
| `bolge` | metin | evet | değerler: Akdeniz, Doğu Anadolu, Ege, Güneydoğu Anadolu, İç Anadolu, Karadeniz, Marmara |  |
| `sozlesme` | metin | evet | değerler: aylik, yillik, iki_yillik |  |
| `paket` | metin | evet | değerler: temel, standart, premium |  |
| `kidem_ay` | tam sayı | evet | [1, 72] |  |
| `aylik_ucret` | ondalık | evet | [0, ∞] |  |
| `kullanim_saat` | ondalık | evet | [0, ∞] |  |
| `eposta_acma_orani` | ondalık | evet | [0, 1] |  |
| `destek_talebi` | tam sayı | evet | [0, ∞] |  |
| `odeme_gecikmesi` | tam sayı | evet | [0, ∞] |  |
| `rastgele_ozellik` | ondalık | evet |  | saf gürültü; etkisi yok |
| `churn` | tam sayı | evet | değerler: 0, 1 | 1: müşteri ayrıldı |
| `gercek_olasilik` | ondalık | evet | [0, 1] | EĞİTİMDE KULLANMAYIN |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
