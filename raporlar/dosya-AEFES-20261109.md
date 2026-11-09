# Hisse dosyası analizi — AEFES

Satır: 3980 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 215 (22 bağımsız bölüm); ≥%10 yükseliş 255 gün (33 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +121.2% (t=2.1), gün içi (açılış→kapanış) toplam -44.0% (t=-0.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.19e+05 | 1.02e+05 | +0.87 |
| beta_60g | 0.791 | 1.07 | -0.67 |
| getiri_120g | 0.0685 | -0.00882 | +0.63 |
| endekse_gore_60g | 0.0322 | -0.0554 | +0.62 |
| fd_favok | 3.48 | 3.31 | +0.61 |
| pd_dd | 1.23 | 1.02 | +0.60 |
| gece_ort_20g | 0.00267 | 0.00168 | +0.56 |
| zirveden_dusus | -0.238 | -0.336 | +0.43 |
| zirve_52h_yakinlik | 0.762 | 0.664 | +0.43 |
| getiri_60g | 0.0839 | -0.0331 | +0.41 |
| dolar_getiri_60g | 0.0525 | -0.0754 | +0.40 |
| endekse_gore_20g | 0.0369 | -0.0052 | +0.40 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | -0.0603 | 0.0962 | -0.58 |
| kazanc_verimi | 0.181 | 0.166 | +0.55 |
| piyasa_degeri_mn | 1.02e+05 | 1.1e+05 | -0.52 |
| fk | 5.52 | 6.03 | -0.45 |
| beta_60g | 1.08 | 1 | +0.44 |
| temettu_verimi | 0.00814 | 0.00887 | -0.43 |
| zirveden_dusus | -0.342 | -0.291 | -0.31 |
| zirve_52h_yakinlik | 0.658 | 0.709 | -0.31 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 693 | 693 | seviye | -0.39 | 0.000 | +7.9% | -6.7% | 8% | 66% | 7.67e+04–9.32e+04 | 1.25e+05–1.83e+05 |
| beta_60g | 633 | 633 |  | +0.28 | 0.000 | -4.9% | +4.2% | 54% | 15% | 0.0831–0.682 | 1.21–1.38 |
| fk | 644 | 643 |  | -0.25 | 0.000 | +9.5% | -1.3% | 13% | 25% | 2.65–3.94 | 9.46–12.2 |
| kazanc_verimi | 644 | 605 |  | +0.25 | 0.000 | -1.3% | +9.5% | 25% | 13% | 0.082–0.106 | 0.254–0.378 |
| zirveden_dusus | 574 | 490 |  | -0.24 | 0.000 | +2.0% | -3.6% | 17% | 40% | -0.56–-0.435 | -0.112–0 |
| zirve_52h_yakinlik | 574 | 505 |  | -0.24 | 0.000 | +2.0% | -3.6% | 17% | 40% | 0.44–0.565 | 0.888–1.05 |
| endekse_gore_60g | 634 | 634 |  | -0.21 | 0.000 | +4.2% | -2.3% | 13% | 49% | -0.338–-0.137 | 0.115–0.733 |
| fd_favok | 644 | 638 |  | -0.20 | 0.000 | +3.2% | -1.9% | 20% | 50% | 2.43–3.12 | 3.7–5.27 |
| temettu_verimi | 694 | 504 |  | -0.19 | 0.000 | +5.9% | -1.0% | 24% | 28% | 0–0.00679 | 0.0122–0.0261 |
| usdtry_getiri_20g | 673 | 665 |  | -0.18 | 0.000 | +7.3% | +1.3% | 19% | 32% | -0.013–0.00945 | 0.019–0.0482 |
| mom_12_1 | 442 | 442 |  | -0.22 | 0.000 | +3.1% | -2.8% | 22% | 28% | -0.545–-0.292 | 0.277–0.839 |
| getiri_120g | 574 | 574 |  | -0.18 | 0.001 | +0.5% | -5.9% | 20% | 57% | -0.44–-0.147 | 0.27–1.27 |
| pd_dd | 693 | 685 |  | -0.15 | 0.002 | +2.7% | +1.4% | 14% | 46% | 0.724–0.928 | 1.64–2.56 |
| ivol_60g | 574 | 573 |  | -0.16 | 0.004 | -2.0% | -7.0% | 38% | 53% | 0.231–0.268 | 0.393–0.538 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.14 | 0.009 | -0.0% | +10.7% | 21% | 18% | -0.0667–0.0322 | 0.154–0.209 |
| endekse_gore_20g | 674 | 674 |  | -0.12 | 0.067 | +0.9% | -1.5% | 24% | 46% | -0.351–-0.0729 | 0.0816–0.352 |
| ma200_uzaklik | 494 | 494 |  | -0.14 | 0.076 | +1.6% | -3.6% | 12% | 36% | -0.268–-0.172 | 0.145–0.389 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.12 | 0.130 | +1.9% | +3.9% | 24% | 45% | -0.0799–0.0306 | 0.339–0.339 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.6% | +0.3% | -0.4% | -0.1% | 57% |
| siyasi | hayır | 9 | -1.3% | +0.7% | +1.2% | -2.0% | 33% |
| enflasyon | hayır | 6 | +0.8% | +1.6% | +3.0% | +4.5% | 67% |
| jeopolitik | hayır | 5 | -2.3% | +2.0% | -0.7% | +2.2% | 60% |
| sok | hayır | 5 | -5.5% | +1.8% | +3.4% | +7.2% | 100% |
| tarife | hayır | 5 | +2.9% | +0.9% | -0.1% | -5.4% | 20% |
| derecelendirme | hayır | 4 | +0.9% | -0.7% | +0.6% | +4.4% | 75% |
| dusus | hayır | 3 | -1.9% | +1.2% | +3.7% | +3.3% | 100% |
| yukselis | hayır | 3 | +2.6% | +0.4% | +0.5% | -3.3% | 33% |
| butce_vergi | hayır | 2 | -0.9% | -0.9% | -10.2% | -19.6% | 0% |
| kur | hayır | 2 | +0.7% | +1.5% | +1.5% | -5.7% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 192 deneme. Al-tut Sharpe: eğitim 0.39, test 0.37.
Eğitimde seçilen kural: **getiri_1g < 0.01263 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.62 → test Sharpe -0.49; testte nakitte kalma oranı 71%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.2%, test +1.9%.
Deflated Sharpe (deneme sayısı 192): 0.02 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.6 |
| haftanin_gunu | 1.0 | 143 | -0.0% | -0.0 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.6 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.4 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 522 | +0.1% | 1.3 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.9 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.7 |
| bayram_oncesi | 1.0 | 6 | -0.2% | -0.8 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.7 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.1 |
| bilanco_sezonu | 0.0 | 423 | +0.1% | 0.8 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.00951, getiri_5g=0.0481, getiri_20g=-0.0841, getiri_60g=-0.117, getiri_120g=-0.134, mom_12_1=0.221, zirve_52h_yakinlik=0.765, zirveden_dusus=-0.235, oynaklik_20g=0.325, oynaklik_60g=0.325, atr_20g_oran=0.0364, rsi_14=45.3, ma20_uzaklik=-0.00171, ma50_uzaklik=-0.0547, ma200_uzaklik=-0.114, hacim_z_20=0.235, amihud_20g=0.0373, devir_hizi_20g=0.0155, gece_ort_20g=-0.00516, gunici_ort_20g=0.00125, aof_1g_sapma=0.0214, max_gunluk_20g=0.0371, min_gunluk_20g=-0.0442, ivol_60g=0.25, endekse_gore_1g=-0.00666, endekse_gore_20g=-0.035, endekse_gore_60g=0.0588, beta_60g=0.832, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.157, piyasa_degeri_mn=1.01e+05, halka_aciklik=0.323, fk=9.46, kazanc_verimi=0.106, pd_dd=0.8, fd_favok=3.12, snak_verimi=0.244, temettu_verimi=0.02, roe_ttm=0.0846, net_kar_marji=0.0573, kar_buyume_yillik=-0.0476, satis_buyume_yillik=0.0306, net_borc_ozkaynak=0.525, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1