# Hisse dosyası analizi — ASTOR

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 263 (25 bağımsız bölüm); ≥%10 yükseliş 300 gün (28 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +380.0% (t=3.2), gün içi (açılış→kapanış) toplam -65.6% (t=-1.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| min_gunluk_20g | -0.055 | -0.0441 | -0.47 |
| piyasa_degeri_mn | 1.19e+05 | 1.05e+05 | +0.44 |
| oynaklik_60g | 0.484 | 0.426 | +0.43 |
| mom_12_1 | 0.429 | 0.154 | +0.41 |
| pd_dd | 6.36 | 5.28 | +0.41 |
| net_kar_marji | 0.195 | 0.22 | -0.39 |
| temettu_verimi | 0.00788 | 0.0119 | -0.39 |
| ivol_60g | 0.372 | 0.352 | +0.38 |
| xu100_ma200_uzaklik | 0.0367 | 0.0754 | -0.34 |
| oynaklik_20g | 0.497 | 0.426 | +0.34 |
| fd_favok | 11.3 | 10.9 | +0.32 |
| fk | 15.5 | 14.6 | +0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| net_kar_marji | 0.22 | 0.193 | +0.57 |
| kar_buyume_yillik | 0.51 | 0.526 | -0.49 |
| satis_buyume_yillik | 0.159 | 0.296 | -0.48 |
| temettu_verimi | 0.0123 | 0.00828 | +0.42 |
| snak_verimi | 0.0164 | 0.016 | -0.40 |
| min_gunluk_20g | -0.0441 | -0.0487 | +0.37 |
| mom_12_1 | 0.0426 | 0.385 | -0.36 |
| xu100_ma200_uzaklik | 0.0889 | 0.054 | +0.34 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temettu_verimi | 693 | 442 |  | +0.32 | 0.000 | -2.8% | +8.1% | 46% | 22% | 0–0.00739 | 0.0144–0.0202 |
| pd_dd | 692 | 679 |  | -0.30 | 0.000 | +9.1% | -3.9% | 20% | 55% | 3.13–4.08 | 7.29–17.8 |
| mom_12_1 | 441 | 441 |  | -0.33 | 0.000 | +14.0% | -9.5% | 24% | 60% | -0.183–-0.0266 | 1.53–3.07 |
| ivol_60g | 573 | 573 |  | -0.29 | 0.000 | +13.4% | +0.4% | 17% | 51% | 0.227–0.314 | 0.476–0.68 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | -0.26 | 0.000 | +5.9% | -14.9% | 26% | 68% | -0.543–0.369 | 1.2–4.43 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.24 | 0.000 | -0.9% | +14.4% | 39% | 9% | 0.0985–0.133 | 0.501–0.533 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.24 | 0.000 | +16.4% | -7.5% | 17% | 51% | 0.229–0.241 | 0.497–0.497 |
| usdtry_getiri_20g | 672 | 664 |  | -0.23 | 0.000 | +7.1% | -2.7% | 25% | 50% | -0.013–0.00947 | 0.019–0.0482 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.21 | 0.000 | +8.7% | +0.6% | 22% | 52% | 6.68e+04–9.56e+04 | 1.94e+05–3.67e+05 |
| min_gunluk_20g | 672 | 76 |  | +0.20 | 0.000 | -6.7% | +7.8% | 55% | 17% | -0.11–-0.07 | -0.0339–-0.00858 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.23 | 0.000 | -1.8% | +13.7% | 46% | 19% | -0.118–-0.0163 | 0.144–0.312 |
| oynaklik_60g | 632 | 629 |  | -0.18 | 0.000 | +9.4% | -8.3% | 28% | 66% | 0.343–0.398 | 0.576–0.81 |
| devir_hizi_20g | 673 | 668 |  | -0.16 | 0.002 | +7.8% | -2.3% | 21% | 44% | 0.0233–0.0335 | 0.0695–0.115 |
| atr_20g_oran | 672 | 666 |  | -0.15 | 0.003 | +7.4% | -2.9% | 24% | 49% | 0.0246–0.0334 | 0.0481–0.0959 |
| ma50_uzaklik | 643 | 643 |  | +0.16 | 0.003 | +1.7% | +6.8% | 26% | 22% | -0.363–-0.0928 | 0.173–0.6 |
| kazanc_verimi | 643 | 606 |  | +0.14 | 0.017 | -0.8% | +9.6% | 47% | 24% | 0.0263–0.0417 | 0.0783–0.114 |
| fk | 643 | 640 |  | -0.14 | 0.017 | +9.6% | -0.8% | 24% | 47% | 8.78–12.8 | 24–38 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.14 | 0.018 | +13.3% | +6.9% | 19% | 34% | -0.537–0.025 | 0.913–1.09 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| is_iliskisi | evet | 4 | -5.5% | +1.0% | -2.0% | +4.4% | 50% |
| temettu | evet | 2 | -5.6% | +2.2% | -4.3% | +7.4% | 50% |
| faiz | hayır | 41 | +0.6% | +0.9% | +1.1% | +1.3% | 44% |
| siyasi | hayır | 17 | -0.5% | -0.2% | +0.7% | -4.8% | 41% |
| derecelendirme | hayır | 15 | +1.0% | +0.6% | +1.5% | +11.5% | 67% |
| jeopolitik | hayır | 10 | -0.8% | -1.1% | -0.2% | +10.1% | 60% |
| enflasyon | hayır | 9 | +0.1% | -0.0% | +8.2% | +5.6% | 56% |
| regulasyon | hayır | 6 | -0.6% | +0.9% | +8.6% | +1.0% | 83% |
| haber | hayır | 5 | -0.9% | +1.3% | -0.1% | -13.3% | 0% |
| kuresel_faiz | hayır | 5 | -1.0% | -1.3% | -0.9% | -4.4% | 20% |
| sok | hayır | 5 | -7.6% | -1.5% | +4.0% | -11.9% | 0% |
| tarife | hayır | 5 | +2.3% | +0.7% | +2.5% | +2.8% | 60% |
| kur | hayır | 4 | -3.2% | -3.3% | +2.4% | +1.2% | 50% |
| dusus | hayır | 3 | +0.9% | +2.2% | -1.2% | -7.4% | 0% |
| yukselis | hayır | 3 | +4.8% | -0.3% | -1.7% | +5.4% | 67% |
| butce_vergi | hayır | 2 | -0.9% | +1.4% | +4.8% | +14.6% | 100% |
| YÖN: notr | evet | 1 | - | -8.5% | -18.3% | -24.8% | nan% |
| YÖN: olumlu | evet | 6 | - | +1.4% | -2.8% | +5.0% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 246 deneme. Al-tut Sharpe: eğitim 0.30, test 0.80.
Eğitimde seçilen kural: **amihud_20g < 0.02163 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.74 → test Sharpe -0.65; testte nakitte kalma oranı 90%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.6%, test +7.5%.
Deflated Sharpe (deneme sayısı 246): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.4 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.0 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -0.7 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 1.7 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.5 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.6 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.8 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 5 | -1.1% | -0.6 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | +1.3% | 1.1 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.8 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=-0.0237, getiri_5g=0.0296, getiri_20g=-0.235, getiri_60g=-0.542, getiri_120g=-0.514, mom_12_1=0.933, zirve_52h_yakinlik=0.431, zirveden_dusus=-0.569, oynaklik_20g=0.999, oynaklik_60g=0.86, atr_20g_oran=0.0804, rsi_14=41.7, ma20_uzaklik=-0.0691, ma50_uzaklik=-0.301, ma200_uzaklik=-0.364, hacim_z_20=0.582, amihud_20g=0.0567, devir_hizi_20g=0.0689, gece_ort_20g=-0.000366, gunici_ort_20g=-0.00787, aof_1g_sapma=0.0322, max_gunluk_20g=0.0995, min_gunluk_20g=-0.0999, ivol_60g=0.63, endekse_gore_1g=-0.0464, endekse_gore_20g=-0.192, endekse_gore_60g=-0.371, beta_60g=2.07, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.563, piyasa_degeri_mn=1.56e+05, halka_aciklik=0.426, fk=14, kazanc_verimi=0.0716, pd_dd=3.57, fd_favok=11.2, snak_verimi=-0.0355, temettu_verimi=0.014, roe_ttm=0.256, net_kar_marji=0.285, kar_buyume_yillik=1.2, satis_buyume_yillik=0.0276, net_borc_ozkaynak=0.111, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0