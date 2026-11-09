# Hisse dosyası analizi — EGEEN

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 197 (23 bağımsız bölüm); ≥%10 yükseliş 153 gün (29 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +431.6% (t=4.1), gün içi (açılış→kapanış) toplam -92.0% (t=-3.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | -0.112 | -0.175 | +0.75 |
| oynaklik_60g | 0.453 | 0.363 | +0.73 |
| oynaklik_20g | 0.474 | 0.374 | +0.69 |
| getiri_120g | -0.137 | -0.2 | +0.62 |
| zirve_52h_yakinlik | 0.663 | 0.605 | +0.60 |
| zirveden_dusus | -0.337 | -0.395 | +0.60 |
| usdtry_getiri_20g | 0.0119 | 0.0152 | -0.58 |
| max_gunluk_20g | 0.0579 | 0.0473 | +0.56 |
| rsi_14 | 48.4 | 43.7 | +0.52 |
| getiri_60g | -0.0654 | -0.109 | +0.52 |
| atr_20g_oran | 0.0378 | 0.0313 | +0.52 |
| dolar_getiri_60g | -0.107 | -0.145 | +0.51 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | -0.203 | -0.136 | -1.04 |
| zirve_52h_yakinlik | 0.571 | 0.634 | -0.88 |
| zirveden_dusus | -0.429 | -0.366 | -0.88 |
| getiri_120g | -0.259 | -0.156 | -0.74 |
| ivol_60g | 0.242 | 0.306 | -0.69 |
| dolar_getiri_60g | -0.207 | -0.112 | -0.60 |
| pd_dd | 5.75 | 3.68 | +0.59 |
| oynaklik_60g | 0.334 | 0.417 | -0.57 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 633 |  | -0.41 | 0.000 | +3.1% | -7.7% | 13% | 39% | -0.321–-0.186 | 0.00289–0.652 |
| zirveden_dusus | 573 | 528 |  | -0.38 | 0.000 | +1.5% | -9.4% | 8% | 47% | -0.513–-0.443 | -0.31–-0.206 |
| zirve_52h_yakinlik | 573 | 528 |  | -0.38 | 0.000 | +1.5% | -9.4% | 8% | 47% | 0.487–0.557 | 0.69–0.794 |
| getiri_120g | 573 | 573 |  | -0.35 | 0.000 | +4.4% | -8.1% | 8% | 44% | -0.469–-0.269 | -0.0799–0.332 |
| ma50_uzaklik | 643 | 642 |  | -0.35 | 0.000 | +3.5% | -7.1% | 15% | 43% | -0.218–-0.0935 | 0.0243–0.212 |
| ma200_uzaklik | 493 | 492 |  | -0.46 | 0.000 | +3.6% | -9.8% | 4% | 51% | -0.291–-0.202 | -0.0911–0.0332 |
| rsi_14 | 678 | 671 |  | -0.33 | 0.000 | +4.4% | -7.2% | 14% | 45% | 17.5–36.7 | 54.1–76.5 |
| oynaklik_60g | 632 | 631 |  | -0.36 | 0.000 | -0.4% | -8.9% | 21% | 56% | 0.22–0.328 | 0.466–0.633 |
| dolar_getiri_60g | 633 | 633 |  | -0.41 | 0.000 | +3.0% | -7.3% | 14% | 37% | -0.349–-0.218 | -0.0306–0.554 |
| ivol_60g | 573 | 572 |  | -0.44 | 0.000 | +2.3% | -9.4% | 20% | 37% | 0.188–0.252 | 0.364–0.598 |
| getiri_20g | 673 | 672 |  | -0.29 | 0.000 | +1.3% | -5.9% | 21% | 40% | -0.257–-0.0936 | 0.0575–0.498 |
| fd_favok | 643 | 602 |  | -0.27 | 0.000 | +1.9% | -6.7% | 17% | 36% | 15–18.7 | 26.6–45.3 |
| gece_ort_20g | 672 | 652 |  | -0.25 | 0.000 | +1.2% | -4.7% | 19% | 39% | -0.0067–-1.05e-06 | 0.00451–0.0119 |
| endekse_gore_60g | 633 | 633 |  | -0.24 | 0.000 | -3.2% | -8.8% | 34% | 50% | -0.432–-0.263 | -0.00533–0.439 |
| usdtry_getiri_20g | 672 | 664 |  | +0.23 | 0.000 | -4.0% | +2.0% | 44% | 10% | -0.013–0.00947 | 0.019–0.0482 |
| ma20_uzaklik | 673 | 673 |  | -0.21 | 0.000 | +0.0% | -6.5% | 28% | 48% | -0.17–-0.0588 | 0.0323–0.279 |
| gunici_ort_20g | 673 | 654 |  | -0.21 | 0.000 | -0.0% | -5.9% | 20% | 41% | -0.0132–-0.00583 | -0.000524–0.0109 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.20 | 0.000 | -3.2% | +7.8% | 28% | 16% | -0.0202–0.0018 | 0.157–0.204 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.6% | -0.1% | -0.3% | -3.4% | 20% |
| siyasi | hayır | 17 | -0.5% | +0.3% | -0.7% | -4.1% | 35% |
| derecelendirme | hayır | 15 | +0.1% | -0.7% | -1.0% | -8.3% | 27% |
| jeopolitik | hayır | 10 | -1.2% | +0.6% | -0.1% | -3.4% | 30% |
| enflasyon | hayır | 9 | +0.3% | -0.3% | -2.4% | -13.7% | 0% |
| regulasyon | hayır | 6 | -1.2% | -2.2% | +1.1% | -0.3% | 33% |
| haber | hayır | 5 | -1.5% | -2.3% | +6.2% | +3.5% | 40% |
| kuresel_faiz | hayır | 5 | -1.1% | -2.5% | +1.7% | -5.1% | 0% |
| sok | hayır | 5 | -4.7% | -1.5% | -7.9% | -9.5% | 20% |
| tarife | hayır | 5 | +1.2% | -1.4% | -1.2% | -4.6% | 20% |
| kur | hayır | 4 | -0.4% | -0.0% | -1.8% | -6.5% | 25% |
| dusus | hayır | 3 | -1.6% | -0.1% | +0.4% | -3.2% | 33% |
| yukselis | hayır | 3 | +0.6% | -0.3% | -1.8% | -4.1% | 33% |
| butce_vergi | hayır | 2 | -0.9% | -1.4% | +0.6% | -10.4% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 219 deneme. Al-tut Sharpe: eğitim -0.08, test -1.06.
Eğitimde seçilen kural: **endekse_gore_1g > 0.004128 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.15 → test Sharpe -0.84; testte nakitte kalma oranı 29%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.1%, test -6.1%.
Deflated Sharpe (deneme sayısı 219): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.6% | -2.2 |
| haftanin_gunu | 1.0 | 142 | -0.4% | -1.9 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.8 |
| haftanin_gunu | 4.0 | 143 | +0.4% | 1.5 |
| ay_donusu | 0.0 | 521 | -0.0% | -0.4 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.9 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.8 |
| bayram_oncesi | 1.0 | 5 | -0.2% | -0.2 |
| bayram_sonrasi | 0.0 | 707 | -0.1% | -0.9 |
| bayram_sonrasi | 1.0 | 6 | +0.9% | 0.6 |
| bilanco_sezonu | 0.0 | 422 | -0.0% | -0.2 |
| bilanco_sezonu | 1.0 | 291 | -0.2% | -1.1 |

## Son durum (en yeni satır)

getiri_1g=-0.0144, getiri_5g=0.185, getiri_20g=-0.135, getiri_60g=-0.162, getiri_120g=-0.262, mom_12_1=-0.415, zirve_52h_yakinlik=0.536, zirveden_dusus=-0.464, oynaklik_20g=0.626, oynaklik_60g=0.72, atr_20g_oran=0.0486, rsi_14=52, ma20_uzaklik=0.0359, ma50_uzaklik=-0.097, ma200_uzaklik=-0.226, hacim_z_20=-0.0394, amihud_20g=0.388, devir_hizi_20g=0.016, gece_ort_20g=0.00261, gunici_ort_20g=-0.0054, aof_1g_sapma=0.0123, max_gunluk_20g=0.0969, min_gunluk_20g=-0.0796, ivol_60g=0.653, endekse_gore_1g=-0.0341, endekse_gore_20g=-0.0894, endekse_gore_60g=0.0117, beta_60g=1.03, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.2, piyasa_degeri_mn=1.4e+04, halka_aciklik=0.359, kazanc_verimi=-0.0205, pd_dd=1.53, fd_favok=24.6, snak_verimi=0.0606, temettu_verimi=0, roe_ttm=-0.0314, net_kar_marji=0.0253, kar_buyume_yillik=-0.186, satis_buyume_yillik=-0.164, net_borc_ozkaynak=0.0018, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0