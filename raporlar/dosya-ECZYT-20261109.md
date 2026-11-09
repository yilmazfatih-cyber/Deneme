# Hisse dosyası analizi — ECZYT

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 244 (27 bağımsız bölüm); ≥%10 yükseliş 197 gün (22 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +71.5% (t=1.5), gün içi (açılış→kapanış) toplam -62.4% (t=-1.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.0333 | 0.044 | -0.75 |
| snak_verimi | 0.0302 | 0.043 | -0.72 |
| piyasa_degeri_mn | 3.04e+04 | 2.41e+04 | +0.66 |
| amihud_20g | 0.174 | 0.267 | -0.61 |
| devir_hizi_20g | 0.0249 | 0.0167 | +0.59 |
| kar_buyume_yillik | -1.67 | -1.09 | -0.57 |
| fd_favok | 59.5 | 38.1 | +0.57 |
| max_gunluk_20g | 0.0532 | 0.0457 | +0.50 |
| ivol_60g | 0.443 | 0.364 | +0.49 |
| roe_ttm | 0.0432 | 0.0463 | -0.47 |
| getiri_20g | 0.021 | -0.0348 | +0.46 |
| zirve_52h_yakinlik | 0.808 | 0.724 | +0.45 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | -0.262 | -1.27 | +0.74 |
| gece_ort_20g | 0.000519 | 0.00187 | -0.44 |
| fk | 24.7 | 25.9 | -0.38 |
| piyasa_degeri_mn | 2.57e+04 | 2.65e+04 | -0.33 |
| min_gunluk_20g | -0.0535 | -0.0467 | -0.28 |
| temettu_verimi | 0.0253 | 0.0222 | +0.25 |
| usdtry_getiri_20g | 0.0117 | 0.015 | -0.24 |
| olay_sayi_5g | 0 | 0 | +0.24 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| kar_buyume_yillik | 355 | 6 | çeyreklik adım | +0.44 | 0.000 | -12.3% | +8.2% | 61% | 16% | -2.29–-1.67 | 3.15–3.15 |
| temettu_verimi | 693 | 503 |  | +0.33 | 0.000 | -3.7% | +11.3% | 53% | 5% | 0–0.0172 | 0.0283–0.0672 |
| piyasa_degeri_mn | 692 | 675 | seviye | -0.30 | 0.000 | +7.5% | -6.8% | 3% | 62% | 1.76e+04–2.1e+04 | 3.39e+04–4.22e+04 |
| pd_dd | 692 | 638 |  | -0.30 | 0.000 | +3.3% | -7.3% | 19% | 69% | 0.7–0.932 | 1.34–3.6 |
| amihud_20g | 672 | 672 |  | +0.28 | 0.000 | -8.0% | -0.2% | 75% | 21% | 0.0605–0.157 | 0.344–0.768 |
| kazanc_verimi | 643 | 589 |  | +0.26 | 0.000 | -10.9% | -2.0% | 57% | 15% | -0.0178–0.0268 | 0.0588–0.079 |
| fd_favok | 643 | 629 |  | -0.26 | 0.000 | +4.4% | -5.9% | 6% | 52% | 26.8–31.2 | 74.5–94.2 |
| gece_ort_20g | 672 | 639 |  | -0.24 | 0.000 | +7.0% | -3.0% | 22% | 61% | -0.0127–-0.000739 | 0.00355–0.00784 |
| devir_hizi_20g | 673 | 669 |  | -0.23 | 0.000 | +0.3% | -4.7% | 10% | 61% | 0.00565–0.0122 | 0.0293–0.0699 |
| snak_verimi | 643 | 591 |  | +0.23 | 0.000 | -8.2% | -1.2% | 53% | 18% | 0.0206–0.0279 | 0.0507–0.0621 |
| getiri_20g | 673 | 669 |  | -0.21 | 0.000 | +2.0% | -3.4% | 24% | 56% | -0.349–-0.0993 | 0.0969–0.651 |
| xu100_getiri_20g | 673 | 671 |  | -0.18 | 0.000 | +3.7% | -2.3% | 26% | 47% | -0.166–-0.0409 | 0.0783–0.222 |
| ma50_uzaklik | 643 | 643 |  | -0.19 | 0.000 | +1.7% | -0.8% | 21% | 44% | -0.33–-0.074 | 0.0785–0.433 |
| halka_aciklik | 692 | 7 | seviye | -0.18 | 0.000 | +2.0% | -2.0% | 19% | 45% | 0.176–0.183 | 0.183–0.204 |
| min_gunluk_20g | 672 | 72 |  | -0.16 | 0.001 | +1.7% | -6.6% | 27% | 49% | -0.101–-0.0786 | -0.0344–-0.0106 |
| ma20_uzaklik | 673 | 672 |  | -0.15 | 0.004 | +2.3% | -3.7% | 25% | 51% | -0.303–-0.0613 | 0.0512–0.358 |
| rsi_14 | 678 | 667 |  | -0.14 | 0.016 | +0.4% | -2.6% | 26% | 52% | 14.1–38.7 | 57.8–87.9 |
| max_gunluk_20g | 672 | 66 |  | -0.13 | 0.037 | +0.1% | -4.6% | 14% | 50% | 0.0148–0.0351 | 0.0941–0.106 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.2% | -0.7% | -1.5% | +4.9% | 41% |
| siyasi | hayır | 17 | +0.1% | +0.2% | +1.3% | +9.9% | 53% |
| derecelendirme | hayır | 15 | -0.8% | +0.6% | -0.3% | +0.5% | 33% |
| jeopolitik | hayır | 10 | -1.0% | -0.5% | -0.8% | +0.3% | 50% |
| enflasyon | hayır | 9 | +0.8% | -1.8% | -2.4% | -6.9% | 11% |
| regulasyon | hayır | 6 | -2.0% | -2.1% | +3.3% | +1.3% | 50% |
| haber | hayır | 5 | -1.3% | -2.4% | +2.3% | -6.7% | 0% |
| kuresel_faiz | hayır | 5 | -1.5% | -1.6% | -0.9% | +6.5% | 20% |
| sok | hayır | 5 | -7.7% | -2.9% | -11.3% | -12.4% | 20% |
| tarife | hayır | 5 | +2.1% | -0.8% | -1.2% | +0.8% | 60% |
| kur | hayır | 4 | -0.9% | +3.5% | +5.5% | +4.5% | 75% |
| dusus | hayır | 3 | -1.5% | -0.9% | -3.7% | -8.9% | 33% |
| yukselis | hayır | 3 | +1.7% | -0.4% | +0.9% | +0.5% | 67% |
| butce_vergi | hayır | 2 | -0.9% | -1.9% | -2.9% | -7.5% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 207 deneme. Al-tut Sharpe: eğitim 0.00, test -0.28.
Eğitimde seçilen kural: **amihud_20g < 0.2265 ise nakde geç** (kantil 0.3). Eğitim Sharpe 0.92 → test Sharpe 0.72; testte nakitte kalma oranı 76%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -3.2%, test -1.7%.
Deflated Sharpe (deneme sayısı 207): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.3% | -1.2 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.2 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.3 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.3 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 0.9 |
| ay_donusu | 0.0 | 521 | -0.1% | -0.6 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.5 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.2 |
| bayram_oncesi | 1.0 | 5 | +0.0% | 0.0 |
| bayram_sonrasi | 0.0 | 707 | -0.0% | -0.3 |
| bayram_sonrasi | 1.0 | 6 | +0.3% | 0.6 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -0.9 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.8 |

## Son durum (en yeni satır)

getiri_1g=0.0259, getiri_5g=0.111, getiri_20g=-0.261, getiri_60g=-0.496, getiri_120g=-0.568, mom_12_1=-0.29, zirve_52h_yakinlik=0.404, zirveden_dusus=-0.596, oynaklik_20g=0.562, oynaklik_60g=0.584, atr_20g_oran=0.0575, rsi_14=30.6, ma20_uzaklik=-0.0802, ma50_uzaklik=-0.294, ma200_uzaklik=-0.471, hacim_z_20=-0.649, amihud_20g=0.703, devir_hizi_20g=0.0175, gece_ort_20g=-0.0102, gunici_ort_20g=-0.00554, aof_1g_sapma=0.0219, max_gunluk_20g=0.0855, min_gunluk_20g=-0.0781, ivol_60g=0.447, endekse_gore_1g=0.00622, endekse_gore_20g=-0.215, endekse_gore_60g=-0.323, beta_60g=1.32, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.519, piyasa_degeri_mn=1.71e+04, halka_aciklik=0.173, kazanc_verimi=-0.0231, pd_dd=0.542, fd_favok=41.8, snak_verimi=0.0412, temettu_verimi=0.0352, roe_ttm=-0.0125, net_kar_marji=-inf, kar_buyume_yillik=-2.29, net_borc_ozkaynak=-0.0195, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0