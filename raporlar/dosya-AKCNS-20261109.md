# Hisse dosyası analizi — AKCNS

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 179 (21 bağımsız bölüm); ≥%10 yükseliş 196 gün (30 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +248.3% (t=3.0), gün içi (açılış→kapanış) toplam -62.0% (t=-1.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.272 | 0.032 | +0.80 |
| piyasa_degeri_mn | 3.75e+04 | 3.11e+04 | +0.74 |
| fd_favok | 8.61 | 6.96 | +0.54 |
| net_borc_ozkaynak | -0.0184 | -0.00263 | -0.54 |
| zirve_52h_yakinlik | 0.868 | 0.814 | +0.54 |
| zirveden_dusus | -0.132 | -0.186 | +0.53 |
| beta_60g | 0.644 | 0.705 | -0.53 |
| fk | 16.2 | 14.4 | +0.52 |
| pd_dd | 1.54 | 1.54 | +0.43 |
| ivol_60g | 0.387 | 0.324 | +0.43 |
| temettu_verimi | 0.028 | 0.0384 | -0.42 |
| getiri_120g | 0.122 | 0.0704 | +0.38 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | -0.135 | 0.136 | -0.57 |
| usdtry_getiri_20g | 0.0112 | 0.015 | -0.45 |
| piyasa_degeri_mn | 3.11e+04 | 3.19e+04 | -0.45 |
| kar_buyume_yillik | -0.275 | -0.407 | +0.42 |
| ivol_60g | 0.314 | 0.357 | -0.41 |
| beta_60g | 0.754 | 0.65 | +0.40 |
| oynaklik_60g | 0.359 | 0.41 | -0.40 |
| satis_buyume_yillik | 0.113 | 0.0485 | +0.33 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.25 | 0.000 | +4.1% | -4.7% | 4% | 53% | 2.38e+04–2.76e+04 | 3.94e+04–4.77e+04 |
| mom_12_1 | 441 | 441 |  | -0.27 | 0.000 | +10.9% | -2.9% | 3% | 51% | -0.326–-0.149 | 0.408–0.857 |
| usdtry_getiri_20g | 672 | 664 |  | -0.22 | 0.000 | +3.2% | -2.3% | 20% | 41% | -0.013–0.00947 | 0.019–0.0482 |
| amihud_20g | 672 | 672 |  | +0.22 | 0.000 | -2.5% | +1.1% | 36% | 25% | 0.0566–0.131 | 0.298–1.53 |
| oynaklik_60g | 632 | 630 |  | -0.22 | 0.000 | +3.6% | -2.4% | 11% | 26% | 0.274–0.329 | 0.459–0.557 |
| ivol_60g | 573 | 573 |  | -0.21 | 0.000 | -0.4% | -4.1% | 12% | 29% | 0.196–0.286 | 0.431–0.545 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.19 | 0.001 | -2.2% | +6.4% | 43% | 19% | -0.118–-0.0163 | 0.144–0.312 |
| atr_20g_oran | 672 | 670 |  | -0.15 | 0.004 | +4.0% | -2.6% | 21% | 33% | 0.0156–0.0276 | 0.0395–0.0606 |
| beta_60g | 632 | 632 |  | +0.15 | 0.006 | -0.1% | +2.4% | 29% | 6% | -0.177–0.482 | 0.887–1.19 |
| devir_hizi_20g | 673 | 658 |  | -0.14 | 0.008 | +1.8% | -4.3% | 34% | 35% | 0.00619–0.0104 | 0.0221–0.0823 |
| kar_buyume_yillik | 537 | 9 | çeyreklik adım | +0.15 | 0.023 | -0.0% | +0.7% | 25% | 22% | -106–-0.997 | 0.55–0.55 |
| zirve_52h_yakinlik | 573 | 491 |  | -0.14 | 0.037 | +3.7% | -4.2% | 3% | 43% | 0.576–0.659 | 0.96–1.06 |
| zirveden_dusus | 573 | 474 |  | -0.14 | 0.037 | +3.7% | -4.2% | 3% | 43% | -0.424–-0.341 | -0.0398–0 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.13 | 0.076 | -0.0% | +1.0% | 25% | 25% | -0.0616–-0.035 | 0.133–0.196 |
| snak_verimi | 643 | 576 |  | -0.12 | 0.088 | +1.2% | -2.7% | 29% | 34% | 0.0256–0.0375 | 0.0821–0.142 |
| temettu_verimi | 693 | 483 |  | +0.12 | 0.101 | -1.6% | +2.9% | 42% | 11% | 0–0.00787 | 0.0443–0.0759 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.12 | 0.114 | -1.7% | +1.8% | 40% | 9% | -0.0905–-0.044 | 0.0271–0.0421 |
| pd_dd | 692 | 641 |  | -0.11 | 0.135 | +3.1% | -1.6% | 14% | 40% | 0.993–1.24 | 1.92–4.61 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.0% | -0.4% | -1.2% | +1.0% | 49% |
| siyasi | hayır | 17 | +0.2% | +0.8% | -0.9% | -1.7% | 47% |
| derecelendirme | hayır | 15 | +0.9% | +1.2% | +2.5% | -0.1% | 33% |
| jeopolitik | hayır | 10 | -1.0% | +2.5% | +0.7% | +1.7% | 50% |
| enflasyon | hayır | 9 | -0.0% | -0.1% | -0.7% | +1.6% | 44% |
| regulasyon | hayır | 6 | +2.0% | -0.1% | +0.6% | +6.2% | 83% |
| haber | hayır | 5 | -1.6% | -0.4% | +1.6% | +2.8% | 40% |
| kuresel_faiz | hayır | 5 | +1.2% | -1.7% | +1.2% | +1.3% | 40% |
| sok | hayır | 5 | -3.6% | +3.0% | -1.6% | +7.4% | 100% |
| tarife | hayır | 5 | +0.5% | -1.0% | -0.7% | -4.3% | 20% |
| kur | hayır | 4 | -1.0% | +2.8% | +1.5% | -2.4% | 50% |
| dusus | hayır | 3 | -2.8% | +0.3% | -3.3% | -2.7% | 33% |
| yukselis | hayır | 3 | +3.3% | +1.2% | +2.2% | -0.9% | 33% |
| butce_vergi | hayır | 2 | +0.2% | -0.2% | +0.3% | -5.4% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 216 deneme. Al-tut Sharpe: eğitim 0.06, test 0.84.
Eğitimde seçilen kural: **rsi_14 > 42.8 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.46 → test Sharpe 0.99; testte nakitte kalma oranı 80%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.4%, test +2.3%.
Deflated Sharpe (deneme sayısı 216): 0.19 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.4 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.3 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.7 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 0.8 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.0 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.6 |
| bayram_oncesi | 1.0 | 5 | +0.9% | 0.8 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | -0.8% | -0.6 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.0 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.2 |

## Son durum (en yeni satır)

getiri_1g=0.0113, getiri_5g=0.0698, getiri_20g=-0.162, getiri_60g=-0.22, getiri_120g=-0.0182, mom_12_1=0.706, zirve_52h_yakinlik=0.757, zirveden_dusus=-0.243, oynaklik_20g=0.459, oynaklik_60g=0.537, atr_20g_oran=0.0461, rsi_14=45, ma20_uzaklik=-0.00397, ma50_uzaklik=-0.0902, ma200_uzaklik=-0.108, hacim_z_20=-0.0116, amihud_20g=0.463, devir_hizi_20g=0.0361, gece_ort_20g=-0.00518, gunici_ort_20g=-0.00466, aof_1g_sapma=0.00239, max_gunluk_20g=0.0397, min_gunluk_20g=-0.0596, ivol_60g=0.501, endekse_gore_1g=-0.00841, endekse_gore_20g=-0.116, endekse_gore_60g=-0.0464, beta_60g=0.728, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.255, piyasa_degeri_mn=3.61e+04, halka_aciklik=0.0493, fk=50.5, kazanc_verimi=0.0198, pd_dd=1.26, fd_favok=9.64, snak_verimi=0.0484, temettu_verimi=0.00998, roe_ttm=0.025, net_kar_marji=0.0283, kar_buyume_yillik=-0.295, satis_buyume_yillik=0.0881, net_borc_ozkaynak=0.0156, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0