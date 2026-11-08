# Karne: nasıl okunur

Her model sürümünün geriye test sonucu burada `<surum>.md` olarak durur (ilke 5). Sentetik veriyle üretilen karne
`<surum>-sentetik.md` adını taşır ve en üstte **"GERÇEK VERİ DEĞİLDİR"** uyarısıyla başlar. Sentetik karne yalnız
yöntemin mekaniğini (gecikmeyi geri bulma, kilit, ölçüt hesabı) sınar. İleri tahmin raporu ona dayanamaz.

| Dosya                              | İçerik                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| [`v0-sentetik.md`](v0-sentetik.md) | Sürüm 0, sentetik veri, SS25 + FW25, orta segment, kadın üst |

Üretmek için:

```bash
python -m moda_radar geriye-test --tahmin SS25 --veri-kadar 2024-09-30 --segment orta --kategori kadin-ust [--sentetik]
```

Komut, kapı geçilirse 0, geçilmezse 2 ile çıkar.

## Soru

Her satır şunu sorar: _"`veri_kadar` tarihinde elimizdeki veriyle, `tahmin_sezonu` podyumundaki her nitelik değeri
için segmentin rafında ufuk sezonunda raf payı ≥ eşik (varsayılan %4) olma olasılığını ne kadar iyi verdik?"_

- **Zaman kilidi:** `veri_kadar` sonrasında yayımlanan sinyal ve ilk kez görülen raf kaydı okunmaz. Kalan
  kayıtların son görülme tarihi kilit tarihine kırpılır.
- **Ufuk:** podyum sezonunun defile tarihi + segment gecikmesi, Türkiye raf takvimine oturtulur
  (SS rafı Ocak–Mart girişli, FW rafı Temmuz–Eylül girişli). Örnek: orta segment, 3 sezon, SS25 → SS26-Mart.
- **Gerçekleşme:** ufuk raf sezonu penceresiyle en az 60 gün örtüşen ve raf payı ≥ eşik olan gözlem.

## Sütunlar

| Sütun               | Anlamı                                                                                                          | İyi yön                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Gecikme             | Segment gecikmesi (sezon). Kaynak `olculen` (n ≥ 8 yeni giriş), `karma` (3–7, önselle ağırlıklı), `onsel` (< 3) | Ölçülen ve önsel ayrı okunur |
| n tahmin / n gerçek | Tahmin edilen değer sayısı / eşiği gerçekten aşan sayı                                                          | —                            |
| Brier               | Ortalama (olasılık − sonuç)². Hep 0,5 demek 0,25 alır                                                           | Düşük                        |
| İlk-10 isabet       | En olası 10 değerden eşiği gerçekten aşanların oranı. Renkte ileride ΔE2000 < 6 eşlemesi kullanılacak           | Yüksek                       |
| Doğruluk            | olasılık ≥ 0,5 ile sonuç aynı mı                                                                                | Yüksek                       |
| Kalibrasyon         | 5 eşit kova; her kovada ortalama olasılık ve gerçekleşme oranı                                                  | İki sütun birbirine yakın    |

## Tabanlar ve kapı

- **(a) Önceki raf payı aynen:** kilit anında bilinen son raf payı sürer; olasılık `0,5 · raf / eşik` (0,05–0,95).
  Rafta hiç kaydı olmayan değer için 0,05.
- **(b) Pantone sezon raporu:** veri hattı yok. Karşılaştırmaya girmez, karnede "veri yok" yazılır.
- **(c) Yalnız podyum payı:** payın sıra yüzdeliği olasılık sayılır; sıralama paya göre yapılır.

**Kapı:** model her tabana karşı Brier'de daha düşük **ve** ilk-10 isabette en az onun kadar olmalı. Bu, test
edilen her sezonda ayrı ayrı aranır. En az iki geçmiş sezonun hepsi geçmeden "Rapor üretilebilir: evet" yazmaz
(`geriye_test.calistir` → `rapor_uretilebilir`).

## Dikkat

- İlk-10 isabeti 10 öğelik küçük bir örneklemdir ve tek sezonda gürültülüdür. Sentetik karnedeki tohum
  sağlamlık tablosu bunun ne kadar oynadığını gösterir.
- Sürüm 0 katsayıları elle seçilmiştir (`moda_radar/tahmin/model.py` başındaki formül). Sürüm 1 bu katsayıları
  geriye test verisiyle öğrenecek ve bu karneyi geçtiğini göstermeden yayımlanmayacak.
- Nitelik yön doğruluğu ve yatırım ölçütleri ("YATIR → gerçek artış") gerçek veri hattı kurulunca eklenecek.
