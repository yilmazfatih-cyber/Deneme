# Hisse dosyası analizi — CVKMD

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 237 (41 bağımsız bölüm); ≥%10 yükseliş 318 gün (37 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +229.0% (t=2.0), gün içi (açılış→kapanış) toplam -53.1% (t=-0.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.00795 | 0.0126 | -0.52 |
| piyasa_degeri_mn | 5.74e+04 | 4.7e+04 | +0.45 |
| fd_favok | 50.5 | 43.4 | +0.40 |
| roe_ttm | 0.0854 | 0.14 | -0.39 |
| gunici_ort_20g | 0.00164 | -0.0013 | +0.38 |
| ivol_60g | 0.548 | 0.531 | +0.37 |
| aof_1g_sapma | 1.57 | 1.57 | -0.36 |
| oynaklik_60g | 0.584 | 0.569 | +0.35 |
| snak_verimi | -0.00765 | 0.0134 | -0.34 |
| endekse_gore_60g | 0.134 | 0.00544 | +0.30 |
| mom_12_1 | 0.907 | 0.0262 | +0.27 |
| xu100_ma200_uzaklik | 0.0739 | 0.0642 | +0.27 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.0153 | 0.00915 | +0.44 |
| snak_verimi | 0.0159 | 0.00483 | +0.42 |
| roe_ttm | 0.14 | 0.116 | +0.37 |
| ivol_60g | 0.516 | 0.547 | -0.37 |
| oynaklik_60g | 0.555 | 0.587 | -0.36 |
| aof_1g_sapma | 1.57 | 1.57 | +0.35 |
| oynaklik_20g | 0.545 | 0.56 | -0.29 |
| pd_dd | 8.06 | 9.17 | -0.28 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.33 | 0.000 | -8.4% | +11.5% | 52% | 38% | -0.00117–0.0212 | 0.21–0.21 |
| kazanc_verimi | 644 | 571 |  | +0.41 | 0.000 | -8.8% | +11.0% | 50% | 18% | -0.000213–0.005 | 0.0292–0.0389 |
| snak_verimi | 644 | 622 |  | +0.28 | 0.000 | +1.8% | +12.8% | 30% | 18% | -0.062–-0.0285 | 0.143–0.21 |
| fk | 576 | 576 |  | -0.29 | 0.000 | +11.2% | -8.9% | 17% | 65% | 25.7–33.4 | 123–830 |
| atr_20g_oran | 673 | 669 |  | -0.22 | 0.000 | +5.5% | -3.0% | 28% | 44% | 0.0232–0.0409 | 0.0568–0.182 |
| pd_dd | 693 | 690 |  | -0.22 | 0.000 | +4.5% | -10.8% | 32% | 53% | 3.63–5.83 | 13.8–28.5 |
| oynaklik_60g | 633 | 631 |  | -0.23 | 0.000 | +8.5% | +2.8% | 33% | 36% | 0.337–0.486 | 0.675–1.36 |
| piyasa_degeri_mn | 693 | 692 | seviye | -0.21 | 0.000 | +5.9% | -5.6% | 22% | 44% | 2.66e+04–3.97e+04 | 1.06e+05–1.76e+05 |
| amihud_20g | 653 | 652 |  | +0.20 | 0.000 | -3.7% | +7.2% | 51% | 17% | 0.0298–0.0463 | 0.13–5.14 |
| fd_favok | 644 | 644 |  | -0.18 | 0.000 | +5.6% | -8.2% | 21% | 47% | 22.8–32.9 | 103–173 |
| ivol_60g | 574 | 574 |  | -0.16 | 0.004 | +8.0% | +1.9% | 29% | 39% | 0.322–0.447 | 0.68–1.35 |
| getiri_120g | 574 | 573 |  | +0.15 | 0.009 | -0.2% | +8.8% | 37% | 33% | -0.673–-0.364 | 0.759–2.46 |
| mom_12_1 | 442 | 442 |  | -0.16 | 0.027 | +3.4% | -15.8% | 29% | 51% | -0.388–-0.232 | 1.92–3.83 |
| endekse_gore_20g | 674 | 674 |  | -0.13 | 0.036 | +5.4% | -2.0% | 24% | 50% | -0.673–-0.116 | 0.179–0.58 |
| aof_1g_sapma | 693 | 692 |  | +0.12 | 0.046 | -1.5% | +4.2% | 47% | 37% | -0.0253–1.54 | 1.6–1.77 |
| olay_yon_5g | 694 | 7 |  | +0.12 | 0.067 | +1.5% | +12.7% | 35% | 24% | -4–0 | 1–2 |
| beta_60g | 633 | 633 |  | -0.12 | 0.078 | +12.8% | -1.8% | 28% | 34% | -0.204–0.394 | 0.892–1.61 |
| usdtry_getiri_20g | 673 | 665 |  | -0.12 | 0.083 | +6.3% | +0.5% | 28% | 33% | -0.013–0.00945 | 0.019–0.0482 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +1.3% | -0.2% | +4.1% | +12.2% | 61% |
| siyasi | hayır | 9 | -0.7% | -0.9% | -0.2% | +8.6% | 67% |
| enflasyon | hayır | 6 | +2.4% | +1.0% | -1.0% | +2.0% | 33% |
| jeopolitik | hayır | 5 | -3.0% | -0.4% | +1.9% | -0.7% | 40% |
| sok | hayır | 5 | -3.9% | +0.5% | +2.6% | +4.4% | 60% |
| tarife | hayır | 5 | +0.4% | +0.5% | -0.5% | +1.9% | 40% |
| derecelendirme | hayır | 4 | +1.3% | +1.2% | -0.4% | +2.8% | 50% |
| dusus | hayır | 3 | -3.1% | +1.0% | -2.5% | -2.7% | 33% |
| yukselis | hayır | 3 | +2.9% | +3.2% | +2.0% | -1.3% | 67% |
| butce_vergi | hayır | 2 | +2.9% | -1.0% | +3.7% | +8.5% | 50% |
| kur | hayır | 2 | -0.2% | -0.9% | +2.2% | -27.6% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 235 deneme. Al-tut Sharpe: eğitim 0.65, test 0.57.
Eğitimde seçilen kural: **amihud_20g < 0.08643 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.83 → test Sharpe 0.53; testte nakitte kalma oranı 88%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.1%, test +2.1%.
Deflated Sharpe (deneme sayısı 235): 0.05 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.4 |
| haftanin_gunu | 1.0 | 143 | -0.0% | -0.0 |
| haftanin_gunu | 2.0 | 141 | -0.7% | -1.2 |
| haftanin_gunu | 3.0 | 143 | +1.1% | 3.7 |
| haftanin_gunu | 4.0 | 143 | +0.3% | 0.9 |
| ay_donusu | 0.0 | 522 | +0.3% | 1.9 |
| ay_donusu | 1.0 | 192 | -0.3% | -0.6 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.8 |
| bayram_oncesi | 1.0 | 6 | +3.6% | 2.8 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | +2.0% | 1.1 |
| bilanco_sezonu | 0.0 | 423 | +0.3% | 1.8 |
| bilanco_sezonu | 1.0 | 291 | -0.1% | -0.2 |

## Son durum (en yeni satır)

getiri_1g=0.00969, getiri_5g=0.295, getiri_20g=0.055, getiri_60g=-0.123, getiri_120g=-0.665, mom_12_1=-0.385, zirve_52h_yakinlik=0.301, zirveden_dusus=-0.699, oynaklik_20g=0.839, oynaklik_60g=0.652, atr_20g_oran=0.0532, rsi_14=60.8, ma20_uzaklik=0.174, ma50_uzaklik=0.0813, ma200_uzaklik=-0.509, hacim_z_20=1.67, amihud_20g=0.128, devir_hizi_20g=0.0268, gece_ort_20g=0.00227, gunici_ort_20g=0.00452, aof_1g_sapma=0.0361, max_gunluk_20g=0.101, min_gunluk_20g=-0.0994, ivol_60g=0.55, endekse_gore_1g=-0.00648, endekse_gore_20g=0.104, endekse_gore_60g=0.0531, beta_60g=1.29, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.163, piyasa_degeri_mn=5.52e+04, halka_aciklik=0.282, fk=207, kazanc_verimi=0.00484, pd_dd=4.38, fd_favok=45.2, snak_verimi=-0.0514, temettu_verimi=0, roe_ttm=0.0212, net_kar_marji=0.33, kar_buyume_yillik=0.781, satis_buyume_yillik=0.717, net_borc_ozkaynak=0.297, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1