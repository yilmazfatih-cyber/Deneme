# Hisse dosyası analizi — EKGYO

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 201 (36 bağımsız bölüm); ≥%10 yükseliş 267 gün (33 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +305.3% (t=3.6), gün içi (açılış→kapanış) toplam -35.4% (t=-0.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| satis_buyume_yillik | 0.22 | 0.263 | -0.42 |
| min_gunluk_20g | -0.053 | -0.0435 | -0.41 |
| oynaklik_60g | 0.439 | 0.454 | -0.38 |
| oynaklik_20g | 0.452 | 0.432 | +0.35 |
| xu100_ma200_uzaklik | 0.0997 | 0.0622 | +0.35 |
| usdtry_getiri_20g | 0.0147 | 0.0139 | +0.34 |
| kar_buyume_yillik | -0.547 | -0.547 | -0.33 |
| kazanc_verimi | 0.05 | 0.0721 | -0.30 |
| mom_12_1 | 0.384 | 0.472 | -0.27 |
| roe_ttm | 0.0271 | 0.0472 | -0.27 |
| fd_favok | 4.56 | 4.36 | +0.25 |
| piyasa_degeri_mn | 6.37e+04 | 6.15e+04 | +0.25 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| dolar_getiri_60g | -0.0742 | 0.0448 | -0.68 |
| getiri_60g | -0.0269 | 0.0838 | -0.68 |
| piyasa_degeri_mn | 5.46e+04 | 7.33e+04 | -0.53 |
| xu100_ma200_uzaklik | 0.0304 | 0.09 | -0.53 |
| ma200_uzaklik | 0.113 | 0.209 | -0.51 |
| getiri_120g | 0.127 | 0.216 | -0.50 |
| zirve_52h_yakinlik | 0.86 | 0.931 | -0.44 |
| zirveden_dusus | -0.14 | -0.0693 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 630 |  | -0.33 | 0.000 | +11.9% | -1.5% | 9% | 30% | -0.245–-0.0932 | 0.268–0.803 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.39 | 0.000 | +11.3% | -3.6% | 27% | 43% | -0.118–-0.0163 | 0.144–0.312 |
| dolar_getiri_60g | 633 | 633 |  | -0.32 | 0.000 | +10.9% | -1.6% | 13% | 30% | -0.29–-0.131 | 0.215–0.705 |
| piyasa_degeri_mn | 692 | 690 | seviye | -0.30 | 0.000 | +10.1% | -2.7% | 19% | 41% | 2.76e+04–4.34e+04 | 7.9e+04–1.02e+05 |
| oynaklik_60g | 632 | 629 |  | +0.31 | 0.000 | -1.4% | +10.5% | 40% | 18% | 0.298–0.401 | 0.485–0.564 |
| fk | 437 | 435 |  | -0.27 | 0.000 | +9.7% | -0.9% | 9% | 35% | 2.62–2.97 | 14.9–22.2 |
| gunici_ort_20g | 673 | 650 |  | -0.18 | 0.000 | +9.2% | +2.8% | 15% | 29% | -0.0137–-0.004 | 0.00274–0.0186 |
| fd_favok | 643 | 638 |  | -0.18 | 0.000 | +5.0% | -1.9% | 15% | 41% | 3.15–3.88 | 5.4–8.29 |
| kar_buyume_yillik | 420 | 7 | çeyreklik adım | +0.23 | 0.000 | -1.5% | +0.8% | 34% | 26% | -1.46–-0.739 | 16.4–16.4 |
| rsi_14 | 678 | 668 |  | -0.17 | 0.000 | +7.9% | +0.9% | 15% | 24% | 27.7–42.2 | 64.8–80.6 |
| xu100_getiri_20g | 673 | 671 |  | -0.16 | 0.001 | +4.3% | -1.8% | 25% | 33% | -0.166–-0.0409 | 0.0783–0.222 |
| zirveden_dusus | 573 | 465 |  | -0.17 | 0.001 | +7.3% | -1.7% | 10% | 36% | -0.323–-0.226 | -0.024–0 |
| ma50_uzaklik | 643 | 642 |  | -0.16 | 0.001 | +10.6% | +2.5% | 10% | 22% | -0.187–-0.0731 | 0.118–0.301 |
| zirve_52h_yakinlik | 573 | 513 |  | -0.17 | 0.002 | +7.3% | -1.7% | 10% | 36% | 0.677–0.774 | 0.976–1.07 |
| ma200_uzaklik | 493 | 493 |  | -0.18 | 0.003 | +7.3% | -3.4% | 12% | 35% | -0.155–-0.0301 | 0.286–0.507 |
| ivol_60g | 573 | 571 |  | +0.16 | 0.005 | +0.2% | +7.9% | 31% | 21% | 0.206–0.249 | 0.334–0.465 |
| getiri_20g | 673 | 669 |  | -0.14 | 0.007 | +6.3% | +2.6% | 19% | 22% | -0.298–-0.073 | 0.137–0.461 |
| aof_1g_sapma | 692 | 686 |  | +0.14 | 0.008 | -0.6% | +4.8% | 36% | 32% | -0.0249–0.0207 | 0.0589–0.0998 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.3% | -0.5% | +0.2% | +1.3% | 44% |
| siyasi | hayır | 17 | -0.3% | -0.6% | +1.4% | +1.7% | 47% |
| derecelendirme | hayır | 15 | -0.7% | -0.9% | -0.6% | -1.3% | 40% |
| jeopolitik | hayır | 10 | -0.9% | +1.7% | -0.6% | +1.3% | 50% |
| enflasyon | hayır | 9 | +1.1% | -0.4% | +0.1% | +4.7% | 56% |
| regulasyon | hayır | 6 | -1.5% | +0.4% | +3.7% | +3.0% | 50% |
| haber | hayır | 5 | +1.6% | -1.2% | -0.0% | +6.7% | 40% |
| kuresel_faiz | hayır | 5 | +0.6% | +1.2% | +1.8% | +1.2% | 40% |
| sok | hayır | 5 | -7.0% | -0.9% | +2.5% | +7.2% | 80% |
| tarife | hayır | 5 | +1.9% | -0.2% | -2.3% | +0.3% | 40% |
| kur | hayır | 4 | -0.0% | -0.9% | -1.3% | -6.8% | 25% |
| dusus | hayır | 3 | -0.2% | -1.0% | -3.1% | -1.6% | 67% |
| yukselis | hayır | 3 | +4.9% | -0.8% | -2.3% | +0.2% | 67% |
| butce_vergi | hayır | 2 | +1.3% | +0.9% | +1.1% | +3.8% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 198 deneme. Al-tut Sharpe: eğitim 1.56, test -0.02.
Eğitimde seçilen kural: **getiri_1g < -0.01718 ise nakde geç** (kantil 0.2). Eğitim Sharpe 2.61 → test Sharpe 0.42; testte nakitte kalma oranı 24%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +5.2%, test -0.5%.
Deflated Sharpe (deneme sayısı 198): 0.17 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.6 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.6 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.2 |
| haftanin_gunu | 3.0 | 143 | +0.1% | 0.5 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 0.7 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.6 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.6 |
| bayram_oncesi | 1.0 | 5 | +0.1% | 0.0 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.5 |
| bayram_sonrasi | 1.0 | 6 | +1.1% | 1.9 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.7 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.0301, getiri_5g=0.0829, getiri_20g=-0.0838, getiri_60g=-0.0082, getiri_120g=-0.105, mom_12_1=-0.0402, zirve_52h_yakinlik=0.694, zirveden_dusus=-0.306, oynaklik_20g=0.463, oynaklik_60g=0.522, atr_20g_oran=0.0407, rsi_14=45.8, ma20_uzaklik=0.00493, ma50_uzaklik=-0.0469, ma200_uzaklik=-0.115, hacim_z_20=-0.588, amihud_20g=0.0168, devir_hizi_20g=0.0422, gece_ort_20g=-0.00276, gunici_ort_20g=-0.00209, aof_1g_sapma=0.0114, max_gunluk_20g=0.0599, min_gunluk_20g=-0.0498, ivol_60g=0.332, endekse_gore_1g=0.0104, endekse_gore_20g=-0.038, endekse_gore_60g=0.165, beta_60g=1.44, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0532, piyasa_degeri_mn=6.9e+04, halka_aciklik=0.481, kazanc_verimi=-0.0289, pd_dd=0.447, fd_favok=4.07, snak_verimi=-0.719, temettu_verimi=0.0331, roe_ttm=-0.0129, net_kar_marji=0.0417, kar_buyume_yillik=-0.819, satis_buyume_yillik=-0.0599, net_borc_ozkaynak=0.154, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0