# Hisse dosyası analizi — SISE

Satır: 3978 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 167 (31 bağımsız bölüm); ≥%10 yükseliş 150 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +218.3% (t=3.7), gün içi (açılış→kapanış) toplam -75.8% (t=-2.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.0282 | 0.0217 | +0.85 |
| ma50_uzaklik | 0.0197 | -0.0364 | +0.81 |
| amihud_20g | 0.0087 | 0.012 | -0.81 |
| zirve_52h_yakinlik | 0.862 | 0.766 | +0.77 |
| zirveden_dusus | -0.138 | -0.234 | +0.76 |
| ma200_uzaklik | 0.0245 | -0.0576 | +0.72 |
| rsi_14 | 53.1 | 44.6 | +0.70 |
| ma20_uzaklik | 0.0192 | -0.0182 | +0.69 |
| getiri_20g | 0.0266 | -0.0298 | +0.69 |
| endekse_gore_20g | -0.000232 | -0.0286 | +0.66 |
| dolar_getiri_60g | -0.00168 | -0.0775 | +0.66 |
| getiri_60g | 0.0352 | -0.0399 | +0.65 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.2e+05 | 1.32e+05 | -0.63 |
| endekse_gore_20g | -0.0552 | -0.0175 | -0.61 |
| roe_ttm | 0.0256 | 0.0487 | -0.60 |
| fk | 19.8 | 10.2 | +0.57 |
| kazanc_verimi | 0.0505 | 0.0983 | -0.52 |
| oynaklik_20g | 0.273 | 0.327 | -0.48 |
| max_gunluk_20g | 0.033 | 0.0394 | -0.47 |
| snak_verimi | 0.145 | 0.164 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| amihud_20g | 672 | 657 |  | +0.37 | 0.000 | -4.8% | +4.2% | 46% | 4% | 0.00427–0.00786 | 0.0151–0.0245 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.31 | 0.000 | +3.8% | -3.1% | 6% | 37% | 9.98e+04–1.16e+05 | 1.5e+05–1.77e+05 |
| devir_hizi_20g | 673 | 663 |  | -0.29 | 0.000 | +2.6% | -4.3% | 7% | 48% | 0.0114–0.0169 | 0.0307–0.0646 |
| endekse_gore_20g | 673 | 671 |  | -0.29 | 0.000 | +3.7% | -3.9% | 8% | 40% | -0.159–-0.0693 | 0.027–0.147 |
| max_gunluk_20g | 672 | 67 |  | -0.22 | 0.000 | +2.8% | -3.4% | 6% | 39% | 0.0112–0.0277 | 0.0697–0.121 |
| rsi_14 | 678 | 668 |  | -0.22 | 0.000 | +1.6% | -3.8% | 5% | 39% | 21.5–38 | 57.8–79.7 |
| temettu_verimi | 693 | 488 |  | +0.21 | 0.000 | -1.6% | +1.9% | 29% | 5% | 0–0.0133 | 0.0183–0.0419 |
| getiri_20g | 673 | 673 |  | -0.21 | 0.000 | +1.2% | -3.9% | 8% | 45% | -0.179–-0.0786 | 0.0743–0.274 |
| ma20_uzaklik | 673 | 673 |  | -0.21 | 0.000 | +0.7% | -4.7% | 7% | 41% | -0.128–-0.0489 | 0.0394–0.163 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.21 | 0.000 | +1.7% | -5.9% | 23% | 45% | 0.0245–0.0247 | 0.142–0.142 |
| gece_ort_20g | 672 | 647 |  | -0.20 | 0.000 | +2.6% | -0.3% | 9% | 27% | -0.00525–-0.000159 | 0.0035–0.013 |
| mom_12_1 | 441 | 440 |  | -0.23 | 0.000 | +2.3% | -2.8% | 12% | 30% | -0.369–-0.231 | 0.205–0.567 |
| zirveden_dusus | 573 | 497 |  | -0.20 | 0.000 | +1.1% | -2.8% | 6% | 50% | -0.402–-0.292 | -0.113–0 |
| zirve_52h_yakinlik | 573 | 505 |  | -0.20 | 0.000 | +1.1% | -2.8% | 6% | 50% | 0.598–0.708 | 0.887–1.05 |
| ma50_uzaklik | 643 | 643 |  | -0.18 | 0.000 | +1.1% | -4.6% | 4% | 50% | -0.146–-0.0672 | 0.0531–0.222 |
| gunici_ort_20g | 673 | 656 |  | -0.18 | 0.000 | -0.5% | -3.4% | 15% | 42% | -0.00949–-0.00517 | 0.00113–0.00673 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.18 | 0.001 | -4.6% | -0.6% | 31% | 34% | -0.119–0.0128 | 0.231–0.231 |
| pd_dd | 692 | 661 |  | -0.16 | 0.001 | +0.3% | -3.7% | 15% | 33% | 0.417–0.499 | 0.801–1.83 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +1.0% | +0.0% | +0.6% | -1.0% | 39% |
| siyasi | hayır | 9 | -1.0% | -0.3% | -0.6% | -2.8% | 33% |
| enflasyon | hayır | 6 | +1.4% | -0.0% | -0.5% | -3.1% | 0% |
| jeopolitik | hayır | 5 | -1.0% | -0.4% | -1.0% | +1.1% | 40% |
| sok | hayır | 5 | -6.9% | -0.1% | +2.2% | +2.6% | 80% |
| tarife | hayır | 5 | +2.5% | +0.1% | -0.9% | +0.3% | 40% |
| derecelendirme | hayır | 4 | +1.0% | -0.2% | +0.8% | +2.6% | 50% |
| dusus | hayır | 3 | -2.2% | +1.8% | +0.6% | -1.6% | 33% |
| yukselis | hayır | 3 | +1.7% | -0.4% | -1.5% | -0.1% | 67% |
| butce_vergi | hayır | 2 | -2.3% | -0.3% | -2.3% | -12.8% | 0% |
| kur | hayır | 2 | -0.8% | +0.8% | +0.1% | +1.1% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 195 deneme. Al-tut Sharpe: eğitim -0.13, test -0.03.
Eğitimde seçilen kural: **rsi_14 > 39.54 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.95 → test Sharpe 1.44; testte nakitte kalma oranı 83%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.3%, test -0.1%.
Deflated Sharpe (deneme sayısı 195): 0.38 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 0.8 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.9 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.4 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.8 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.8 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.8 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.2 |
| bayram_oncesi | 1.0 | 5 | +0.4% | 0.6 |
| bayram_sonrasi | 0.0 | 707 | -0.0% | -0.3 |
| bayram_sonrasi | 1.0 | 6 | +1.4% | 0.8 |
| bilanco_sezonu | 0.0 | 422 | -0.0% | -0.2 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.0 |

## Son durum (en yeni satır)

getiri_1g=0.035, getiri_5g=0.063, getiri_20g=-0.0674, getiri_60g=-0.144, getiri_120g=-0.267, mom_12_1=0.00639, zirve_52h_yakinlik=0.677, zirveden_dusus=-0.323, oynaklik_20g=0.387, oynaklik_60g=0.475, atr_20g_oran=0.0331, rsi_14=41.8, ma20_uzaklik=0.00314, ma50_uzaklik=-0.0709, ma200_uzaklik=-0.176, hacim_z_20=2.73, amihud_20g=0.0222, devir_hizi_20g=0.0188, gece_ort_20g=-0.00578, gunici_ort_20g=0.00115, aof_1g_sapma=0.0137, max_gunluk_20g=0.0386, min_gunluk_20g=-0.0531, ivol_60g=0.318, endekse_gore_1g=0.0189, endekse_gore_20g=-0.0182, endekse_gore_60g=0.0319, beta_60g=1.25, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.183, piyasa_degeri_mn=1.09e+05, halka_aciklik=0.435, fk=8.77, kazanc_verimi=0.114, pd_dd=0.402, fd_favok=11.5, snak_verimi=0.129, temettu_verimi=0.0166, roe_ttm=0.0459, net_kar_marji=0.0537, kar_buyume_yillik=-0.0377, satis_buyume_yillik=-0.119, net_borc_ozkaynak=0.556, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1