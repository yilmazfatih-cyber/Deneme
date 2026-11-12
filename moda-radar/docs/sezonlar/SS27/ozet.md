# SS27 ilk çıktı — özet

> Yatırım tavsiyesi değildir; karar satın almacınındır.

Güncelleme: 2026-11-12 · model v0 · kural-0 · veri: 32 Vogue Runway defilesi, 1.883 look fotoğrafı, 7.532 parça rengi;
96 look'ta 263 giysi parçasının nitelik etiketi (siluet, kumaş, desen, detay); 171 rapor sinyali; perakende 231 ürün
(Beymen 96, Koton 48, DeFacto 47, Ipekyol 40).
Ayrıntı: `palet.md` (sezon paleti) ve `yatirim-<segment>.md` (kartlar).

## Podyum paleti (fotoğraf sayımı)

| Renk ailesi            | Pantone (örnek)               | Podyum payı | Defile | Okuma                                         |
| ---------------------- | ----------------------------- | ----------- | ------ | --------------------------------------------- |
| Siyah, gece            | 19-3911, 19-4203, 19-0000 TCX | ~%12        | 29     | Sezonun zemini                                |
| Koyu kahve             | 19-4008, 19-0840, 19-1106 TCX | ~%10        | 28     | "Kahve yeni siyah"                            |
| Kırık beyaz, kum       | 11-1001, 13-0002, 13-0907 TCX | ~%7         | 23     | Yazlık temel                                  |
| Grej, taş              | 15-4503, 16-1109 TCX          | ~%3         | 22     | Sıcak nötr                                    |
| Kuru domates kırmızısı | 19-1531 TCX                   | <%1         | 14     | Az ama yaygın; renkli tek güçlü aday          |
| Mor, lavanta           | 18-3633, 17-3615 TCX          | ~%1,5       | 2–20   | Raporlar öne çıkarıyor, fotoğraf sayımı değil |

## Siluet, kumaş, desen (fotoğraf etiketlerinden)

96 look, her defileden 3 kare (tasarımcı selamlama kareleri çıkarıldı), aksesuar hariç.

| Eksen  | Öne çıkanlar (payı, kaç defilede)                                                   | Okuma                                            |
| ------ | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Kumaş  | yünlü %17 (20), pamuklu %17 (16), ipeksi %16 (17), saten %13 (17), triko ve deri %8 | Yazlıkta bile terzilik: yünlü takım ve ceket     |
| Desen  | düz %73, çizgili %8, soyut %7, ekose %5, çiçekli %4                                 | Desen az; çiçekli raporlardaki kadar güçlü değil |
| Siluet | dar %23, düz %22, oversize %19, bol %14, A kesim %11                                | İkili: dar üst ile bol alt dengesi               |
| Boy    | kalça %25, maksi %21, diz üstü %14, midi ve diz %12                                 | Maksi etek ve pantolon güçlü                     |
| Detay  | yok %43, kapaklı cep %12, nakış %10, fırfır %8                                      | Sade yüzey, işçilik detayda                      |

Etiket uyumu (Sonnet toplu, Opus denetim, 11 parça çifti): desen, kategori, yaka, kol ≥ 0,85; siluet 0,68, kumaş 0,75;
doku ve renk sayısı zayıf. Örneklem küçük; haftalık etiketleme oturumu her hafta 120 görsel ekleyecek.

## Segment kararları (kadın üst)

| Segment               | YATIR                                                            | DENE                                    | BEKLE / GİRME           |
| --------------------- | ---------------------------------------------------------------- | --------------------------------------- | ----------------------- |
| Premium (Ipekyol)     | — (oversize keten gömlekte sinyaller çelişkili)                  | —                                       | 12 kartın hepsi BEKLE   |
| Orta (Koton, DeFacto) | Düz pamuklu üst: kırık beyaz 11-0601, kahve 19-1214, bej 14-1118 | Siyah, cikori kahvesi 19-1419, antrasit | —                       |
| Değer (Addax)         | —                                                                | Siyah, kahve, antrasit, bej (SS28 için) | —                       |
| Lüks (Beymen)         | Yapılı omuz ipeksi üst: meteor 19-4008, siyah, turba 19-0508     | Bej, lavanta                            | GİRME: bir renk çıkışta |
| Pazar                 | Bol pamuklu çiçekli üst, siyah ve kırık beyaz                    | Kahve, bej, çelik grisi                 | Lavanta, bordo, sarı    |

9 Kasım'a göre değişenler: gecikme hesabındaki sol sansür hatası düzeltildi (ilk taramada rafta olan ürün artık
"gecikme" sayılmıyor). Lüks segment "geç" yerine "zamanında" çıktı ve YATIR aldı; premium'da varsayılan ürün
(oversize keten) eksenler arasında çelişkili sinyal verdiği için BEKLE'ye döndü. Kararlar v0 modelinde hâlâ
hassas; tek tek ürün sorusu (`/moda`) segment tablosundan daha güvenilir okumadır.

## Editör notu

- En güvenli tez siyah, koyu kahve ve kırık beyaz ekseni; her segmentte ve her kaynakta tutarlı.
- Ramazan 2027 Şubat ortasında başlıyor; orta ve değer segmentte kapalı yaka, uzun kol düz üstler Mart rafında kahve ve bej ile şanslı.
- Lavanta raporlarda var, fotoğraf sayımında yok; Türkiye orta segmentte tarihsel olarak zayıf. BEKLE doğru.
- "Erken" çıkan kararlar bugün sipariş değil, bir sonraki sezon notudur.

## Sınırlar

- Tek sezon fotoğraf verisi: yön hesabı FW26 fotoğrafları gelince gerçekleşecek.
- Siyahın payı koyu podyum zemini yüzünden biraz şişkin olabilir.
- Gecikmeler önsel: perakende taraması 9 Kasım'da başladı, ilk gerçek ölçüm yeni ürünler rafa çıktıkça birikecek.
- SS27 rafına inecek ürün SS26 podyumundan gelir; SS26 için yalnız rapor sinyali var, fotoğraf sayımı yok.
- Maliyet bantları tahmini; Addax henüz taranamıyor.
