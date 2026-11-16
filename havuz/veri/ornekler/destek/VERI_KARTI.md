# Veri kartı: destek

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Kalıptan üretilmiş kısa destek talepleri (tablo/arayüz denemesi).

## Üretim

- Komut: `python -m verihavuzu uret destek --adet 600 --tohum 42 --sema --cikti ornekler/destek`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `destek_talepleri.csv` | 600 | 75331 |
| `destek_talepleri.sema.json` | - | 1677 |

## Bilinen yapı ve doğru cevaplar

- Metinler ~40 kalıptan üretilir; dil modeli eğitim verisi değildir.
- Açık taleplerde cozum_suresi_saat ve memnuniyet boştur.

## Sütunlar

### destek_talepleri

Kalıptan üretilmiş kısa destek talepleri (uydurma).

Birincil anahtar: `talep_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `talep_id` | metin | evet | benzersiz; desen `^T\d{6}$` |  |
| `musteri_id` | metin | evet | desen `^M\d{6}$` |  |
| `olusturma_zamani` | zaman | evet |  |  |
| `kanal` | metin | evet | değerler: e-posta, telefon, canlı destek, uygulama içi |  |
| `kategori` | metin | evet | değerler: kargo, iade, odeme, urun, hesap, fatura |  |
| `oncelik` | metin | evet | değerler: dusuk, normal, yuksek, acil |  |
| `metin` | metin | evet |  |  |
| `durum` | metin | evet | değerler: acik, beklemede, cozuldu, kapandi |  |
| `cozum_suresi_saat` | ondalık | hayır | [0, ∞] |  |
| `memnuniyet` | tam sayı | hayır | [1, 5] |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
