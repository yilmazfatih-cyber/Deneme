# Veri kartı: zaman_serisi

> **UYDURMA VERİ.** Kişi, şirket, kimlik/vergi numarası, IBAN, telefon ve adresler gerçek değildir; numaraların yalnız sağlama haneleri geçerlidir. Gerçek bir kişiyi tanımlamak için kullanmayın.

## Amaç

İki günlük seri: eğilim, mevsimsellik, tatil etkisi, etiketli anomali.

## Üretim

- Komut: `python -m verihavuzu uret zaman_serisi --adet 730 --tohum 42 --sema --cikti ornekler/zaman_serisi`
- Tohum: 42 · üreteç: verihavuzu 0.1.0
- Aynı komut aynı baytları üretir (`tests/test_ornekler.py` denetler).

## Dosyalar

| Dosya | Satır | Bayt |
| --- | --- | --- |
| `zaman_serisi.csv` | 1460 | 92909 |
| `zaman_serisi.sema.json` | - | 1462 |

## Bilinen yapı ve doğru cevaplar

- beklenen = egilim × haftalik_etki × yillik_etki × (tatilse 0,55).
- anomali=true satırlar gerçek cevaptır (ani_artis, ani_dusus, seviye_kaymasi, eksik).

## Sütunlar

### zaman_serisi

Günlük sentetik seri; bileşenler ve anomali etiketleri ayrı sütunlarda.

Birincil anahtar: `seri_id, tarih`

| Sütun | Tür | Zorunlu | Kurallar | Açıklama |
| --- | --- | --- | --- | --- |
| `seri_id` | metin | evet | desen `^S\d+$` |  |
| `tarih` | tarih | evet |  |  |
| `deger` | ondalık | hayır | [0, ∞] | eksik anomalide boş |
| `beklenen` | ondalık | evet | [0, ∞] | gürültüsüz, anomalisiz değer |
| `egilim` | ondalık | evet |  | seviye + eğim × gün |
| `haftalik_etki` | ondalık | evet | [0, ∞] |  |
| `yillik_etki` | ondalık | evet | [0, ∞] |  |
| `tatil` | mantıksal | evet |  |  |
| `anomali` | mantıksal | evet |  |  |
| `anomali_turu` | metin | hayır | değerler: ani_artis, ani_dusus, seviye_kaymasi, eksik |  |

## Sınırlar

- Dağılımlar ve oranlar KURGUSALDIR; gerçek bir nüfus, pazar ya da kurum istatistiği değildir.
- Ad/soyad listeleri ve adres kalıpları `tr/` klasöründendir; sıklık bilgisi taşımaz.

## Lisans

Bu depodaki kodla üretildi; üçüncü taraf içerik ya da gerçek kişi verisi içermez. Deponun lisansı proje sahibince belirlenir.
