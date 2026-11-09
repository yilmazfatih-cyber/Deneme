# Hisse dosyası analizi — TUPRS

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 113 (20 bağımsız bölüm); ≥%10 yükseliş 217 gün (20 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +364.0% (t=4.3), gün içi (açılış→kapanış) toplam -49.8% (t=-1.3).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| amihud_20g | 0.00374 | 0.00479 | -0.55 |
| piyasa_degeri_mn | 4.53e+05 | 3.95e+05 | +0.49 |
| halka_aciklik | 0.465 | 0.465 | +0.47 |
| getiri_60g | 0.149 | 0.0437 | +0.41 |
| dolar_getiri_60g | 0.0975 | 0.00137 | +0.40 |
| bilancodan_gun | 38 | 50 | -0.40 |
| mom_12_1 | 0.322 | 0.308 | +0.38 |
| endekse_gore_60g | 0.0643 | 0.0247 | +0.38 |
| usdtry_getiri_20g | 0.0132 | 0.0146 | -0.33 |
| devir_hizi_20g | 0.0215 | 0.0196 | +0.29 |
| ma200_uzaklik | 0.253 | 0.177 | +0.24 |
| satis_buyume_yillik | 0.144 | 0.0437 | +0.23 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | 0.513 | -0.013 | +0.76 |
| roe_ttm | 0.0997 | 0.164 | -0.71 |
| kazanc_verimi | 0.0813 | 0.0993 | -0.61 |
| fk | 12.3 | 10.1 | +0.60 |
| ivol_60g | 0.334 | 0.225 | +0.48 |
| devir_hizi_20g | 0.0183 | 0.021 | -0.43 |
| fd_favok | 5.02 | 3.66 | +0.43 |
| satis_buyume_yillik | 0.0437 | 0.0437 | -0.38 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.24 | 0.000 | +2.9% | -3.0% | 18% | 24% | 0.0649–0.0839 | 0.328–0.328 |
| bilancodan_gun | 693 | 303 | seviye | +0.23 | 0.000 | -0.1% | +7.0% | 21% | 4% | 0.917–19 | 79–113 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | +0.23 | 0.000 | +1.7% | +8.9% | 17% | 22% | -0.891–-0.713 | 2.93–28.2 |
| ivol_60g | 573 | 572 |  | +0.23 | 0.000 | -3.0% | +0.8% | 27% | 30% | 0.115–0.192 | 0.38–0.439 |
| kazanc_verimi | 643 | 591 |  | -0.22 | 0.000 | +3.7% | -0.9% | 19% | 12% | 0.052–0.0736 | 0.191–0.259 |
| fk | 643 | 627 |  | +0.22 | 0.000 | -0.9% | +3.7% | 12% | 19% | 3.87–5.25 | 13.6–19.2 |
| halka_aciklik | 692 | 16 | seviye | -0.20 | 0.000 | +5.5% | +6.1% | 9% | 26% | 0.459–0.465 | 0.471–0.494 |
| beta_60g | 632 | 630 |  | -0.21 | 0.000 | +9.7% | +2.6% | 17% | 15% | -0.307–0.461 | 0.929–1.3 |
| usdtry_getiri_20g | 672 | 664 |  | +0.20 | 0.000 | -1.7% | +4.8% | 23% | 10% | -0.013–0.00947 | 0.019–0.0482 |
| pd_dd | 692 | 649 |  | -0.17 | 0.000 | +5.8% | +1.1% | 13% | 19% | 0.676–1.16 | 1.73–6.18 |
| amihud_20g | 672 | 646 |  | +0.18 | 0.000 | -2.4% | +3.2% | 34% | 12% | 0.0017–0.00332 | 0.00664–0.0114 |
| devir_hizi_20g | 673 | 663 |  | -0.17 | 0.001 | +4.0% | +0.5% | 11% | 18% | 0.0098–0.0154 | 0.0259–0.0377 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.16 | 0.005 | +1.9% | -3.6% | 16% | 23% | -0.154–-0.0784 | 0.477–0.577 |
| oynaklik_60g | 632 | 630 |  | +0.15 | 0.005 | -2.4% | -0.5% | 24% | 24% | 0.173–0.272 | 0.391–0.465 |
| aof_1g_sapma | 692 | 690 |  | -0.14 | 0.017 | +5.7% | +2.0% | 24% | 15% | -0.0177–0.0381 | 0.246–0.365 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.13 | 0.185 | +2.1% | +4.8% | 20% | 23% | -0.118–-0.0163 | 0.144–0.312 |
| oynaklik_20g | 672 | 672 |  | +0.11 | 0.295 | +1.7% | +5.5% | 10% | 10% | 0.152–0.239 | 0.424–0.547 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.10 | 0.429 | +0.9% | +5.0% | 16% | 12% | -0.697–-0.237 | -0.157–-0.0908 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.4% | +0.1% | -1.4% | -0.1% | 39% |
| siyasi | hayır | 9 | +0.3% | -0.1% | -0.4% | +3.2% | 56% |
| enflasyon | hayır | 6 | +0.4% | -0.5% | -2.9% | -1.0% | 50% |
| jeopolitik | hayır | 5 | +2.5% | +1.4% | +9.3% | +7.4% | 80% |
| sok | hayır | 5 | -2.8% | +1.9% | +2.3% | +3.5% | 80% |
| tarife | hayır | 5 | +0.7% | -0.6% | -1.4% | +6.4% | 60% |
| derecelendirme | hayır | 4 | -1.0% | +0.2% | +1.3% | -4.3% | 25% |
| dusus | hayır | 3 | -3.7% | +0.1% | -0.5% | -3.0% | 33% |
| yukselis | hayır | 3 | -1.7% | +2.3% | +8.1% | +13.7% | 100% |
| butce_vergi | hayır | 2 | -0.8% | -0.4% | -0.6% | +1.5% | 50% |
| kur | hayır | 2 | +2.2% | +1.2% | +9.8% | +18.3% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 178 deneme. Al-tut Sharpe: eğitim 0.72, test 1.46.
Eğitimde seçilen kural: **beta_60g > 0.6737 ise nakde geç** (kantil 0.2). Eğitim Sharpe 1.73 → test Sharpe 1.96; testte nakitte kalma oranı 60%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.6%, test +3.0%.
Deflated Sharpe (deneme sayısı 178): 0.53 — 0,95 üstü anlamlı, 0,5 civarı şans.

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

getiri_1g=-0.0132, getiri_5g=-0.00371, getiri_20g=-0.131, getiri_60g=-0.07, getiri_120g=0.313, mom_12_1=0.982, zirve_52h_yakinlik=0.799, zirveden_dusus=-0.201, oynaklik_20g=0.307, oynaklik_60g=0.394, atr_20g_oran=0.0381, rsi_14=37.5, ma20_uzaklik=-0.0691, ma50_uzaklik=-0.125, ma200_uzaklik=0.148, hacim_z_20=1.77, amihud_20g=0.00357, devir_hizi_20g=0.0143, gece_ort_20g=-0.00622, gunici_ort_20g=-0.000717, aof_1g_sapma=0.015, max_gunluk_20g=0.0241, min_gunluk_20g=-0.048, ivol_60g=0.351, endekse_gore_1g=-0.0294, endekse_gore_20g=-0.0818, endekse_gore_60g=0.106, beta_60g=0.714, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.112, piyasa_degeri_mn=6.46e+05, halka_aciklik=0.49, fk=8.65, kazanc_verimi=0.116, pd_dd=1.42, fd_favok=4.66, snak_verimi=0.236, temettu_verimi=0.0511, roe_ttm=0.164, net_kar_marji=0.114, kar_buyume_yillik=2.93, satis_buyume_yillik=0.577, net_borc_ozkaynak=-0.28, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1