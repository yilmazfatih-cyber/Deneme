# Hisse dosyası analizi — GWIND

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 204 (29 bağımsız bölüm); ≥%10 yükseliş 180 gün (23 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +267.9% (t=3.7), gün içi (açılış→kapanış) toplam -77.1% (t=-2.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| net_kar_marji | 0.334 | 0.31 | +0.57 |
| fd_favok | 6.05 | 5.65 | +0.51 |
| zirve_52h_yakinlik | 0.81 | 0.735 | +0.49 |
| zirveden_dusus | -0.19 | -0.265 | +0.49 |
| getiri_120g | 0.0401 | -0.0427 | +0.42 |
| endekse_gore_60g | -0.0274 | -0.0898 | +0.42 |
| satis_buyume_yillik | 0.0668 | 0.0864 | -0.42 |
| halka_aciklik | 0.299 | 0.299 | -0.42 |
| mom_12_1 | -0.0137 | -0.0467 | +0.41 |
| ma200_uzaklik | -0.00363 | -0.0559 | +0.38 |
| kazanc_verimi | 0.0745 | 0.0784 | +0.37 |
| usdtry_getiri_20g | 0.0151 | 0.0128 | +0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | -0.165 | -0.00764 | -0.96 |
| getiri_120g | -0.0792 | 0.00151 | -0.63 |
| endekse_gore_60g | -0.101 | -0.0622 | -0.47 |
| fd_favok | 5.64 | 5.85 | -0.36 |
| halka_aciklik | 0.299 | 0.299 | +0.36 |
| ivol_60g | 0.266 | 0.295 | -0.36 |
| piyasa_degeri_mn | 1.38e+04 | 1.45e+04 | -0.33 |
| net_borc_ozkaynak | 0.0965 | 0.0965 | -0.32 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| endekse_gore_60g | 633 | 632 |  | -0.33 | 0.000 | +2.4% | -5.6% | 23% | 39% | -0.289–-0.131 | 0.0356–0.316 |
| mom_12_1 | 441 | 439 |  | -0.37 | 0.000 | +4.5% | -6.6% | 13% | 43% | -0.367–-0.179 | 0.106–0.387 |
| fd_favok | 643 | 618 |  | -0.31 | 0.000 | +1.6% | -6.4% | 17% | 45% | 4.29–5.35 | 6.73–8.25 |
| getiri_120g | 573 | 569 |  | -0.32 | 0.000 | +4.9% | -5.9% | 19% | 51% | -0.353–-0.121 | 0.0975–0.437 |
| zirveden_dusus | 573 | 463 |  | -0.30 | 0.000 | +1.8% | -5.3% | 17% | 47% | -0.378–-0.298 | -0.11–0 |
| zirve_52h_yakinlik | 573 | 477 |  | -0.30 | 0.000 | +1.8% | -5.3% | 17% | 47% | 0.622–0.702 | 0.89–1.05 |
| usdtry_getiri_20g | 672 | 664 |  | -0.26 | 0.000 | +3.3% | -2.3% | 16% | 37% | -0.013–0.00947 | 0.019–0.0482 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.26 | 0.000 | +0.5% | -3.8% | 24% | 32% | 1.07e+04–1.31e+04 | 1.6e+04–1.95e+04 |
| halka_aciklik | 692 | 13 | seviye | +0.22 | 0.000 | -4.9% | +0.8% | 43% | 30% | 0.293–0.299 | 0.3–0.303 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.22 | 0.000 | -5.5% | -1.6% | 44% | 41% | -0.511–-0.0496 | 0.456–0.456 |
| ma200_uzaklik | 493 | 493 |  | -0.18 | 0.003 | +1.4% | -4.5% | 23% | 44% | -0.22–-0.109 | 0.057–0.253 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.14 | 0.007 | +0.2% | -7.6% | 29% | 49% | 0.0201–0.0544 | 0.164–0.175 |
| beta_60g | 632 | 632 |  | +0.15 | 0.010 | -0.6% | -0.5% | 24% | 23% | 0.291–0.628 | 0.956–1.21 |
| xu100_getiri_20g | 673 | 671 |  | +0.14 | 0.017 | -3.0% | +0.4% | 31% | 26% | -0.166–-0.0409 | 0.0783–0.222 |
| aof_1g_sapma | 692 | 688 |  | +0.13 | 0.034 | -2.2% | +2.2% | 34% | 21% | -0.0731–0.000431 | 0.0476–0.0857 |
| endekse_gore_20g | 673 | 672 |  | -0.12 | 0.055 | -0.7% | -3.1% | 27% | 31% | -0.191–-0.0777 | 0.04–0.263 |
| fk | 643 | 624 |  | -0.10 | 0.457 | +2.3% | -0.8% | 26% | 39% | 4.67–11.4 | 14.7–18.7 |
| kazanc_verimi | 643 | 567 |  | +0.10 | 0.457 | -0.8% | +2.3% | 39% | 26% | 0.0534–0.0682 | 0.0875–0.214 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.3% | +0.1% | -0.1% | -0.9% | 39% |
| siyasi | hayır | 17 | -0.8% | -0.6% | +0.3% | +0.6% | 53% |
| derecelendirme | hayır | 15 | -0.4% | -0.5% | -1.6% | -3.7% | 33% |
| jeopolitik | hayır | 10 | -1.5% | -0.3% | -1.7% | +2.4% | 70% |
| enflasyon | hayır | 9 | +1.1% | -1.3% | -1.6% | -3.8% | 0% |
| regulasyon | hayır | 6 | -0.3% | -1.7% | -2.0% | +2.0% | 83% |
| haber | hayır | 5 | +0.2% | +0.1% | +1.8% | -1.4% | 20% |
| kuresel_faiz | hayır | 5 | +0.4% | -0.4% | +0.9% | -0.3% | 60% |
| sok | hayır | 5 | -4.7% | -0.2% | -0.5% | +1.6% | 60% |
| tarife | hayır | 5 | +0.9% | +1.0% | +1.3% | -2.3% | 20% |
| kur | hayır | 4 | -0.3% | +0.2% | +3.3% | +0.9% | 25% |
| dusus | hayır | 3 | -1.8% | -1.1% | -2.1% | +1.4% | 67% |
| yukselis | hayır | 3 | +2.2% | -0.2% | +1.3% | +8.1% | 100% |
| butce_vergi | hayır | 2 | -0.9% | -1.8% | +2.2% | -5.5% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 220 deneme. Al-tut Sharpe: eğitim 0.30, test -0.52.
Eğitimde seçilen kural: **atr_20g_oran < 0.03993 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.19 → test Sharpe -0.18; testte nakitte kalma oranı 88%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.6%, test -2.5%.
Deflated Sharpe (deneme sayısı 220): 0.03 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.4 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.4 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -1.8 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.8 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.0 |
| ay_donusu | 0.0 | 521 | +0.0% | 0.2 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.3 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.1 |
| bayram_oncesi | 1.0 | 5 | +0.6% | 0.9 |
| bayram_sonrasi | 0.0 | 707 | -0.0% | -0.2 |
| bayram_sonrasi | 1.0 | 6 | +1.5% | 2.0 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.5 |
| bilanco_sezonu | 1.0 | 291 | -0.1% | -0.7 |

## Son durum (en yeni satır)

getiri_1g=0.0233, getiri_5g=0.115, getiri_20g=-0.0875, getiri_60g=-0.196, getiri_120g=-0.348, mom_12_1=-0.207, zirve_52h_yakinlik=0.582, zirveden_dusus=-0.418, oynaklik_20g=0.379, oynaklik_60g=0.296, atr_20g_oran=0.0369, rsi_14=44.3, ma20_uzaklik=0.023, ma50_uzaklik=-0.0822, ma200_uzaklik=-0.251, hacim_z_20=0.55, amihud_20g=0.628, devir_hizi_20g=0.0116, gece_ort_20g=-0.00258, gunici_ort_20g=-0.00195, aof_1g_sapma=0.0134, max_gunluk_20g=0.059, min_gunluk_20g=-0.0433, ivol_60g=0.167, endekse_gore_1g=0.00359, endekse_gore_20g=-0.0416, endekse_gore_60g=-0.0221, beta_60g=0.879, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.232, piyasa_degeri_mn=9.97e+03, halka_aciklik=0.296, fk=4.37, kazanc_verimi=0.229, pd_dd=0.555, fd_favok=4.89, snak_verimi=-0.117, temettu_verimi=0.0347, roe_ttm=0.127, net_kar_marji=3.88, kar_buyume_yillik=3.36, satis_buyume_yillik=-0.511, net_borc_ozkaynak=0.164, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0