# Veri kartı: web_olaylari

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

Web oturumları ve satın alma hunisi (JSONL).

## Üretim

- Komut: `python -m verihavuzu uret web_olaylari --adet 800 --tohum 42 --bicim jsonl --sema --cikti ornekler/web_olaylari`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `web_olaylari.jsonl` | 3313 | 709472 |
| `web_olaylari.sema.json` | - | 1461 |

## Bilinen yapı ve doğru cevaplar

- Huni: sayfa_goruntuleme → urun_goruntuleme → sepete_ekle → odeme_baslat → satin_al.
- Bir oturumda olaylar zamanla artar; satin_al varsa öncesinde odeme_baslat vardır.

## Sütunlar

### web_olaylari

Uydurma web olay günlüğü (oturum ve huni).

Birincil anahtar: `olay_id`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `olay_id` | metin | evet | benzersiz; desen `^E\d{7}$` |  |
| `oturum_id` | metin | evet | desen `^O\d{6}$` |  |
| `kullanici_id` | metin | hayır | desen `^M\d{6}$` |  |
| `zaman` | zaman | evet |  |  |
| `olay` | metin | evet | değerler: sayfa_goruntuleme, urun_goruntuleme, sepete_ekle, odeme_baslat, satin_al |  |
| `sayfa` | metin | evet | desen `^/` |  |
| `urun_id` | metin | hayır | desen `^U\d{4}$` |  |
| `cihaz` | metin | evet | değerler: mobil, masaustu, tablet |  |
| `kaynak` | metin | evet | değerler: organik, dogrudan, reklam, sosyal, eposta |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
