# Hisse dosyası analizi — TAVHL

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 147 (25 bağımsız bölüm); ≥%10 yükseliş 251 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +128.0% (t=2.5), gün içi (açılış→kapanış) toplam +22.5% (t=0.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.02e+05 | 9.35e+04 | +0.87 |
| xu100_ma200_uzaklik | 0.141 | 0.0564 | +0.85 |
| getiri_120g | 0.157 | 0.00565 | +0.82 |
| ma200_uzaklik | 0.0635 | -0.0192 | +0.56 |
| zirveden_dusus | -0.107 | -0.171 | +0.55 |
| zirve_52h_yakinlik | 0.893 | 0.829 | +0.55 |
| halka_aciklik | 0.493 | 0.492 | +0.54 |
| xu100_getiri_20g | 0.0373 | 0.0048 | +0.49 |
| mom_12_1 | 0.208 | 0.074 | +0.45 |
| pd_dd | 1.52 | 1.38 | +0.40 |
| net_borc_ozkaynak | 0.87 | 0.939 | -0.32 |
| devir_hizi_20g | 0.0125 | 0.0133 | -0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 8.68e+04 | 9.81e+04 | -0.85 |
| halka_aciklik | 0.49 | 0.492 | -0.78 |
| ivol_60g | 0.259 | 0.286 | -0.56 |
| atr_20g_oran | 0.0336 | 0.0298 | +0.52 |
| mom_12_1 | 0.0445 | 0.129 | -0.43 |
| snak_verimi | 0.0733 | 0.0778 | -0.43 |
| endekse_gore_60g | 0.063 | 0.01 | +0.41 |
| net_kar_marji | 0.175 | 0.0575 | +0.39 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| halka_aciklik | 692 | 42 | seviye | -0.39 | 0.000 | +10.4% | -0.9% | 12% | 27% | 0.47–0.49 | 0.496–0.497 |
| piyasa_degeri_mn | 692 | 687 | seviye | -0.52 | 0.000 | +14.7% | -3.1% | 0% | 41% | 4.04e+04–8.48e+04 | 1.04e+05–1.35e+05 |
| mom_12_1 | 441 | 438 |  | -0.36 | 0.000 | +6.0% | -2.4% | 10% | 33% | -0.26–-0.0185 | 0.385–1.6 |
| zirve_52h_yakinlik | 573 | 426 |  | -0.29 | 0.000 | +4.6% | -1.6% | 7% | 27% | 0.666–0.77 | 0.946–1.04 |
| zirveden_dusus | 573 | 406 |  | -0.29 | 0.000 | +4.6% | -1.6% | 7% | 27% | -0.334–-0.23 | -0.0542–0 |
| getiri_120g | 573 | 572 |  | -0.25 | 0.000 | +3.9% | -6.1% | 8% | 57% | -0.256–-0.0823 | 0.273–1.37 |
| ivol_60g | 573 | 572 |  | -0.25 | 0.000 | +4.7% | -2.7% | 12% | 33% | 0.219–0.24 | 0.298–0.329 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.25 | 0.000 | +5.2% | -3.9% | 9% | 56% | -0.118–-0.0163 | 0.144–0.312 |
| xu100_getiri_20g | 673 | 671 |  | -0.20 | 0.000 | +5.3% | -1.2% | 7% | 34% | -0.166–-0.0409 | 0.0783–0.222 |
| amihud_20g | 672 | 659 |  | +0.20 | 0.000 | -2.0% | +2.7% | 27% | 17% | 0.0179–0.0238 | 0.0392–0.0568 |
| atr_20g_oran | 672 | 660 |  | +0.19 | 0.000 | -2.0% | +3.6% | 34% | 27% | 0.0192–0.0265 | 0.0366–0.0467 |
| fk | 643 | 635 |  | -0.19 | 0.000 | +7.7% | -1.0% | 16% | 33% | 7.46–10.2 | 24.7–50 |
| kazanc_verimi | 643 | 581 |  | +0.19 | 0.000 | -1.0% | +7.7% | 33% | 16% | 0.02–0.0404 | 0.0984–0.134 |
| beta_60g | 632 | 632 |  | +0.19 | 0.000 | -2.7% | +1.1% | 35% | 27% | 0.54–0.735 | 1.01–1.38 |
| endekse_gore_60g | 633 | 632 |  | +0.18 | 0.000 | +1.9% | +6.6% | 20% | 14% | -0.314–-0.112 | 0.153–0.471 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.17 | 0.000 | +0.0% | +7.6% | 29% | 15% | -0.163–-0.0127 | 0.221–0.457 |
| ma200_uzaklik | 493 | 493 |  | -0.19 | 0.001 | +6.2% | -0.7% | 0% | 25% | -0.148–-0.0702 | 0.154–0.395 |
| devir_hizi_20g | 673 | 654 |  | +0.15 | 0.007 | +0.7% | +6.8% | 21% | 11% | 0.00504–0.0103 | 0.0167–0.0278 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.4% | -0.1% | -0.1% | -1.2% | 26% |
| siyasi | hayır | 9 | -1.1% | +1.2% | -0.1% | +0.9% | 56% |
| enflasyon | hayır | 6 | +0.9% | +1.1% | +1.4% | -0.2% | 33% |
| jeopolitik | hayır | 5 | -1.8% | +0.3% | -3.7% | +0.3% | 80% |
| sok | hayır | 5 | -4.2% | +4.6% | +10.7% | +13.2% | 100% |
| tarife | hayır | 5 | +2.0% | -0.7% | -2.4% | -0.7% | 40% |
| derecelendirme | hayır | 4 | +0.9% | +0.3% | -3.2% | -4.3% | 25% |
| dusus | hayır | 3 | +0.5% | +1.5% | +1.2% | +0.9% | 67% |
| yukselis | hayır | 3 | +2.9% | -0.2% | +0.0% | -4.9% | 33% |
| butce_vergi | hayır | 2 | -1.2% | -0.9% | +0.3% | -3.7% | 0% |
| kur | hayır | 2 | -1.7% | +1.7% | +3.4% | +8.8% | 100% |
| YÖN: olumsuz | evet | 1 | - | -0.5% | -9.8% | -14.6% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 223 deneme. Al-tut Sharpe: eğitim 1.55, test 0.70.
Eğitimde seçilen kural: **zirve_52h_yakinlik > 0.8089 ise nakde geç** (kantil 0.2). Eğitim Sharpe 3.04 → test Sharpe 1.04; testte nakitte kalma oranı 46%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.9%, test +0.5%.
Deflated Sharpe (deneme sayısı 223): 0.17 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.3 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.1 |
| haftanin_gunu | 2.0 | 141 | +0.4% | 1.8 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 1.1 |
| haftanin_gunu | 4.0 | 143 | +0.3% | 1.9 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.7 |
| ay_donusu | 1.0 | 192 | +0.2% | 1.1 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 2.1 |
| bayram_oncesi | 1.0 | 5 | -1.0% | -1.7 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.9 |
| bayram_sonrasi | 1.0 | 6 | +1.2% | 0.9 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.6 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.2 |

## Son durum (en yeni satır)

getiri_1g=0.0299, getiri_5g=0.153, getiri_20g=0.0993, getiri_60g=0.0903, getiri_120g=0.17, mom_12_1=0.00641, zirve_52h_yakinlik=0.821, zirveden_dusus=-0.179, oynaklik_20g=0.432, oynaklik_60g=0.389, atr_20g_oran=0.0366, rsi_14=64.6, ma20_uzaklik=0.113, ma50_uzaklik=0.115, ma200_uzaklik=0.0441, hacim_z_20=-0.223, amihud_20g=0.0223, devir_hizi_20g=0.0184, gece_ort_20g=-0.00146, gunici_ort_20g=0.00506, aof_1g_sapma=0.0129, max_gunluk_20g=0.047, min_gunluk_20g=-0.054, ivol_60g=0.295, endekse_gore_1g=0.0137, endekse_gore_20g=0.148, endekse_gore_60g=0.267, beta_60g=0.874, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.0409, piyasa_degeri_mn=1.1e+05, halka_aciklik=0.491, fk=18.4, kazanc_verimi=0.0544, pd_dd=1.34, fd_favok=5.86, snak_verimi=0.113, temettu_verimi=0.012, roe_ttm=0.0727, net_kar_marji=0.132, satis_buyume_yillik=0.369, net_borc_ozkaynak=1.15, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1