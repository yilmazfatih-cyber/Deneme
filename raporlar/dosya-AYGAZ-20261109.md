# Hisse dosyası analizi — AYGAZ

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 122 (20 bağımsız bölüm); ≥%10 yükseliş 232 gün (22 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +130.1% (t=2.6), gün içi (açılış→kapanış) toplam -15.9% (t=-0.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| snak_verimi | 0.0545 | 0.108 | -1.01 |
| ivol_60g | 0.398 | 0.265 | +0.91 |
| mom_12_1 | 0.759 | 0.2 | +0.90 |
| piyasa_degeri_mn | 5.18e+04 | 4.19e+04 | +0.81 |
| oynaklik_60g | 0.415 | 0.33 | +0.77 |
| satis_buyume_yillik | -0.0285 | 0.12 | -0.60 |
| gece_ort_20g | 0.00264 | 0.00102 | +0.54 |
| bilancodan_gun | 28.5 | 50.9 | -0.51 |
| olay_yon_5g | 0 | 0 | -0.47 |
| atr_20g_oran | 0.0339 | 0.0284 | +0.47 |
| oynaklik_20g | 0.362 | 0.308 | +0.45 |
| endekse_gore_60g | 0.0564 | 0.0242 | +0.39 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | 1.6 | 0.0581 | +0.77 |
| snak_verimi | 0.122 | 0.0934 | +0.53 |
| beta_60g | 0.515 | 0.708 | -0.52 |
| endekse_gore_60g | -0.00646 | 0.0419 | -0.49 |
| fd_favok | 11.1 | 14.4 | -0.42 |
| dolar_getiri_60g | 0.0317 | 0.119 | -0.38 |
| getiri_60g | 0.0721 | 0.153 | -0.36 |
| roe_ttm | 0.0718 | 0.111 | -0.33 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kar_buyume_yillik | 537 | 9 | çeyreklik adım | +0.35 | 0.000 | -2.7% | +9.5% | 29% | 25% | -1.01–-0.585 | 7.7–7.7 |
| fd_favok | 643 | 622 |  | -0.37 | 0.000 | +10.5% | -1.2% | 0% | 26% | 7.89–10.5 | 22.1–32.6 |
| temettu_verimi | 693 | 507 |  | +0.31 | 0.000 | +0.5% | +7.1% | 24% | 6% | 0–0.0387 | 0.068–0.145 |
| snak_verimi | 643 | 574 |  | +0.39 | 0.000 | -0.9% | +9.9% | 48% | 0% | 0.0347–0.0576 | 0.147–0.185 |
| beta_60g | 632 | 632 |  | -0.26 | 0.000 | +4.1% | -2.3% | 31% | 32% | -0.0292–0.404 | 0.804–1.11 |
| pd_dd | 692 | 626 |  | -0.24 | 0.000 | +6.3% | -2.1% | 17% | 26% | 0.406–0.68 | 0.906–3.68 |
| piyasa_degeri_mn | 692 | 673 | seviye | -0.23 | 0.000 | +6.3% | -1.3% | 6% | 37% | 2.78e+04–3.72e+04 | 5.3e+04–7.39e+04 |
| oynaklik_60g | 632 | 628 |  | -0.24 | 0.000 | +2.3% | -6.1% | 10% | 43% | 0.211–0.263 | 0.418–0.485 |
| dolar_getiri_60g | 633 | 633 |  | -0.21 | 0.000 | +4.1% | -2.3% | 6% | 29% | -0.346–-0.173 | 0.203–0.48 |
| bilancodan_gun | 693 | 303 | seviye | +0.20 | 0.000 | -1.4% | +3.3% | 31% | 9% | 0.917–19 | 79–113 |
| getiri_60g | 633 | 631 |  | -0.20 | 0.000 | +4.2% | -1.3% | 6% | 25% | -0.316–-0.129 | 0.254–0.549 |
| endekse_gore_60g | 633 | 633 |  | -0.19 | 0.000 | +5.1% | -2.6% | 14% | 26% | -0.273–-0.118 | 0.183–0.616 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.18 | 0.000 | +4.1% | -7.6% | 13% | 42% | 0.0406–0.0638 | 0.193–0.193 |
| hacim_z_20 | 672 | 671 |  | +0.15 | 0.004 | -0.0% | +4.2% | 19% | 18% | -2.04–-0.861 | 0.653–23.6 |
| ma200_uzaklik | 493 | 493 |  | -0.17 | 0.006 | +7.1% | -3.0% | 9% | 27% | -0.228–-0.0572 | 0.306–0.423 |
| devir_hizi_20g | 673 | 657 |  | +0.14 | 0.010 | -0.9% | +2.9% | 13% | 22% | 0.00218–0.00588 | 0.0169–0.0238 |
| getiri_120g | 573 | 572 |  | -0.14 | 0.056 | +6.9% | +1.7% | 3% | 12% | -0.323–-0.0696 | 0.377–0.761 |
| atr_20g_oran | 672 | 666 |  | -0.12 | 0.071 | +2.9% | +0.4% | 9% | 27% | 0.017–0.0241 | 0.0364–0.051 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.1% | +0.1% | -0.9% | -0.1% | 43% |
| siyasi | hayır | 9 | -0.1% | +0.4% | +0.3% | +4.1% | 78% |
| enflasyon | hayır | 6 | +0.0% | -0.1% | -0.2% | +0.5% | 50% |
| jeopolitik | hayır | 5 | +1.8% | +2.2% | +3.2% | -2.2% | 40% |
| sok | hayır | 5 | -3.8% | +1.0% | -1.2% | -1.7% | 80% |
| tarife | hayır | 5 | +0.4% | -0.3% | -0.4% | +0.8% | 80% |
| derecelendirme | hayır | 4 | -1.9% | +1.2% | +3.1% | +5.1% | 75% |
| dusus | hayır | 3 | -2.9% | -0.3% | -0.6% | -7.9% | 33% |
| yukselis | hayır | 3 | -0.7% | +2.2% | +4.2% | +7.3% | 100% |
| butce_vergi | hayır | 2 | +0.1% | -1.9% | -1.4% | -9.3% | 0% |
| kur | hayır | 2 | +2.3% | -1.7% | +3.4% | +6.1% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 201 deneme. Al-tut Sharpe: eğitim 0.72, test 1.07.
Eğitimde seçilen kural: **endekse_gore_1g > 0.01299 ise nakde geç** (kantil 0.8). Eğitim Sharpe 1.92 → test Sharpe 1.79; testte nakitte kalma oranı 27%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.6%, test +3.3%.
Deflated Sharpe (deneme sayısı 201): 0.41 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.1 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.7 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.4 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.1 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 1.1 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.2 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.9 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.4 |
| bayram_oncesi | 1.0 | 5 | +0.6% | 0.7 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.5 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.1 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.4 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.6 |

## Son durum (en yeni satır)

getiri_1g=-0.0196, getiri_5g=0.0116, getiri_20g=-0.0996, getiri_60g=-0.157, getiri_120g=-0.0215, mom_12_1=0.461, zirve_52h_yakinlik=0.781, zirveden_dusus=-0.219, oynaklik_20g=0.359, oynaklik_60g=0.397, atr_20g_oran=0.0371, rsi_14=43.7, ma20_uzaklik=-0.0396, ma50_uzaklik=-0.116, ma200_uzaklik=-0.0108, hacim_z_20=2.27, amihud_20g=0.153, devir_hizi_20g=0.00946, gece_ort_20g=-0.0087, gunici_ort_20g=0.00432, aof_1g_sapma=0.0334, max_gunluk_20g=0.0388, min_gunluk_20g=-0.0395, ivol_60g=0.344, endekse_gore_1g=-0.0358, endekse_gore_20g=-0.0505, endekse_gore_60g=0.0195, beta_60g=0.736, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.195, piyasa_degeri_mn=5.76e+04, halka_aciklik=0.236, fk=6.17, kazanc_verimi=0.162, pd_dd=0.686, fd_favok=11.6, snak_verimi=0.0587, temettu_verimi=0.0479, roe_ttm=0.111, net_kar_marji=0.14, kar_buyume_yillik=2.37, satis_buyume_yillik=0.0869, net_borc_ozkaynak=-0.0469, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1