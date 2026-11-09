# Hisse dosyası analizi — ARCLK

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 194 (24 bağımsız bölüm); ≥%10 yükseliş 144 gün (18 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +117.1% (t=2.7), gün içi (açılış→kapanış) toplam -74.8% (t=-2.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| endekse_gore_60g | -0.0428 | -0.113 | +0.83 |
| zirveden_dusus | -0.246 | -0.297 | +0.74 |
| zirve_52h_yakinlik | 0.754 | 0.703 | +0.74 |
| endekse_gore_20g | 0.00672 | -0.045 | +0.73 |
| fk | 5.64 | 2.86 | +0.68 |
| ma200_uzaklik | -0.0643 | -0.113 | +0.64 |
| ma50_uzaklik | 0.00261 | -0.0495 | +0.58 |
| oynaklik_20g | 0.335 | 0.312 | +0.48 |
| getiri_120g | -0.0642 | -0.117 | +0.48 |
| rsi_14 | 50.3 | 44.1 | +0.45 |
| dolar_getiri_60g | -0.041 | -0.127 | +0.44 |
| getiri_60g | 0.00145 | -0.0936 | +0.44 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | -0.248 | -0.148 | -0.93 |
| zirve_52h_yakinlik | 0.658 | 0.721 | -0.78 |
| zirveden_dusus | -0.342 | -0.279 | -0.78 |
| satis_buyume_yillik | 0.431 | 0.19 | +0.54 |
| getiri_120g | -0.138 | -0.0888 | -0.49 |
| snak_verimi | -0.2 | -0.0641 | -0.47 |
| fk | 5.03 | 2.99 | -0.47 |
| net_borc_ozkaynak | 1.34 | 1.61 | -0.45 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 482 |  | -0.38 | 0.000 | +1.4% | -9.6% | 23% | 68% | 0.549–0.658 | 0.776–0.978 |
| zirveden_dusus | 573 | 482 |  | -0.38 | 0.000 | +1.4% | -9.6% | 23% | 68% | -0.451–-0.342 | -0.224–-0.0215 |
| fk | 287 | 255 |  | -0.45 | 0.000 | +2.8% | -9.5% | 24% | 69% | 2.14–2.51 | 6.09–45.9 |
| ma200_uzaklik | 493 | 493 |  | -0.32 | 0.000 | +2.2% | -7.7% | 20% | 61% | -0.24–-0.155 | -0.0315–0.145 |
| mom_12_1 | 441 | 441 |  | -0.33 | 0.000 | +2.6% | -6.0% | 16% | 25% | -0.402–-0.281 | -0.0578–0.179 |
| getiri_120g | 573 | 571 |  | -0.29 | 0.000 | +0.6% | -7.5% | 23% | 51% | -0.332–-0.178 | -0.00721–0.37 |
| endekse_gore_60g | 633 | 632 |  | -0.27 | 0.000 | +0.5% | -4.3% | 5% | 51% | -0.247–-0.151 | -0.00911–0.12 |
| beta_60g | 632 | 632 |  | +0.22 | 0.000 | -6.9% | -0.6% | 43% | 25% | 0.484–0.766 | 1.1–1.42 |
| endekse_gore_20g | 673 | 673 |  | -0.20 | 0.000 | -2.0% | -6.4% | 18% | 54% | -0.152–-0.0792 | 0.031–0.172 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.19 | 0.000 | -0.0% | -7.0% | 32% | 29% | 0.944–1.02 | 2.32–2.49 |
| fd_favok | 643 | 568 |  | -0.19 | 0.000 | +0.8% | -2.8% | 24% | 28% | 3.55–4.15 | 9.03–13.1 |
| snak_verimi | 643 | 565 |  | -0.19 | 0.000 | -2.1% | -2.5% | 21% | 32% | -0.523–-0.335 | 0.0873–0.372 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.17 | 0.001 | -5.7% | -0.5% | 26% | 24% | -0.17–0.00043 | 0.713–0.713 |
| getiri_60g | 633 | 631 |  | -0.16 | 0.004 | -0.3% | -3.0% | 23% | 43% | -0.292–-0.159 | 0.0923–0.367 |
| dolar_getiri_60g | 633 | 632 |  | -0.15 | 0.004 | +0.3% | -3.4% | 20% | 43% | -0.317–-0.194 | 0.0549–0.302 |
| gunici_ort_20g | 673 | 657 |  | -0.14 | 0.013 | -0.2% | -3.9% | 10% | 41% | -0.0155–-0.0048 | 0.00175–0.0105 |
| ma50_uzaklik | 643 | 642 |  | -0.12 | 0.148 | -1.3% | -2.7% | 19% | 44% | -0.184–-0.0846 | 0.0436–0.207 |
| olay_yon_5g | 693 | 7 |  | +0.11 | 0.226 | -1.3% | -1.2% | 26% | 32% | -4–0 | 1–2 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.6% | -0.4% | -1.1% | -3.5% | 22% |
| siyasi | hayır | 9 | -0.9% | +0.2% | -0.3% | -5.0% | 22% |
| enflasyon | hayır | 6 | +2.0% | -0.4% | +0.9% | -1.0% | 33% |
| jeopolitik | hayır | 5 | -1.8% | +0.4% | +0.5% | -0.6% | 60% |
| sok | hayır | 5 | -4.3% | +1.4% | +0.9% | -4.6% | 0% |
| tarife | hayır | 5 | +1.3% | -0.9% | -3.0% | -6.5% | 20% |
| derecelendirme | hayır | 4 | +1.1% | -1.8% | -1.7% | +0.8% | 50% |
| dusus | hayır | 3 | +0.5% | +1.7% | +0.7% | -6.5% | 0% |
| yukselis | hayır | 3 | +2.1% | +1.2% | +1.1% | -3.1% | 33% |
| butce_vergi | hayır | 2 | -1.0% | +0.3% | -1.8% | -10.9% | 0% |
| kur | hayır | 2 | -1.0% | +1.0% | +1.2% | -0.0% | 50% |
| YÖN: olumsuz | evet | 1 | - | +1.2% | -2.7% | - | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 200 deneme. Al-tut Sharpe: eğitim 0.27, test -1.78.
Eğitimde seçilen kural: **gunici_ort_20g > -0.003764 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.73 → test Sharpe -0.8; testte nakitte kalma oranı 58%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.5%, test -3.9%.
Deflated Sharpe (deneme sayısı 200): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.2% | -1.2 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.9 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.6 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -1.3 |
| ay_donusu | 0.0 | 521 | +0.0% | 0.1 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.6 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.8 |
| bayram_oncesi | 1.0 | 5 | +0.8% | 1.3 |
| bayram_sonrasi | 0.0 | 707 | -0.1% | -0.7 |
| bayram_sonrasi | 1.0 | 6 | -0.9% | -1.3 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -1.0 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.0 |

## Son durum (en yeni satır)

getiri_1g=0.00999, getiri_5g=0.0623, getiri_20g=-0.123, getiri_60g=-0.256, getiri_120g=-0.363, mom_12_1=-0.283, zirve_52h_yakinlik=0.524, zirveden_dusus=-0.476, oynaklik_20g=0.375, oynaklik_60g=0.307, atr_20g_oran=0.0354, rsi_14=36.7, ma20_uzaklik=-0.0267, ma50_uzaklik=-0.136, ma200_uzaklik=-0.304, hacim_z_20=-0.467, amihud_20g=0.253, devir_hizi_20g=0.01, gece_ort_20g=-0.00482, gunici_ort_20g=-0.00173, aof_1g_sapma=0.00626, max_gunluk_20g=0.0452, min_gunluk_20g=-0.0444, ivol_60g=0.206, endekse_gore_1g=-0.00619, endekse_gore_20g=-0.0741, endekse_gore_60g=-0.0792, beta_60g=0.811, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.289, piyasa_degeri_mn=4.78e+04, halka_aciklik=0.176, kazanc_verimi=-0.0734, pd_dd=0.615, fd_favok=6.33, snak_verimi=0.421, temettu_verimi=0, roe_ttm=-0.0452, net_kar_marji=0.0243, satis_buyume_yillik=-0.17, net_borc_ozkaynak=2.49, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1