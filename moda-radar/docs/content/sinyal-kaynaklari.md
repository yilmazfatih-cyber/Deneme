# Sinyal kaynakları: rapor kaynaklı başlangıç verisi

Tarama tarihi: 2026-11-08 · Hazırlayan: moda-editoru · Dosyalar: `content/sinyaller/{SS27,FW26,SS26,FW25,SS25}.json`,
`content/gozlemler/TR-rapor.json`.

Bu veri, görsel sayımı (GitHub Actions) gelene kadar sistemin ilk günden cevap verebilmesi için **rapor kaynaklı tohumdur**.
Tüm kayıtlarda `kaynak_turu: "rapor"`. Bu oturumda vogue.com, tagwalk.com, marka siteleri ve doğrudan sayfa çekme (WebFetch)
ağda kapalıydı. Sayfalar yalnız **arama motoru özetleriyle** okundu; her `kaynak_url` aramada gerçekten dönen bir adrestir.

## Sayılar

| Sezon  | Renk | Diğer nitelik | Toplam |
| ------ | ---- | ------------- | ------ |
| SS27   | 34   | 14            | 48     |
| FW26   | 20   | 13            | 33     |
| SS26   | 30   | 10            | 40     |
| FW25   | 16   | 8             | 24     |
| SS25   | 22   | 4             | 26     |
| Toplam | 122  | 49            | 171    |

TR gözlem: 16 kayıt (LC Waikiki 9, Altınyıldız Classics 6, Elle ayakkabı 1). Hepsi `orta` segmenti.

## Kaynaklar ve ne alındı

| Kaynak                                                                                                                        | Ne alındı                                                                                     | Sezonlar                                                       | Güven                         |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------- |
| Pantone Fashion Color Trend Report, New York (pantone.com, FashionUnited, Diary Directory, MR Magazine)                       | İlk 10 + mevsimsiz nötrler, TCX kodlu                                                         | SS27, FW26, SS26, FW25, SS25 (9 renk)                          | İlk 10: 0,6 · nötr: 0,5       |
| Pantone Fashion Color Trend Report, Londra (FashionUnited, Chic Style Collective)                                             | Kısmi liste, sıra bilinmiyor                                                                  | yalnız SS26                                                    | 0,5 / blog 0,4                |
| T-Fashion (tfashion.ai) görüntü sayımı                                                                                        | "Share of looks" yüzdeleri: renk, desen, kumaş, anahtar parça; önceki sezon karşılaştırmaları | SS27, FW26, SS26; FW25 ve SS25 yalnız karşılaştırma sütunundan | Küresel: 0,6 · tek şehir: 0,5 |
| WGSN / Coloro                                                                                                                 | 2027 yılın rengi Luminous Blue (öngörü)                                                       | SS27                                                           | 0,4                           |
| Fashionista, Who What Wear, Refinery29, Coveteur, Net-a-Porter, FASHION Magazine, E! Online, Marie Claire, Gorgeautiful, blog | Editoryal trend özetleri                                                                      | tümü                                                           | 0,4                           |
| Mall Report, Gazete Oksijen, Paradergi                                                                                        | TR perakende koleksiyon haberleri                                                             | gözlem                                                         | —                             |

## Kestirim kuralları

- **Pantone ilk 10:** rapordaki listeleme sırasına göre `podyum_payi` 0,060 → 0,030 doğrusal azalır (0,0033 adım).
  Sıra Pantone'un sunum sırasıdır, sayım sırası değildir. Mevsimsiz nötrler 0,02.
- **Pantone Londra SS26:** sıra doğrulanamadığından sabit 0,04.
- **T-Fashion:** yayımlanan yüzde doğrudan `podyum_payi` olarak yazıldı (ör. siyah SS27 %35,2 → 0,352). Tek şehir değeri ise `not`'ta belirtildi.
- **Editoryal yazı:** "en çok görülen / en büyük trend" denen nitelik 0,05; diğerleri 0,02.
- **marka_sayisi:** yazıda adı geçen marka sayısı; bilinmiyorsa 3 (T-Fashion marka sayısı yayımlamıyor; hepsi 3).
- **kaynak_tarihi:** yayın tarihi biliniyorsa o (Pantone duyuruları, URL'de tarih olan haberler). URL'de yalnız ay varsa ay sonu.
  Bilinmiyorsa tarama tarihi 2026-11-08. Bu zaman kilidinde ihtiyatlıdır: geriye testte bu kayıtlar geç tarihli sayılır.

## Renk kodu eşlemesi

Renk her zaman TCX koduyla yazıldı. Rapor kod verdiyse ve kod `content/pantone/tcx.json`'da varsa doğrudan kullanıldı.
Yeni Pantone renkleri yerel dosyada yok; kod yapısına (açıklık-ton-doygunluk) göre en yakın kod seçildi ve `not`'ta yazıldı:

| Rapordaki renk              | Rapor kodu                  | Yazılan kod                           |
| --------------------------- | --------------------------- | ------------------------------------- |
| Rosy Future (SS27)          | 15-1910                     | 15-1912 TCX (Sea Pink)                |
| Lavender Oil (SS27)         | 15-3615                     | 15-3716 TCX (Purple Rose)             |
| Dolphin (SS27 nötr)         | 16-2901                     | 16-3801 TCX (Opal Gray)               |
| Green Envy (FW26)           | 16-0541 (ikincil kaynak)    | 16-0540 TCX (Oasis)                   |
| All Aboard (FW26)           | 17-4140                     | 17-4139 TCX (Azure Blue)              |
| Alexandrite (SS26)          | 18-4835                     | 18-4834 TCX (Deep Lake)               |
| Lava Falls (SS26)           | 18-1552 / 17-1664 çelişkili | 18-1551 TCX (Aura Orange)             |
| Dutch Canal (LFW SS26)      | 14-4124                     | 14-4122 TCX (Airy Blue)               |
| Tickled Pink (LFW SS26)     | 14-1910                     | 14-1911 TCX (Candy Pink)              |
| Winterberry (FW25)          | 17-1640                     | 17-1641 TCX (Chrysanthemum)           |
| White Grape (SS25)          | 14-0442                     | 14-0445 TCX (Bright Chartreuse)       |
| Misted Marigold (SS25)      | 14-0747                     | 14-0848 TCX (Mimosa)                  |
| Luminous Blue (WGSN/Coloro) | Coloro 125-28-38            | 18-3949 TCX (Dazzling Blue), yaklaşık |

T-Fashion ve editoryal yazılardaki adlar ("sand", "midnight blue", "burgundy", "marigold") yerel dosyada ad eşlemesiyle koda çevrildi.
T-Fashion white için 17-4919 yazıyor; bu bir camgöbeği kodu olduğundan 11-0601 TCX (Bright White) kullanıldı.
TR haberlerindeki Türkçe adlar (acı kahve, bordo, mürdüm, zümrüt, bej, ekru, lacivert, haki, kum) da ad eşlemesiyle çevrildi; liste `TR-rapor.json` `kaynak_notu`'nda.

## Nitelik eşlemesi (taksonomi dışı terimler)

| Kaynak terimi        | Eksen = değer            |
| -------------------- | ------------------------ |
| straight skirt       | siluet = duz             |
| balloon pants        | siluet = bol             |
| peplum               | siluet = beli-vurgulu    |
| cocoon coat          | siluet = oversize        |
| maxi dress           | boy = maksi              |
| drop shoulder jacket | kol = dusuk-omuz         |
| sheer                | kumas_gorunumu = tul     |
| poplin               | kumas_gorunumu = pamuklu |
| 3B çiçek aplike      | detay = nakis            |
| checked, plaid       | desen = ekose            |
| abstract             | desen = soyut            |

Taksonomide karşılığı olmayan terimler alınmadı: twill, jersey, kürk, tailored pants, bra top, fringe, crinkled (doku ekseni sinyal ekseni değil).

## Eksikler

- **Londra raporu:** SS27, FW26 için Pantone Londra raporu bulunamadı. SS26 Londra listesi kısmi.
- **SS25 Pantone:** ilk 10'un yalnız 9'u bulundu.
- **FW26 nötr:** Underworld'ün kodu bulunamadı, yazılmadı.
- **Tagwalk ve Vogue Runway:** site kapalı, arama sonuçlarında sayım bulunamadı. Vogue SS27 trend raporu yalnız ikinci el özetle görüldü, kullanılmadı.
- **FW25 ve SS25 nitelikleri:** az (8 ve 4). T-Fashion bu sezonların sayfalarını dizinlemiyor; değerler sonraki sezon sayfalarındaki karşılaştırma sütunundan.
- **T-Fashion tutarsızlığı:** SS26 siyahı SS26 sayfasında %22,1, SS27 sayfasında %32,4. FW26 saten kumaş sıralamasında %16,7, şehir sayfalarında farklı. Anlık görüntü ve kapsam farkı olabilir.
- **TR gözlem:** Zara TR, Koton, DeFacto, Beymen, Ipekyol, Addax, Trendyol için tarihli ve doğrulanabilir koleksiyon haberi bulunamadı.
  Koton yazıları tarihsiz blog; DeFacto bordo haberleri 2024 ve öncesi; Beymen/Ipekyol 2026 palet haberlerinin tarihi doğrulanamadı.
  `deger`, `pazar`, `luks`, `premium` segmentleri için kayıt yok. Altınyıldız Classics `orta` sayıldı (orta-üst fiyat).

## Görsel sayımı gelince ne değişir

1. GitHub Actions'taki görsel hattı aynı sezon için `kaynak_turu: "gorsel"` kayıtları üretir. Bunlar sayıma dayalıdır, güvenleri yüksektir (0,8+).
2. Aynı (sezon, eksen, değer) için görsel kaydı varsa model rapor kaydını **önsel** olarak kullanmalı ya da ağırlığını düşürmelidir.
   Görsel yoksa rapor kaydı tek başına kalır, düşük güveniyle.
3. Pantone sıradan türetilmiş paylar ilk değiştirilmesi gerekenlerdir: gerçek küme payıyla karşılaştırılıp ΔE2000 ile eşleşen küme payı yazılır.
4. Yaklaşık kod eşlemeleri, görsel hattın Lab → ΔE2000 eşlemesiyle sınanmalıdır. Yeni Pantone renklerinin (2025-2026) resmi hex değerleri
   `content/pantone/tcx.json`'a eklenirse yukarıdaki tablo düzeltilir.
5. T-Fashion payları görsel sayımımızla karşılaştırılarak kaynak kalibrasyonu yapılabilir (aynı sezon, aynı nitelik; fark > 5 puan ise not edilir).
6. TR gözlemleri perakende taraması (`topla --kaynak perakende`) geldiğinde `kaynak_turu: "site"` kayıtlarıyla doğrulanır; `urun_sayisi` ve `raf_payi` dolar.
