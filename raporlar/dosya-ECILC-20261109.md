# Hisse dosyası analizi — ECILC

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 249 (43 bağımsız bölüm); ≥%10 yükseliş 235 gün (24 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +306.2% (t=3.5), gün içi (açılış→kapanış) toplam -71.4% (t=-1.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.0525 | 0.0852 | -0.57 |
| kar_buyume_yillik | -1.46 | -0.238 | -0.55 |
| bilancodan_gun | 32 | 54 | -0.54 |
| piyasa_degeri_mn | 4.43e+04 | 3.66e+04 | +0.53 |
| halka_aciklik | 0.187 | 0.187 | +0.45 |
| snak_verimi | 0.0877 | 0.109 | -0.45 |
| net_kar_marji | 0.0369 | 0.217 | -0.43 |
| roe_ttm | 0.06 | 0.06 | -0.42 |
| atr_20g_oran | 0.0395 | 0.034 | +0.38 |
| fk | 12 | 11 | +0.37 |
| endekse_gore_20g | 0.0149 | -0.0235 | +0.37 |
| satis_buyume_yillik | 0.0214 | 0.0214 | -0.36 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| snak_verimi | 0.143 | 0.0866 | +0.91 |
| amihud_20g | 0.125 | 0.0876 | +0.56 |
| gece_ort_20g | 0.00159 | 0.00277 | -0.52 |
| net_kar_marji | 0.182 | 0.182 | +0.49 |
| ivol_60g | 0.414 | 0.378 | +0.47 |
| min_gunluk_20g | -0.0535 | -0.0419 | -0.46 |
| halka_aciklik | 0.187 | 0.187 | -0.45 |
| oynaklik_60g | 0.467 | 0.446 | +0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| snak_verimi | 643 | 598 |  | +0.51 | 0.000 | -10.1% | +17.7% | 56% | 23% | 0.0256–0.0427 | 0.156–0.293 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.32 | 0.000 | -9.9% | +7.9% | 61% | 24% | -0.383–-0.223 | 0.723–1.22 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.33 | 0.000 | +6.3% | -4.5% | 9% | 52% | 2.7e+04–3.29e+04 | 5.91e+04–9.14e+04 |
| kar_buyume_yillik | 540 | 9 | çeyreklik adım | +0.33 | 0.000 | -8.3% | -1.8% | 61% | 19% | -7.59–-1.89 | 12.2–12.2 |
| amihud_20g | 672 | 669 |  | +0.30 | 0.000 | +0.6% | +4.7% | 42% | 23% | 0.038–0.0694 | 0.159–0.359 |
| kazanc_verimi | 643 | 598 |  | +0.28 | 0.000 | -10.6% | +2.4% | 65% | 12% | -0.0458–0.0377 | 0.114–0.147 |
| min_gunluk_20g | 672 | 70 |  | -0.23 | 0.000 | +8.3% | -2.2% | 35% | 36% | -0.12–-0.0801 | -0.032–-0.0142 |
| mom_12_1 | 441 | 441 |  | -0.26 | 0.000 | +4.0% | -5.6% | 24% | 47% | -0.31–-0.138 | 1.09–2 |
| temettu_verimi | 693 | 511 |  | +0.21 | 0.000 | +0.3% | +11.7% | 34% | 16% | 0–0.0153 | 0.0275–0.0667 |
| bilancodan_gun | 693 | 303 | seviye | +0.20 | 0.000 | -4.2% | +1.0% | 60% | 22% | 0.917–19 | 79–113 |
| aof_1g_sapma | 692 | 691 |  | +0.15 | 0.004 | -3.4% | +1.7% | 48% | 29% | -0.0505–0.0109 | 0.0628–0.112 |
| gece_ort_20g | 672 | 650 |  | -0.15 | 0.007 | +9.4% | +1.4% | 26% | 37% | -0.014–-5.23e-06 | 0.00451–0.0138 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.15 | 0.008 | -1.4% | -1.8% | 41% | 19% | -0.173–-0.013 | 0.686–0.686 |
| pd_dd | 692 | 664 |  | -0.14 | 0.016 | +3.7% | +0.4% | 19% | 34% | 0.49–0.671 | 1.11–2.25 |
| roe_ttm | 643 | 11 | çeyreklik adım | +0.13 | 0.031 | -5.6% | -3.1% | 45% | 36% | -0.0263–0.0228 | 0.107–0.107 |
| getiri_120g | 573 | 573 |  | +0.14 | 0.057 | -1.7% | +5.8% | 34% | 34% | -0.498–-0.183 | 0.707–1.51 |
| fd_favok | 643 | 639 |  | -0.12 | 0.081 | -0.5% | +2.6% | 24% | 39% | 13.9–17.6 | 37–66 |
| xu100_getiri_20g | 673 | 671 |  | +0.12 | 0.117 | -2.1% | +2.4% | 41% | 29% | -0.166–-0.0409 | 0.0783–0.222 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.4% | -0.8% | -1.0% | +6.8% | 56% |
| siyasi | hayır | 17 | +0.1% | +0.8% | +1.2% | +14.0% | 76% |
| derecelendirme | hayır | 15 | -0.1% | -0.5% | -3.5% | +1.0% | 47% |
| jeopolitik | hayır | 10 | -0.5% | -0.1% | -3.1% | -7.9% | 0% |
| enflasyon | hayır | 9 | +0.6% | -0.7% | +3.4% | +5.6% | 56% |
| regulasyon | hayır | 6 | -1.5% | -1.2% | +3.7% | +2.5% | 67% |
| haber | hayır | 5 | +0.5% | -0.9% | +6.6% | +0.4% | 40% |
| kuresel_faiz | hayır | 5 | -0.0% | -0.7% | +3.5% | +13.5% | 20% |
| sok | hayır | 5 | -7.2% | -0.2% | +2.2% | +2.1% | 60% |
| tarife | hayır | 5 | +1.0% | +0.3% | +1.7% | +1.7% | 60% |
| kur | hayır | 4 | +0.3% | +1.5% | -0.1% | -10.8% | 25% |
| dusus | hayır | 3 | -0.9% | -0.3% | -1.9% | -3.2% | 33% |
| yukselis | hayır | 3 | +3.8% | -0.6% | +0.8% | +1.8% | 67% |
| butce_vergi | hayır | 2 | -0.7% | -0.8% | -1.2% | +6.4% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 215 deneme. Al-tut Sharpe: eğitim 0.83, test -0.25.
Eğitimde seçilen kural: **endekse_gore_60g > -0.08159 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.78 → test Sharpe -0.5; testte nakitte kalma oranı 52%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.8%, test -3.3%.
Deflated Sharpe (deneme sayısı 215): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.5% | -1.8 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.0 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -1.4 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.5 |
| haftanin_gunu | 4.0 | 143 | +0.5% | 2.2 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.5 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.5 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.5 |
| bayram_oncesi | 1.0 | 5 | +1.4% | 0.8 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.6 |
| bayram_sonrasi | 1.0 | 6 | +0.5% | 0.5 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -0.6 |
| bilanco_sezonu | 1.0 | 291 | +0.3% | 1.6 |

## Son durum (en yeni satır)

getiri_1g=0.0509, getiri_5g=0.163, getiri_20g=-0.172, getiri_60g=-0.314, getiri_120g=-0.394, mom_12_1=-0.224, zirve_52h_yakinlik=0.395, zirveden_dusus=-0.605, oynaklik_20g=0.509, oynaklik_60g=0.58, atr_20g_oran=0.0474, rsi_14=39.3, ma20_uzaklik=0.00338, ma50_uzaklik=-0.154, ma200_uzaklik=-0.398, hacim_z_20=-0.108, amihud_20g=0.211, devir_hizi_20g=0.0194, gece_ort_20g=-0.00684, gunici_ort_20g=-0.00449, aof_1g_sapma=0.00896, max_gunluk_20g=0.0534, min_gunluk_20g=-0.0761, ivol_60g=0.43, endekse_gore_1g=0.0312, endekse_gore_20g=-0.126, endekse_gore_60g=-0.141, beta_60g=1.39, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.345, piyasa_degeri_mn=3.54e+04, halka_aciklik=0.219, kazanc_verimi=-0.0511, pd_dd=0.514, fd_favok=23.7, snak_verimi=0.0389, temettu_verimi=0.0339, roe_ttm=-0.0263, net_kar_marji=-0.383, kar_buyume_yillik=-2.74, satis_buyume_yillik=-0.173, net_borc_ozkaynak=0.0266, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0