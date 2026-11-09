# Hisse dosyası analizi — SASA

Satır: 3982 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 290 (32 bağımsız bölüm); ≥%10 yükseliş 182 gün (24 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +465.2% (t=4.2), gün içi (açılış→kapanış) toplam -93.7% (t=-3.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | -0.106 | -0.179 | +0.91 |
| endekse_gore_60g | -0.0378 | -0.138 | +0.75 |
| getiri_120g | -0.0486 | -0.212 | +0.72 |
| zirve_52h_yakinlik | 0.612 | 0.555 | +0.59 |
| zirveden_dusus | -0.388 | -0.445 | +0.59 |
| getiri_60g | -0.0227 | -0.133 | +0.57 |
| ma50_uzaklik | -0.0225 | -0.061 | +0.54 |
| dolar_getiri_60g | -0.0585 | -0.163 | +0.54 |
| endekse_gore_20g | -0.0353 | -0.0564 | +0.52 |
| oynaklik_20g | 0.489 | 0.425 | +0.50 |
| net_borc_ozkaynak | 0.798 | 0.84 | -0.44 |
| rsi_14 | 47.1 | 44.4 | +0.43 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| endekse_gore_60g | -0.166 | -0.0619 | -0.80 |
| zirveden_dusus | -0.467 | -0.408 | -0.75 |
| ma200_uzaklik | -0.212 | -0.141 | -0.75 |
| zirve_52h_yakinlik | 0.533 | 0.592 | -0.75 |
| mom_12_1 | -0.316 | -0.269 | -0.68 |
| getiri_120g | -0.206 | -0.103 | -0.60 |
| ivol_60g | 0.32 | 0.368 | -0.56 |
| dolar_getiri_60g | -0.195 | -0.0732 | -0.53 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 634 | 625 |  | -0.32 | 0.000 | +3.5% | -9.7% | 24% | 66% | -0.451–-0.206 | 0.104–0.607 |
| zirveden_dusus | 574 | 335 |  | -0.41 | 0.000 | +5.6% | -12.0% | 23% | 74% | -0.59–-0.515 | -0.315–0 |
| zirve_52h_yakinlik | 574 | 336 |  | -0.41 | 0.000 | +5.6% | -12.0% | 23% | 74% | 0.41–0.485 | 0.685–1.04 |
| getiri_120g | 574 | 567 |  | -0.47 | 0.000 | +2.3% | -14.8% | 30% | 81% | -0.509–-0.265 | 0.0252–0.52 |
| ma200_uzaklik | 494 | 494 |  | -0.53 | 0.000 | +4.4% | -15.9% | 18% | 92% | -0.32–-0.223 | -0.0709–0.439 |
| dolar_getiri_60g | 634 | 634 |  | -0.33 | 0.000 | +3.8% | -9.5% | 25% | 64% | -0.469–-0.244 | 0.062–0.534 |
| endekse_gore_60g | 634 | 634 |  | -0.51 | 0.000 | +7.7% | -14.2% | 21% | 78% | -0.46–-0.203 | 0.0173–0.352 |
| amihud_20g | 633 | 611 |  | +0.27 | 0.000 | -7.9% | +5.9% | 54% | 28% | 0.00278–0.00508 | 0.0135–0.0297 |
| ivol_60g | 574 | 573 |  | -0.28 | 0.000 | +3.8% | -9.9% | 23% | 55% | 0.189–0.287 | 0.494–0.64 |
| snak_verimi | 644 | 504 |  | -0.24 | 0.000 | +7.1% | -2.7% | 26% | 43% | -0.205–-0.151 | 0.014–0.0413 |
| oynaklik_60g | 633 | 628 |  | -0.23 | 0.000 | +2.6% | -9.1% | 37% | 54% | 0.301–0.382 | 0.587–0.718 |
| ma50_uzaklik | 644 | 642 |  | -0.20 | 0.000 | -2.0% | -9.9% | 29% | 64% | -0.263–-0.125 | 0.0475–0.605 |
| bilancodan_gun | 694 | 303 | seviye | +0.19 | 0.000 | -3.3% | +3.2% | 48% | 32% | 0.917–19 | 79–113 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.19 | 0.000 | -3.9% | -0.5% | 45% | 32% | -0.897–-0.0697 | 0.99–1.01 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.19 | 0.000 | +2.4% | -8.4% | 32% | 61% | -0.196–-0.162 | 0.282–0.362 |
| oynaklik_20g | 673 | 664 |  | -0.18 | 0.000 | -0.9% | -8.9% | 35% | 63% | 0.167–0.336 | 0.565–1.01 |
| beta_60g | 633 | 633 |  | -0.18 | 0.000 | -1.1% | -7.7% | 50% | 54% | 0.577–1.01 | 1.34–1.61 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.17 | 0.001 | -8.3% | +6.3% | 60% | 7% | 0.707–0.786 | 0.922–1.82 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bedelli | evet | 3 | -3.1% | -1.1% | -0.2% | +6.5% | 33% |
| dusus | evet | 2 | +1.8% | -1.2% | -5.3% | -10.2% | 0% |
| yatirim | evet | 2 | +0.3% | -0.9% | -1.6% | -2.5% | 50% |
| faiz | hayır | 41 | -0.3% | +0.2% | -0.7% | -2.1% | 22% |
| siyasi | hayır | 17 | -0.6% | +0.1% | -3.0% | -4.2% | 35% |
| derecelendirme | hayır | 15 | -0.5% | -0.0% | +0.5% | +3.5% | 27% |
| jeopolitik | hayır | 10 | +0.1% | -0.2% | -0.3% | -1.4% | 40% |
| enflasyon | hayır | 9 | +0.7% | -1.7% | -6.8% | -12.6% | 11% |
| regulasyon | hayır | 6 | -1.8% | -1.9% | -1.3% | +0.7% | 67% |
| haber | hayır | 5 | +1.2% | -1.4% | -5.9% | -13.1% | 0% |
| kuresel_faiz | hayır | 5 | -1.5% | -0.3% | -2.3% | -14.8% | 20% |
| sok | hayır | 5 | -7.8% | -4.2% | -10.3% | -12.4% | 20% |
| tarife | hayır | 5 | +0.7% | +1.6% | +4.2% | +4.5% | 40% |
| kur | hayır | 4 | -1.2% | -0.9% | -0.4% | +2.1% | 50% |
| dusus | hayır | 3 | -1.5% | -0.0% | -1.2% | +4.1% | 67% |
| yukselis | hayır | 3 | +2.8% | +0.4% | +0.4% | -0.3% | 67% |
| butce_vergi | hayır | 2 | -1.8% | +2.3% | +1.6% | -16.8% | 0% |
| YÖN: olumlu | evet | 6 | - | -0.6% | -1.8% | -0.1% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 198 deneme. Al-tut Sharpe: eğitim 0.09, test -1.25.
Eğitimde seçilen kural: **getiri_1g < 0.01032 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.70 → test Sharpe -0.12; testte nakitte kalma oranı 70%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.1%, test -3.6%.
Deflated Sharpe (deneme sayısı 198): 0.02 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.1 |
| haftanin_gunu | 1.0 | 143 | -0.6% | -3.0 |
| haftanin_gunu | 2.0 | 141 | -0.6% | -2.1 |
| haftanin_gunu | 3.0 | 143 | +0.7% | 2.4 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 522 | -0.0% | -0.1 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.6 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.8 |
| bayram_oncesi | 1.0 | 6 | -0.3% | -0.8 |
| bayram_sonrasi | 0.0 | 708 | -0.1% | -1.0 |
| bayram_sonrasi | 1.0 | 6 | +2.0% | 3.2 |
| bilanco_sezonu | 0.0 | 423 | -0.2% | -1.4 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=0.0316, getiri_5g=0.101, getiri_20g=-0.16, getiri_60g=-0.321, getiri_120g=-0.426, mom_12_1=-0.368, zirve_52h_yakinlik=0.459, zirveden_dusus=-0.541, oynaklik_20g=0.552, oynaklik_60g=0.614, atr_20g_oran=0.0494, rsi_14=38.3, ma20_uzaklik=-0.0169, ma50_uzaklik=-0.198, ma200_uzaklik=-0.333, hacim_z_20=0.133, amihud_20g=0.019, devir_hizi_20g=0.051, gece_ort_20g=-0.00389, gunici_ort_20g=-0.00409, aof_1g_sapma=0.00573, max_gunluk_20g=0.1, min_gunluk_20g=-0.046, ivol_60g=0.453, endekse_gore_1g=0.00892, endekse_gore_20g=-0.117, endekse_gore_60g=-0.15, beta_60g=1.44, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.352, piyasa_degeri_mn=8.56e+04, halka_aciklik=0.452, kazanc_verimi=-0.177, pd_dd=0.444, fd_favok=15.1, snak_verimi=-0.119, temettu_verimi=0, roe_ttm=-0.0787, net_kar_marji=-0.0542, satis_buyume_yillik=0.282, net_borc_ozkaynak=0.707, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0