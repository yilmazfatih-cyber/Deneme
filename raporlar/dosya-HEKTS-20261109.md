# Hisse dosyası analizi — HEKTS

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 303 (30 bağımsız bölüm); ≥%10 yükseliş 143 gün (14 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +116.1% (t=1.6), gün içi (açılış→kapanış) toplam -95.9% (t=-4.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.0526 | 0.0308 | +0.90 |
| kar_buyume_yillik | -3.3 | -2.86 | -0.82 |
| ma200_uzaklik | -0.0538 | -0.151 | +0.63 |
| max_gunluk_20g | 0.0711 | 0.0465 | +0.49 |
| piyasa_degeri_mn | 3.49e+04 | 2.8e+04 | +0.47 |
| zirve_52h_yakinlik | 0.527 | 0.337 | +0.46 |
| zirveden_dusus | -0.473 | -0.663 | +0.46 |
| atr_20g_oran | 0.0404 | 0.036 | +0.46 |
| mom_12_1 | -0.231 | -0.223 | +0.45 |
| oynaklik_20g | 0.456 | 0.392 | +0.44 |
| aof_1g_sapma | 0.00461 | 9.63e-09 | +0.43 |
| satis_buyume_yillik | -0.187 | 0.027 | -0.38 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.0316 | 0.0405 | -0.72 |
| amihud_20g | 0.07 | 0.0355 | +0.63 |
| xu100_getiri_20g | 0.0498 | 0.00988 | +0.47 |
| beta_60g | 1.03 | 1.12 | -0.43 |
| satis_buyume_yillik | -0.16 | -0.187 | +0.39 |
| gunici_ort_20g | -0.00208 | -0.00443 | +0.37 |
| kar_buyume_yillik | -2.86 | -2.86 | +0.34 |
| kazanc_verimi | -0.148 | -0.13 | -0.31 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| devir_hizi_20g | 673 | 672 |  | -0.48 | 0.000 | +2.6% | -13.5% | 11% | 81% | 0.0121–0.0267 | 0.0702–0.149 |
| amihud_20g | 672 | 665 |  | +0.33 | 0.000 | -10.3% | +6.5% | 64% | 27% | 0.00971–0.0256 | 0.068–0.215 |
| atr_20g_oran | 672 | 661 |  | -0.28 | 0.000 | +0.4% | -12.6% | 18% | 73% | 0.0214–0.0302 | 0.0481–0.204 |
| piyasa_degeri_mn | 692 | 657 | seviye | -0.26 | 0.000 | +0.7% | -6.1% | 29% | 60% | 1.71e+04–2.6e+04 | 8.53e+04–1.57e+05 |
| oynaklik_20g | 672 | 669 |  | -0.24 | 0.000 | -2.2% | -12.4% | 30% | 70% | 0.214–0.296 | 0.529–2.41 |
| ivol_60g | 573 | 571 |  | -0.25 | 0.000 | -0.0% | -5.9% | 24% | 46% | 0.19–0.258 | 0.533–1.39 |
| pd_dd | 692 | 560 |  | -0.21 | 0.000 | +0.7% | -10.6% | 29% | 67% | 1.04–1.69 | 10.1–43.2 |
| kazanc_verimi | 643 | 499 |  | -0.22 | 0.000 | +0.7% | -16.3% | 36% | 69% | -0.321–-0.163 | -0.0603–-0.0103 |
| min_gunluk_20g | 672 | 65 |  | +0.21 | 0.000 | -17.1% | +1.3% | 62% | 37% | -0.648–-0.0743 | -0.0328–-0.0199 |
| max_gunluk_20g | 672 | 73 |  | -0.21 | 0.000 | -7.4% | -11.8% | 39% | 69% | 0.0157–0.0294 | 0.0952–0.0994 |
| ma200_uzaklik | 493 | 493 |  | -0.24 | 0.000 | +0.1% | -8.9% | 21% | 75% | -0.741–-0.494 | 0.00324–0.436 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.20 | 0.000 | +3.3% | -7.3% | 22% | 55% | -1.53–-1.03 | -0.113–0.302 |
| halka_aciklik | 692 | 31 | seviye | -0.18 | 0.000 | -1.9% | -13.0% | 47% | 62% | 0.248–0.446 | 0.446–0.528 |
| zirveden_dusus | 573 | 371 |  | -0.19 | 0.000 | -0.9% | -7.3% | 21% | 59% | -0.849–-0.814 | -0.347–-0.00998 |
| zirve_52h_yakinlik | 573 | 371 |  | -0.19 | 0.000 | -0.9% | -7.3% | 21% | 59% | 0.151–0.186 | 0.653–0.99 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.18 | 0.000 | -8.5% | +5.7% | 41% | 13% | -0.394–-0.354 | 0.48–0.533 |
| oynaklik_60g | 632 | 629 |  | -0.17 | 0.001 | -10.5% | -5.8% | 47% | 46% | 0.285–0.366 | 0.568–1.43 |
| beta_60g | 632 | 632 |  | -0.16 | 0.001 | +0.8% | -6.2% | 33% | 47% | 0.628–0.934 | 1.29–1.58 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bedelli | evet | 2 | +0.2% | +4.7% | +4.1% | -4.7% | 50% |
| faiz | hayır | 41 | +0.3% | +0.1% | -0.1% | -4.0% | 22% |
| siyasi | hayır | 17 | -0.1% | -0.0% | -0.2% | -3.8% | 41% |
| derecelendirme | hayır | 15 | -4.4% | +0.6% | +0.2% | +5.5% | 47% |
| jeopolitik | hayır | 10 | -0.9% | -0.3% | -0.3% | +3.5% | 70% |
| enflasyon | hayır | 9 | +1.1% | -0.0% | +2.7% | +0.2% | 22% |
| regulasyon | hayır | 6 | -1.8% | -1.6% | +1.9% | +0.8% | 33% |
| haber | hayır | 5 | +1.5% | +1.6% | -1.6% | -2.9% | 0% |
| kuresel_faiz | hayır | 5 | +0.2% | +2.1% | +0.3% | -7.2% | 20% |
| sok | hayır | 5 | -8.0% | -3.0% | -7.7% | -5.5% | 20% |
| tarife | hayır | 5 | +0.5% | +0.8% | +2.2% | -1.0% | 20% |
| kur | hayır | 4 | +1.1% | +0.1% | -0.1% | -4.3% | 50% |
| dusus | hayır | 3 | -1.9% | +0.1% | +3.1% | -2.8% | 67% |
| yukselis | hayır | 3 | +2.4% | +1.0% | +3.0% | +10.3% | 100% |
| butce_vergi | hayır | 2 | +0.0% | +1.9% | +1.1% | -8.6% | 0% |
| YÖN: notr | evet | 1 | - | +10.7% | +7.3% | +1.8% | nan% |
| YÖN: olumlu | evet | 1 | - | -1.4% | +1.0% | -11.1% | nan% |
| YÖN: olumsuz | evet | 2 | - | -0.6% | -6.3% | -6.9% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 181 deneme. Al-tut Sharpe: eğitim -0.98, test -1.10.
Eğitimde seçilen kural: **oynaklik_20g > 0.3043 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.12 → test Sharpe 0.17; testte nakitte kalma oranı 84%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -8.1%, test -2.9%.
Deflated Sharpe (deneme sayısı 181): 0.06 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.6% | -1.2 |
| haftanin_gunu | 1.0 | 142 | -0.4% | -2.1 |
| haftanin_gunu | 2.0 | 141 | -0.7% | -3.1 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.1 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.3 |
| ay_donusu | 0.0 | 521 | -0.2% | -1.2 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.6 |
| bayram_oncesi | 0.0 | 708 | -0.2% | -1.6 |
| bayram_oncesi | 1.0 | 5 | -1.2% | -1.1 |
| bayram_sonrasi | 0.0 | 707 | -0.2% | -1.7 |
| bayram_sonrasi | 1.0 | 6 | +0.1% | 0.1 |
| bilanco_sezonu | 0.0 | 422 | -0.4% | -2.1 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.0169, getiri_5g=0.0651, getiri_20g=-0.174, getiri_60g=-0.357, getiri_120g=-0.608, mom_12_1=-0.383, zirve_52h_yakinlik=0.363, zirveden_dusus=-0.637, oynaklik_20g=0.541, oynaklik_60g=0.527, atr_20g_oran=0.052, rsi_14=38.4, ma20_uzaklik=-0.0374, ma50_uzaklik=-0.191, ma200_uzaklik=-0.407, hacim_z_20=-0.227, amihud_20g=0.163, devir_hizi_20g=0.0271, gece_ort_20g=-0.00108, gunici_ort_20g=-0.00837, aof_1g_sapma=-0.00282, max_gunluk_20g=0.0893, min_gunluk_20g=-0.0471, ivol_60g=0.385, endekse_gore_1g=-0.00578, endekse_gore_20g=-0.131, endekse_gore_60g=-0.186, beta_60g=1.26, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.386, piyasa_degeri_mn=1.64e+04, halka_aciklik=0.488, kazanc_verimi=-0.334, pd_dd=0.998, snak_verimi=0.048, temettu_verimi=0, roe_ttm=-0.334, net_kar_marji=-0.813, satis_buyume_yillik=0.055, net_borc_ozkaynak=0.497, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0