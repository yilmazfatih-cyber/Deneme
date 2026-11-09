# Hisse dosyası analizi — KONTR

Satır: 3475 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 13:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 436 (33 bağımsız bölüm); ≥%10 yükseliş 176 gün (21 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam -50.6% (t=-0.3), gün içi (açılış→kapanış) toplam -91.7% (t=-2.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| oynaklik_20g | 0.605 | 0.462 | +0.52 |
| ivol_60g | 0.638 | 0.428 | +0.51 |
| satis_buyume_yillik | 0.345 | 0.918 | -0.49 |
| halka_aciklik | 0.629 | 0.576 | +0.46 |
| oynaklik_60g | 0.656 | 0.527 | +0.44 |
| roe_ttm | -0.098 | 0.0617 | -0.42 |
| net_borc_ozkaynak | 2 | 1.5 | +0.40 |
| beta_60g | 1.13 | 1.16 | -0.38 |
| pd_dd | 6.67 | 7.04 | -0.36 |
| min_gunluk_20g | -0.0726 | -0.0614 | -0.35 |
| atr_20g_oran | 0.0494 | 0.0448 | +0.34 |
| bilancodan_gun | 38 | 56 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| temettu_verimi | 0.000995 | 0.000533 | +0.59 |
| oynaklik_20g | 0.463 | 0.574 | -0.49 |
| oynaklik_60g | 0.49 | 0.637 | -0.45 |
| ivol_60g | 0.43 | 0.575 | -0.44 |
| min_gunluk_20g | -0.0625 | -0.0628 | +0.38 |
| fd_favok | 20.8 | 25.6 | -0.33 |
| satis_buyume_yillik | 0.918 | 0.806 | +0.32 |
| atr_20g_oran | 0.0437 | 0.0482 | -0.27 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oynaklik_60g | 633 | 633 |  | -0.39 | 0.000 | -1.3% | -17.7% | 53% | 80% | 0.356–0.469 | 0.972–1.3 |
| oynaklik_20g | 673 | 671 |  | -0.34 | 0.000 | -2.9% | -14.6% | 47% | 83% | 0.205–0.397 | 0.799–2 |
| max_gunluk_20g | 673 | 71 |  | -0.32 | 0.000 | -4.2% | -24.1% | 59% | 84% | 0.0107–0.0473 | 0.1–0.141 |
| ivol_60g | 574 | 574 |  | -0.36 | 0.000 | -4.3% | -18.6% | 60% | 81% | 0.293–0.356 | 1.04–1.3 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.38 | 0.000 | -19.9% | -2.7% | 84% | 41% | -0.749–0.0285 | 1.39–3.31 |
| snak_verimi | 644 | 607 |  | -0.30 | 0.000 | -3.8% | -19.8% | 63% | 92% | -0.345–-0.129 | -0.00919–1.79 |
| kazanc_verimi | 644 | 605 |  | +0.27 | 0.000 | -17.2% | -2.3% | 84% | 54% | -1.13–-0.0977 | 0.0154–0.0249 |
| min_gunluk_20g | 673 | 63 |  | +0.26 | 0.000 | -15.6% | -3.8% | 73% | 45% | -0.52–-0.1 | -0.0435–-0.0221 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.26 | 0.000 | -19.9% | +0.1% | 84% | 41% | -0.564–-0.189 | 0.286–0.286 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.23 | 0.000 | -17.2% | -3.1% | 70% | 48% | -1.53–-0.144 | 0.344–0.366 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | -0.22 | 0.000 | -1.0% | -12.9% | 39% | 86% | 1.04–1.21 | 2.44–2.57 |
| halka_aciklik | 693 | 53 | seviye | -0.21 | 0.000 | -3.9% | -19.3% | 50% | 86% | 0.431–0.462 | 0.719–0.88 |
| temettu_verimi | 694 | 368 |  | +0.19 | 0.000 | -11.6% | -0.9% | 66% | 50% | 0–0.000505 | 0.00152–0.00516 |
| aof_1g_sapma | 693 | 674 |  | +0.18 | 0.000 | -13.7% | -5.8% | 81% | 59% | -0.106–0.000125 | 0.933–inf |
| bilancodan_gun | 694 | 304 | seviye | +0.18 | 0.000 | -14.3% | -10.0% | 81% | 67% | 0.917–19 | 79–113 |
| kar_buyume_yillik | 490 | 7 | çeyreklik adım | +0.20 | 0.000 | -10.4% | -6.0% | 67% | 60% | -4.6–-1.55 | 1.45–1.45 |
| pd_dd | 693 | 673 |  | +0.15 | 0.004 | -14.4% | -5.3% | 88% | 53% | 0.501–2.06 | 17.6–56.4 |
| hacim_z_20 | 673 | 673 |  | -0.14 | 0.008 | -2.6% | -9.1% | 58% | 70% | -4.04–-0.809 | 0.553–11.7 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| haber | evet | 3 | +2.9% | +2.6% | +31.2% | +39.6% | 67% |
| faiz | hayır | 23 | -0.8% | -0.0% | +2.3% | -6.3% | 30% |
| siyasi | hayır | 9 | -2.8% | +0.1% | -0.5% | -1.4% | 33% |
| enflasyon | hayır | 6 | +1.8% | +0.7% | -0.1% | -15.6% | 0% |
| jeopolitik | hayır | 5 | -3.4% | -0.6% | +2.8% | -3.2% | 60% |
| sok | hayır | 5 | -7.0% | -1.8% | -18.9% | -25.0% | 0% |
| tarife | hayır | 5 | +1.2% | +2.3% | -0.2% | -2.2% | 40% |
| derecelendirme | hayır | 4 | +2.7% | +2.8% | -1.1% | -5.2% | 50% |
| dusus | hayır | 3 | -1.6% | -3.8% | -7.8% | -24.1% | 0% |
| yukselis | hayır | 3 | +1.6% | -0.6% | -1.9% | +1.5% | 33% |
| butce_vergi | hayır | 2 | +0.5% | -2.9% | -8.5% | -23.7% | 0% |
| kur | hayır | 2 | +3.7% | -5.5% | -14.4% | -20.7% | 50% |
| YÖN: olumsuz | evet | 3 | - | +2.6% | +31.2% | +39.6% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 228 deneme. Al-tut Sharpe: eğitim -0.54, test -1.74.
Eğitimde seçilen kural: **snak_verimi > -0.04879 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.30 → test Sharpe -1.06; testte nakitte kalma oranı 44%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -6.9%, test -20.9%.
Deflated Sharpe (deneme sayısı 228): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.5% | -1.2 |
| haftanin_gunu | 1.0 | 143 | -0.9% | -1.9 |
| haftanin_gunu | 2.0 | 141 | -0.5% | -1.3 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 1.1 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -0.6 |
| ay_donusu | 0.0 | 522 | -0.3% | -1.6 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.0 |
| bayram_oncesi | 0.0 | 708 | -0.3% | -2.0 |
| bayram_oncesi | 1.0 | 6 | +0.8% | 1.1 |
| bayram_sonrasi | 0.0 | 708 | -0.4% | -2.0 |
| bayram_sonrasi | 1.0 | 6 | +1.9% | 1.2 |
| bilanco_sezonu | 0.0 | 423 | -0.4% | -1.7 |
| bilanco_sezonu | 1.0 | 291 | -0.2% | -0.9 |

## Son durum (en yeni satır)

getiri_1g=0, getiri_5g=0.333, getiri_20g=0.307, getiri_60g=-0.365, getiri_120g=-0.689, mom_12_1=-0.935, zirve_52h_yakinlik=0.0769, zirveden_dusus=-0.923, oynaklik_20g=1.19, oynaklik_60g=0.962, atr_20g_oran=0.0427, rsi_14=66.8, ma20_uzaklik=0.436, ma50_uzaklik=0.101, ma200_uzaklik=-0.577, hacim_z_20=3.8, amihud_20g=14.6, devir_hizi_20g=0.00301, gece_ort_20g=0.0186, gunici_ort_20g=-0.00208, aof_1g_sapma=-0.00261, max_gunluk_20g=0.103, min_gunluk_20g=-0.12, ivol_60g=0.914, endekse_gore_1g=-0.0158, endekse_gore_20g=0.357, endekse_gore_60g=-0.188, beta_60g=1.39, xu100_getiri_20g=-0.0495, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.394, piyasa_degeri_mn=3.48e+03, halka_aciklik=0.88, kazanc_verimi=-0.853, pd_dd=0.662, snak_verimi=1.36, temettu_verimi=0, roe_ttm=-0.564, net_kar_marji=-1.53, satis_buyume_yillik=-0.749, net_borc_ozkaynak=2.57, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1