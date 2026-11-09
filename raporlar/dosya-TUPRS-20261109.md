# Hisse dosyası analizi — TUPRS

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 113 (20 bağımsız bölüm); ≥%10 yükseliş 217 gün (20 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +364.0% (t=4.3), gün içi (açılış→kapanış) toplam -49.7% (t=-1.3).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| amihud_20g | 0.00374 | 0.00479 | -0.55 |
| piyasa_degeri_mn | 4.53e+05 | 3.95e+05 | +0.49 |
| halka_aciklik | 0.465 | 0.465 | +0.47 |
| getiri_60g | 0.149 | 0.0437 | +0.41 |
| dolar_getiri_60g | 0.0975 | 0.00137 | +0.40 |
| mom_12_1 | 0.322 | 0.308 | +0.38 |
| endekse_gore_60g | 0.0643 | 0.0247 | +0.38 |
| usdtry_getiri_20g | 0.0132 | 0.0146 | -0.33 |
| devir_hizi_20g | 0.0215 | 0.0196 | +0.29 |
| ma200_uzaklik | 0.253 | 0.177 | +0.24 |
| satis_buyume_yillik | 0.144 | -0.0223 | +0.24 |
| net_kar_marji | 0.0328 | 0.0328 | +0.23 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| roe_ttm | 0.0933 | 0.164 | -0.84 |
| kazanc_verimi | 0.0823 | 0.0972 | -0.79 |
| kar_buyume_yillik | 0.513 | -0.013 | +0.75 |
| fk | 12.2 | 10.3 | +0.71 |
| ivol_60g | 0.334 | 0.225 | +0.48 |
| fd_favok | 5.02 | 3.84 | +0.45 |
| devir_hizi_20g | 0.0183 | 0.021 | -0.43 |
| satis_buyume_yillik | -0.0223 | 0.0437 | -0.42 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.27 | 0.000 | +4.2% | -3.0% | 15% | 24% | 0.0649–0.0839 | 0.328–0.328 |
| kazanc_verimi | 643 | 591 |  | -0.23 | 0.000 | +3.4% | -1.4% | 20% | 11% | 0.052–0.0738 | 0.188–0.239 |
| fk | 643 | 628 |  | +0.23 | 0.000 | -1.4% | +3.4% | 11% | 20% | 4.18–5.32 | 13.5–19.2 |
| ivol_60g | 573 | 572 |  | +0.23 | 0.000 | -3.0% | +0.8% | 27% | 30% | 0.115–0.192 | 0.38–0.439 |
| halka_aciklik | 692 | 16 | seviye | -0.20 | 0.000 | +5.5% | +6.1% | 9% | 26% | 0.459–0.465 | 0.471–0.494 |
| beta_60g | 632 | 630 |  | -0.21 | 0.000 | +9.7% | +2.6% | 17% | 15% | -0.307–0.461 | 0.929–1.3 |
| usdtry_getiri_20g | 672 | 664 |  | +0.20 | 0.000 | -1.7% | +4.8% | 23% | 10% | -0.013–0.00947 | 0.019–0.0482 |
| pd_dd | 692 | 650 |  | -0.20 | 0.000 | +7.0% | +1.1% | 11% | 19% | 0.676–1.11 | 1.73–6.18 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | +0.19 | 0.000 | -1.9% | +8.9% | 25% | 22% | -0.891–-0.855 | 2.93–28.2 |
| amihud_20g | 672 | 646 |  | +0.18 | 0.000 | -2.4% | +3.2% | 34% | 12% | 0.0017–0.00332 | 0.00664–0.0114 |
| devir_hizi_20g | 673 | 663 |  | -0.17 | 0.001 | +4.0% | +0.5% | 11% | 18% | 0.0098–0.0154 | 0.0259–0.0377 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.17 | 0.001 | +4.7% | -3.6% | 13% | 23% | -0.154–-0.0916 | 0.477–0.577 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.15 | 0.003 | +0.9% | +6.1% | 16% | 10% | -0.697–-0.237 | -0.157–-0.0908 |
| oynaklik_60g | 632 | 630 |  | +0.15 | 0.005 | -2.4% | -0.5% | 24% | 24% | 0.173–0.272 | 0.391–0.465 |
| aof_1g_sapma | 692 | 690 |  | -0.14 | 0.017 | +5.7% | +2.0% | 24% | 15% | -0.0177–0.0381 | 0.246–0.365 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.12 | 0.054 | +7.6% | +1.9% | 13% | 18% | 0.000612–0.0144 | 0.0527–0.174 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.13 | 0.185 | +2.1% | +4.8% | 20% | 23% | -0.118–-0.0163 | 0.144–0.312 |
| fd_favok | 643 | 623 |  | +0.11 | 0.260 | +1.1% | +2.8% | 14% | 22% | 2.49–3.33 | 5.81–9.15 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| temettu | evet | 3 | +2.6% | +0.6% | -0.6% | +3.6% | 100% |
| bilanco | evet | 2 | -2.1% | -2.1% | -1.2% | +13.9% | 100% |
| faiz | hayır | 41 | +0.2% | -0.3% | -1.0% | +0.1% | 44% |
| siyasi | hayır | 17 | +0.3% | -0.8% | -1.2% | -0.3% | 41% |
| derecelendirme | hayır | 15 | -0.6% | +0.1% | -0.3% | +0.3% | 40% |
| jeopolitik | hayır | 10 | +1.5% | -0.1% | +5.4% | +10.1% | 80% |
| enflasyon | hayır | 9 | +0.4% | -0.3% | -1.6% | -1.1% | 44% |
| regulasyon | hayır | 6 | +1.0% | +0.4% | +1.4% | +8.7% | 50% |
| haber | hayır | 5 | -0.3% | -0.6% | -0.7% | +0.4% | 40% |
| kuresel_faiz | hayır | 5 | +0.4% | -0.4% | -1.0% | -2.4% | 20% |
| sok | hayır | 5 | -2.8% | +1.9% | +2.3% | +3.5% | 80% |
| tarife | hayır | 5 | +0.7% | -0.6% | -1.4% | +6.4% | 60% |
| kur | hayır | 4 | +0.1% | +1.4% | +4.8% | +8.7% | 75% |
| dusus | hayır | 3 | -3.7% | +0.1% | -0.5% | -3.0% | 33% |
| yukselis | hayır | 3 | -1.7% | +2.3% | +8.1% | +13.7% | 100% |
| butce_vergi | hayır | 2 | -0.8% | -0.4% | -0.6% | +1.5% | 50% |
| YÖN: olumlu | evet | 4 | - | -0.1% | -0.9% | +9.0% | nan% |
| YÖN: olumsuz | evet | 1 | - | -2.0% | -0.6% | +2.6% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 178 deneme. Al-tut Sharpe: eğitim 0.72, test 1.47.
Eğitimde seçilen kural: **beta_60g > 0.6737 ise nakde geç** (kantil 0.2). Eğitim Sharpe 1.73 → test Sharpe 1.96; testte nakitte kalma oranı 60%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.6%, test +3.0%.
Deflated Sharpe (deneme sayısı 178): 0.55 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 1.2 |
| haftanin_gunu | 1.0 | 142 | -0.4% | -2.2 |
| haftanin_gunu | 2.0 | 141 | +0.2% | 1.0 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 3.5 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.9 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.8 |
| bayram_oncesi | 1.0 | 5 | -0.7% | -0.8 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.7 |
| bayram_sonrasi | 1.0 | 6 | +1.1% | 1.3 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.5 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.9 |

## Son durum (en yeni satır)

getiri_1g=-0.011, getiri_5g=-0.00149, getiri_20g=-0.129, getiri_60g=-0.068, getiri_120g=0.316, mom_12_1=0.982, zirve_52h_yakinlik=0.801, zirveden_dusus=-0.199, oynaklik_20g=0.307, oynaklik_60g=0.394, atr_20g_oran=0.0381, rsi_14=37.5, ma20_uzaklik=-0.067, ma50_uzaklik=-0.123, ma200_uzaklik=0.15, hacim_z_20=1.77, amihud_20g=0.00357, devir_hizi_20g=0.0143, gece_ort_20g=-0.00622, gunici_ort_20g=-0.000717, aof_1g_sapma=0.015, max_gunluk_20g=0.0241, min_gunluk_20g=-0.048, ivol_60g=0.351, endekse_gore_1g=-0.0338, endekse_gore_20g=-0.086, endekse_gore_60g=0.103, beta_60g=0.714, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.11, piyasa_degeri_mn=6.47e+05, halka_aciklik=0.49, fk=8.67, kazanc_verimi=0.115, pd_dd=1.42, fd_favok=4.68, snak_verimi=0.236, temettu_verimi=0.051, roe_ttm=0.164, net_kar_marji=0.114, kar_buyume_yillik=2.93, satis_buyume_yillik=0.577, net_borc_ozkaynak=-0.28, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0