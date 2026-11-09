# Hisse dosyası analizi — ODAS

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 245 (27 bağımsız bölüm); ≥%10 yükseliş 195 gün (26 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +656.6% (t=5.6), gün içi (açılış→kapanış) toplam -92.2% (t=-3.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 9.83e+03 | 8.14e+03 | +0.65 |
| amihud_20g | 0.0555 | 0.0808 | -0.57 |
| kar_buyume_yillik | -1.22 | -2.53 | +0.53 |
| fd_favok | 2.72 | 2.35 | +0.53 |
| snak_verimi | 0.101 | -0.203 | +0.45 |
| beta_60g | 1.05 | 1.08 | -0.40 |
| devir_hizi_20g | 0.0447 | 0.0414 | +0.38 |
| net_borc_ozkaynak | -0.103 | -0.0445 | -0.37 |
| pd_dd | 0.741 | 0.532 | +0.37 |
| net_kar_marji | -0.297 | -0.206 | -0.35 |
| mom_12_1 | -0.0486 | -0.105 | +0.33 |
| kazanc_verimi | -0.00472 | -0.055 | +0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | -2.56 | -1.22 | -0.75 |
| xu100_ma200_uzaklik | 0.114 | 0.0547 | +0.39 |
| net_borc_ozkaynak | -0.0445 | -0.099 | +0.38 |
| amihud_20g | 0.0642 | 0.0732 | +0.34 |
| min_gunluk_20g | -0.044 | -0.0446 | +0.34 |
| net_kar_marji | -0.206 | -0.276 | +0.31 |
| dolar_getiri_60g | -0.0151 | -0.0862 | +0.30 |
| zirveden_dusus | -0.221 | -0.265 | +0.29 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pd_dd | 692 | 583 |  | -0.33 | 0.000 | +5.7% | -4.2% | 4% | 56% | 0.378–0.471 | 0.79–1.95 |
| piyasa_degeri_mn | 692 | 681 | seviye | -0.29 | 0.000 | +4.1% | -3.3% | 9% | 53% | 6.41e+03–7.46e+03 | 1.18e+04–1.5e+04 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.26 | 0.000 | -6.1% | +3.3% | 55% | 12% | -1.68–-0.321 | 0.504–1.49 |
| snak_verimi | 643 | 541 |  | -0.26 | 0.000 | +1.7% | -4.4% | 25% | 51% | -0.776–-0.403 | 0.484–0.813 |
| amihud_20g | 672 | 671 |  | +0.21 | 0.000 | -3.6% | +3.9% | 56% | 14% | 0.0144–0.0391 | 0.102–0.231 |
| fd_favok | 643 | 545 |  | -0.20 | 0.000 | +0.2% | -7.4% | 28% | 60% | 1.53–1.93 | 3.03–4 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.18 | 0.000 | -4.1% | -0.0% | 48% | 39% | -0.191–-0.126 | -0.0179–0.0283 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.18 | 0.002 | -1.0% | +4.8% | 23% | 19% | -0.118–-0.0163 | 0.144–0.312 |
| getiri_60g | 633 | 628 |  | +0.14 | 0.016 | -4.1% | +1.5% | 43% | 39% | -0.358–-0.166 | 0.139–0.582 |
| dolar_getiri_60g | 633 | 633 |  | +0.14 | 0.022 | -4.4% | +1.5% | 43% | 39% | -0.381–-0.202 | 0.0974–0.51 |
| ivol_60g | 573 | 572 |  | -0.12 | 0.153 | +2.5% | -5.2% | 19% | 49% | 0.193–0.257 | 0.391–0.517 |
| endekse_gore_60g | 633 | 633 |  | +0.11 | 0.340 | -2.3% | +0.6% | 40% | 41% | -0.388–-0.163 | 0.0155–0.454 |
| ma50_uzaklik | 643 | 642 |  | +0.10 | 0.428 | -4.2% | +0.7% | 40% | 33% | -0.247–-0.0924 | 0.0669–0.306 |
| olay_sayi_5g | 693 | 5 |  | +0.10 | 0.575 | -1.1% | +1.6% | 34% | 30% | 0–1 | 2–4 |
| olay_yon_5g | 693 | 7 |  | +0.09 | 0.739 | -1.4% | +2.1% | 34% | 35% | -4–0 | 1–2 |
| hacim_z_20 | 672 | 672 |  | +0.09 | 0.898 | -3.1% | -0.6% | 35% | 33% | -2.13–-0.868 | 0.631–17.3 |
| beta_60g | 632 | 632 |  | +0.08 | 1.000 | -6.0% | -4.4% | 47% | 45% | 0.298–0.948 | 1.2–1.74 |
| mom_12_1 | 441 | 439 |  | -0.10 | 1.000 | +1.4% | -3.2% | 25% | 44% | -0.516–-0.402 | 0.323–0.787 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | -0.0% | +0.5% | +1.7% | +0.1% | 39% |
| siyasi | hayır | 9 | +0.3% | +0.2% | -0.9% | +3.0% | 44% |
| enflasyon | hayır | 6 | +2.4% | -0.3% | +0.6% | +0.0% | 33% |
| jeopolitik | hayır | 5 | -2.4% | +1.9% | +4.7% | +3.3% | 60% |
| sok | hayır | 5 | -4.0% | +0.8% | -1.3% | -5.6% | 0% |
| tarife | hayır | 5 | +0.5% | +1.0% | +2.3% | +5.1% | 80% |
| derecelendirme | hayır | 4 | +0.9% | +0.5% | +0.3% | +2.3% | 75% |
| dusus | hayır | 3 | -3.0% | -1.1% | -2.0% | +2.5% | 33% |
| yukselis | hayır | 3 | +1.6% | -0.3% | +0.3% | +4.8% | 67% |
| butce_vergi | hayır | 2 | -0.4% | -0.8% | -2.7% | -11.4% | 0% |
| kur | hayır | 2 | +1.9% | -1.0% | +4.0% | -6.3% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 204 deneme. Al-tut Sharpe: eğitim -0.33, test -0.11.
Eğitimde seçilen kural: **snak_verimi > -0.3474 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.40 → test Sharpe -0.37; testte nakitte kalma oranı 85%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.2%, test +0.1%.
Deflated Sharpe (deneme sayısı 204): 0.03 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.4 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.4 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.9 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -0.9 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.8 |
| ay_donusu | 1.0 | 192 | -0.4% | -1.8 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.5 |
| bayram_oncesi | 1.0 | 5 | +0.7% | 1.2 |
| bayram_sonrasi | 0.0 | 707 | -0.1% | -0.5 |
| bayram_sonrasi | 1.0 | 6 | +1.2% | 1.1 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -0.4 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.1 |

## Son durum (en yeni satır)

getiri_1g=0.0208, getiri_5g=0.15, getiri_20g=-0.183, getiri_60g=-0.344, getiri_120g=-0.36, mom_12_1=0.012, zirve_52h_yakinlik=0.515, zirveden_dusus=-0.485, oynaklik_20g=0.535, oynaklik_60g=0.456, atr_20g_oran=0.0453, rsi_14=37.6, ma20_uzaklik=-0.0142, ma50_uzaklik=-0.194, ma200_uzaklik=-0.279, hacim_z_20=0.162, amihud_20g=0.194, devir_hizi_20g=0.0249, gece_ort_20g=-0.00717, gunici_ort_20g=-0.00266, aof_1g_sapma=0.0137, max_gunluk_20g=0.0688, min_gunluk_20g=-0.0876, ivol_60g=0.362, endekse_gore_1g=0.00462, endekse_gore_20g=-0.134, endekse_gore_60g=-0.168, beta_60g=1.02, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.374, piyasa_degeri_mn=6.87e+03, halka_aciklik=0.762, kazanc_verimi=-0.00719, pd_dd=0.434, fd_favok=2.31, snak_verimi=0.152, temettu_verimi=0, roe_ttm=-0.00312, net_kar_marji=-0.397, satis_buyume_yillik=-0.135, net_borc_ozkaynak=-0.104, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1