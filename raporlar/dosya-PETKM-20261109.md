# Hisse dosyası analizi — PETKM

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 160 (20 bağımsız bölüm); ≥%10 yükseliş 181 gün (28 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +459.4% (t=4.9), gün içi (açılış→kapanış) toplam -84.0% (t=-2.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 5.76e+04 | 4.66e+04 | +1.36 |
| endekse_gore_60g | 0.116 | -0.0985 | +1.36 |
| ma200_uzaklik | 0.109 | -0.0272 | +1.26 |
| dolar_getiri_60g | 0.0652 | -0.0839 | +1.15 |
| getiri_60g | 0.112 | -0.0411 | +1.15 |
| zirveden_dusus | -0.128 | -0.268 | +1.07 |
| zirve_52h_yakinlik | 0.872 | 0.732 | +1.07 |
| endekse_gore_20g | 0.0506 | -0.036 | +1.05 |
| ma50_uzaklik | 0.0413 | -0.0212 | +0.99 |
| getiri_120g | 0.145 | -0.0358 | +0.95 |
| rsi_14 | 56 | 46.6 | +0.90 |
| kar_buyume_yillik | -1.43 | -1.43 | +0.77 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.12 | 0.0505 | +0.58 |
| endekse_gore_60g | -0.115 | -0.0425 | -0.45 |
| net_borc_ozkaynak | 0.663 | 0.627 | +0.42 |
| gunici_ort_20g | -0.00328 | -0.00201 | -0.40 |
| kazanc_verimi | -0.204 | -0.139 | -0.38 |
| roe_ttm | -0.133 | -0.109 | -0.35 |
| beta_60g | 0.913 | 0.992 | -0.35 |
| atr_20g_oran | 0.0345 | 0.0304 | +0.33 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| endekse_gore_60g | 633 | 633 |  | -0.43 | 0.000 | +5.9% | -6.9% | 0% | 61% | -0.357–-0.181 | 0.0836–0.389 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.35 | 0.000 | +4.0% | -9.0% | 0% | 68% | 3.9e+04–4.35e+04 | 5.53e+04–6.83e+04 |
| pd_dd | 692 | 627 |  | -0.33 | 0.000 | +4.3% | -1.3% | 6% | 40% | 0.511–0.67 | 0.931–2.99 |
| endekse_gore_20g | 673 | 672 |  | -0.29 | 0.000 | +3.9% | -5.0% | 3% | 58% | -0.26–-0.0761 | 0.0543–0.366 |
| rsi_14 | 678 | 670 |  | -0.27 | 0.000 | +2.9% | -5.1% | 4% | 51% | 22.7–40.5 | 59.8–86.9 |
| zirve_52h_yakinlik | 573 | 479 |  | -0.27 | 0.000 | +3.3% | -4.9% | 2% | 58% | 0.593–0.681 | 0.873–1.06 |
| zirveden_dusus | 573 | 468 |  | -0.27 | 0.000 | +3.3% | -4.9% | 2% | 58% | -0.407–-0.319 | -0.127–0 |
| getiri_60g | 633 | 632 |  | -0.25 | 0.000 | +2.9% | -4.1% | 2% | 56% | -0.313–-0.117 | 0.103–0.405 |
| dolar_getiri_60g | 633 | 633 |  | -0.25 | 0.000 | +2.9% | -4.4% | 2% | 57% | -0.346–-0.155 | 0.0599–0.351 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.22 | 0.000 | +4.0% | -5.3% | 10% | 39% | -0.324–-0.146 | 0.0885–0.796 |
| getiri_20g | 673 | 669 |  | -0.22 | 0.000 | +1.2% | -5.5% | 12% | 56% | -0.281–-0.0749 | 0.0817–0.395 |
| ma50_uzaklik | 643 | 642 |  | -0.22 | 0.000 | +1.8% | -3.2% | 3% | 48% | -0.197–-0.0708 | 0.0526–0.301 |
| kazanc_verimi | 643 | 582 |  | -0.21 | 0.000 | +2.0% | -3.6% | 12% | 16% | -0.392–-0.31 | 0.349–0.486 |
| ma20_uzaklik | 673 | 672 |  | -0.21 | 0.000 | +1.3% | -4.7% | 16% | 51% | -0.183–-0.0465 | 0.0523–0.287 |
| getiri_120g | 573 | 573 |  | -0.22 | 0.000 | -0.6% | -5.8% | 9% | 61% | -0.319–-0.119 | 0.137–0.598 |
| gunici_ort_20g | 673 | 656 |  | -0.20 | 0.000 | +0.6% | -4.8% | 19% | 44% | -0.0163–-0.00542 | 0.000709–0.0093 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.19 | 0.000 | +0.5% | -6.4% | 17% | 34% | -0.251–-0.215 | 0.337–0.337 |
| ma200_uzaklik | 493 | 493 |  | -0.19 | 0.001 | +0.9% | -4.9% | 1% | 64% | -0.23–-0.132 | 0.0723–0.445 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| haber | evet | 2 | +2.4% | -1.8% | -1.6% | -11.3% | 0% |
| faiz | hayır | 23 | +0.3% | -0.4% | -1.1% | +0.8% | 43% |
| siyasi | hayır | 9 | -0.9% | -0.8% | -0.7% | -2.1% | 44% |
| enflasyon | hayır | 6 | -0.5% | -1.6% | +0.8% | -3.9% | 17% |
| jeopolitik | hayır | 5 | +4.1% | +3.0% | -0.3% | +5.7% | 40% |
| sok | hayır | 5 | -6.6% | -0.8% | +3.5% | +6.0% | 100% |
| tarife | hayır | 5 | +0.9% | +1.4% | -0.1% | +1.9% | 60% |
| derecelendirme | hayır | 4 | -0.7% | +0.6% | -0.7% | +1.8% | 50% |
| dusus | hayır | 3 | -1.6% | -0.0% | -1.6% | -6.1% | 33% |
| yukselis | hayır | 3 | +0.6% | +2.6% | +3.7% | +4.0% | 33% |
| butce_vergi | hayır | 2 | -1.1% | -0.8% | -1.6% | -7.8% | 0% |
| kur | hayır | 2 | +3.4% | +0.7% | +1.8% | +0.1% | 50% |
| YÖN: notr | evet | 1 | - | -3.5% | -11.6% | -19.0% | nan% |
| YÖN: olumlu | evet | 1 | - | -0.2% | +8.3% | -3.6% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 212 deneme. Al-tut Sharpe: eğitim 0.13, test 0.07.
Eğitimde seçilen kural: **max_gunluk_20g > 0.0315 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.60 → test Sharpe 1.29; testte nakitte kalma oranı 79%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.6%, test -0.2%.
Deflated Sharpe (deneme sayısı 212): 0.22 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.5 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.7 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.1% | 0.7 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.2 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.3 |
| ay_donusu | 1.0 | 192 | -0.3% | -2.0 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.2 |
| bayram_oncesi | 1.0 | 5 | -0.1% | -0.3 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.2 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.1 |
| bilanco_sezonu | 0.0 | 422 | -0.0% | -0.2 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.0123, getiri_5g=0.00426, getiri_20g=-0.196, getiri_60g=-0.138, getiri_120g=-0.363, mom_12_1=0.19, zirve_52h_yakinlik=0.613, zirveden_dusus=-0.387, oynaklik_20g=0.455, oynaklik_60g=0.605, atr_20g_oran=0.0498, rsi_14=34.1, ma20_uzaklik=-0.108, ma50_uzaklik=-0.181, ma200_uzaklik=-0.186, hacim_z_20=1.87, amihud_20g=0.0289, devir_hizi_20g=0.0375, gece_ort_20g=-0.00783, gunici_ort_20g=-0.00325, aof_1g_sapma=-0.0047, max_gunluk_20g=0.0428, min_gunluk_20g=-0.0703, ivol_60g=0.456, endekse_gore_1g=-0.00392, endekse_gore_20g=-0.147, endekse_gore_60g=0.038, beta_60g=1.41, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.177, piyasa_degeri_mn=4.19e+04, halka_aciklik=0.484, kazanc_verimi=-0.0942, pd_dd=0.556, snak_verimi=0.107, temettu_verimi=0, roe_ttm=-0.0524, net_kar_marji=0.107, satis_buyume_yillik=0.373, net_borc_ozkaynak=0.663, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1