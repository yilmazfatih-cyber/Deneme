# Hisse dosyası analizi — BRSAN

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 254 (40 bağımsız bölüm); ≥%10 yükseliş 244 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +1614.0% (t=5.9), gün içi (açılış→kapanış) toplam -93.3% (t=-3.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| gece_ort_20g | 0.00522 | 0.00365 | +0.66 |
| xu100_ma200_uzaklik | 0.0972 | 0.0622 | +0.57 |
| getiri_20g | 0.0141 | -0.0368 | +0.52 |
| satis_buyume_yillik | 0.592 | 0.43 | +0.47 |
| xu100_getiri_20g | 0.0246 | 0.00344 | +0.46 |
| pd_dd | 2.29 | 2.01 | +0.45 |
| ma200_uzaklik | 0.147 | 0.0343 | +0.45 |
| ma20_uzaklik | 0.01 | -0.0189 | +0.41 |
| piyasa_degeri_mn | 7.27e+04 | 6.7e+04 | +0.38 |
| devir_hizi_20g | 0.0432 | 0.0368 | +0.38 |
| halka_aciklik | 0.193 | 0.196 | -0.37 |
| ma50_uzaklik | -0.0108 | -0.0206 | +0.36 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| roe_ttm | 0.025 | 0.0442 | -0.54 |
| fk | 41.7 | 35.9 | +0.47 |
| pd_dd | 1.88 | 2.18 | -0.42 |
| xu100_ma200_uzaklik | 0.0952 | 0.0263 | +0.40 |
| kazanc_verimi | 0.0133 | 0.0241 | -0.39 |
| piyasa_degeri_mn | 6.93e+04 | 6.88e+04 | -0.38 |
| satis_buyume_yillik | 0.592 | 0.511 | -0.33 |
| gece_ort_20g | 0.00455 | 0.0042 | -0.31 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pd_dd | 692 | 640 |  | -0.36 | 0.000 | +5.5% | -7.5% | 24% | 63% | 1.23–1.66 | 2.49–5.02 |
| piyasa_degeri_mn | 692 | 578 | seviye | -0.24 | 0.000 | +8.1% | -6.3% | 24% | 53% | 4.23e+04–5.55e+04 | 8.7e+04–1.1e+05 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.24 | 0.000 | +6.2% | -5.1% | 31% | 65% | -0.0297–-0.00983 | 0.113–0.164 |
| gece_ort_20g | 672 | 648 |  | -0.20 | 0.000 | +7.3% | -6.8% | 12% | 64% | -0.0132–0.000406 | 0.00838–0.0202 |
| xu100_getiri_20g | 673 | 671 |  | -0.19 | 0.000 | +8.4% | -3.2% | 16% | 50% | -0.166–-0.0409 | 0.0783–0.222 |
| getiri_20g | 673 | 671 |  | -0.19 | 0.000 | +7.7% | -3.2% | 21% | 54% | -0.337–-0.107 | 0.147–0.579 |
| ma20_uzaklik | 673 | 673 |  | -0.17 | 0.001 | +8.1% | -2.2% | 24% | 47% | -0.277–-0.0667 | 0.0693–0.381 |
| kazanc_verimi | 643 | 590 |  | -0.17 | 0.001 | +7.3% | -0.5% | 19% | 53% | -0.0224–-0.00535 | 0.0344–0.0608 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.16 | 0.003 | +2.3% | -3.8% | 26% | 61% | -0.294–0.313 | 0.769–1.2 |
| usdtry_getiri_20g | 672 | 664 |  | +0.13 | 0.028 | -3.0% | +0.6% | 47% | 37% | -0.013–0.00947 | 0.019–0.0482 |
| fd_favok | 643 | 592 |  | -0.13 | 0.041 | +6.4% | -3.0% | 36% | 38% | 9.59–13.2 | 18.5–23.8 |
| rsi_14 | 678 | 671 |  | -0.11 | 0.133 | +4.4% | -1.1% | 35% | 46% | 14.3–38.3 | 60–83.9 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.11 | 0.176 | +2.0% | -2.6% | 24% | 43% | -0.0246–-0.0246 | 0.0547–0.0614 |
| devir_hizi_20g | 673 | 668 |  | -0.10 | 0.347 | +2.1% | -2.3% | 25% | 54% | 0.0104–0.0219 | 0.057–0.105 |
| ma50_uzaklik | 643 | 643 |  | -0.10 | 0.357 | +4.5% | -3.9% | 35% | 56% | -0.23–-0.0966 | 0.11–0.433 |
| kar_buyume_yillik | 419 | 7 | çeyreklik adım | -0.13 | 0.385 | +4.0% | +2.8% | 29% | 40% | -1.78–-1.6 | 2.23–2.23 |
| bilancodan_gun | 693 | 303 | seviye | +0.10 | 0.416 | +1.5% | +3.2% | 40% | 43% | 0.917–19 | 79–113 |
| snak_verimi | 643 | 590 |  | +0.10 | 0.635 | +0.2% | +6.4% | 21% | 42% | -0.0229–-0.0163 | 0.106–0.148 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.1% | +0.4% | +0.6% | +0.3% | 35% |
| siyasi | hayır | 9 | -1.1% | +0.7% | +0.3% | +0.3% | 56% |
| sok | hayır | 7 | -3.2% | +1.5% | +4.0% | +9.3% | 86% |
| enflasyon | hayır | 6 | -0.2% | +1.9% | +1.8% | -3.7% | 17% |
| jeopolitik | hayır | 5 | -5.2% | -3.1% | -6.2% | -1.9% | 40% |
| tarife | hayır | 5 | +1.3% | -0.0% | -2.0% | +3.9% | 40% |
| derecelendirme | hayır | 4 | +0.1% | +0.1% | -0.1% | -5.4% | 25% |
| dusus | hayır | 3 | +1.6% | +0.4% | +5.6% | +0.3% | 67% |
| yukselis | hayır | 3 | +0.7% | -1.7% | -6.9% | -4.7% | 33% |
| butce_vergi | hayır | 2 | +0.4% | -0.9% | -0.3% | -1.7% | 50% |
| kur | hayır | 2 | -1.4% | +0.1% | +0.9% | +5.2% | 50% |
| YÖN: olumsuz | evet | 1 | - | -2.6% | +17.5% | +2.8% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 173 deneme. Al-tut Sharpe: eğitim -0.18, test 0.85.
Eğitimde seçilen kural: **pd_dd > 1.811 ise nakde geç** (kantil 0.3). Eğitim Sharpe 0.91 → test Sharpe 1.42; testte nakitte kalma oranı 77%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -3.0%, test +2.2%.
Deflated Sharpe (deneme sayısı 173): 0.50 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.5 |
| haftanin_gunu | 1.0 | 142 | -0.4% | -1.5 |
| haftanin_gunu | 2.0 | 141 | -0.6% | -2.5 |
| haftanin_gunu | 3.0 | 143 | +0.9% | 3.5 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.5 |
| ay_donusu | 0.0 | 521 | +0.0% | 0.3 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.5 |
| bayram_oncesi | 1.0 | 5 | -0.4% | -0.7 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.2 |
| bayram_sonrasi | 1.0 | 6 | +3.8% | 2.4 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.7 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.0 |

## Son durum (en yeni satır)

getiri_1g=-0.00662, getiri_5g=0.0196, getiri_20g=0.0282, getiri_60g=0.0204, getiri_120g=0.299, mom_12_1=0.361, zirve_52h_yakinlik=0.868, zirveden_dusus=-0.132, oynaklik_20g=0.464, oynaklik_60g=0.518, atr_20g_oran=0.0367, rsi_14=55.7, ma20_uzaklik=0.0359, ma50_uzaklik=0.00937, ma200_uzaklik=0.111, hacim_z_20=1.72, amihud_20g=0.0277, devir_hizi_20g=0.0407, gece_ort_20g=-0.00117, gunici_ort_20g=0.00247, aof_1g_sapma=0.0313, max_gunluk_20g=0.0637, min_gunluk_20g=-0.0548, ivol_60g=0.429, endekse_gore_1g=-0.0228, endekse_gore_20g=0.0773, endekse_gore_60g=0.197, beta_60g=1, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0259, piyasa_degeri_mn=9.58e+04, halka_aciklik=0.209, fk=34.5, kazanc_verimi=0.029, pd_dd=2.21, fd_favok=12.8, snak_verimi=0.0889, temettu_verimi=0, roe_ttm=0.064, net_kar_marji=0.0604, kar_buyume_yillik=0.726, satis_buyume_yillik=0.43, net_borc_ozkaynak=0.17, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1