# Hisse dosyası analizi — TCKRC

Satır: 3821 (gün sonu satırı 554) · 2024-08-26 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 179 (28 bağımsız bölüm); ≥%10 yükseliş 263 gün (29 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
554 günde gece (kapanış→açılış) toplam +328.1% (t=3.3), gün içi (açılış→kapanış) toplam -13.2% (t=0.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| pd_dd | 2.75 | 2.25 | +0.63 |
| mom_12_1 | 1.72 | 1.29 | +0.60 |
| piyasa_degeri_mn | 9.8e+03 | 8.03e+03 | +0.52 |
| roe_ttm | 0.274 | 0.181 | +0.46 |
| beta_60g | 0.799 | 0.895 | -0.41 |
| ma200_uzaklik | 0.561 | 0.372 | +0.39 |
| ivol_60g | 0.486 | 0.415 | +0.35 |
| max_gunluk_20g | 0.0856 | 0.0685 | +0.35 |
| net_borc_ozkaynak | 0.105 | 0.0736 | +0.35 |
| amihud_20g | 0.152 | 0.19 | -0.35 |
| bilancodan_gun | 36 | 53 | -0.31 |
| gunici_ort_20g | 0.000296 | -0.000244 | +0.31 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | 0.369 | 0.589 | -0.53 |
| endekse_gore_60g | 0.131 | 0.282 | -0.51 |
| pd_dd | 2.19 | 2.58 | -0.47 |
| endekse_gore_20g | 0.0216 | 0.0631 | -0.45 |
| mom_12_1 | 1.27 | 1.4 | -0.41 |
| ma50_uzaklik | 0.0505 | 0.0973 | -0.37 |
| getiri_60g | 0.179 | 0.31 | -0.37 |
| oynaklik_60g | 0.474 | 0.507 | -0.36 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pd_dd | 533 | 500 |  | -0.30 | 0.000 | +10.6% | -2.3% | 15% | 45% | 1.37–1.84 | 3.39–4.79 |
| oynaklik_60g | 473 | 471 |  | -0.30 | 0.000 | +22.0% | +0.7% | 26% | 43% | 0.358–0.442 | 0.577–0.645 |
| endekse_gore_60g | 474 | 474 |  | -0.30 | 0.000 | +21.4% | +1.1% | 16% | 36% | -0.237–0.0154 | 0.402–1 |
| ma200_uzaklik | 334 | 334 |  | -0.32 | 0.000 | +15.5% | -3.0% | 22% | 48% | 0.0155–0.169 | 0.683–1.22 |
| kazanc_verimi | 533 | 494 |  | +0.22 | 0.000 | -1.5% | +10.7% | 42% | 27% | 0.0425–0.0705 | 0.102–0.154 |
| fk | 533 | 508 |  | -0.22 | 0.000 | +10.7% | -1.5% | 27% | 42% | 6.51–9.84 | 14.2–23.5 |
| amihud_20g | 513 | 513 |  | +0.22 | 0.000 | -1.0% | +9.4% | 53% | 30% | 0.0391–0.1 | 0.383–0.638 |
| getiri_60g | 474 | 474 |  | -0.23 | 0.000 | +11.9% | -1.6% | 28% | 45% | -0.304–0.00169 | 0.501–1.18 |
| snak_verimi | 533 | 495 |  | -0.21 | 0.000 | +13.6% | -0.6% | 21% | 45% | -0.167–-0.0973 | -0.0102–-0.00668 |
| ivol_60g | 414 | 414 |  | -0.23 | 0.000 | +12.9% | -2.4% | 16% | 54% | 0.334–0.383 | 0.544–0.646 |
| xu100_getiri_20g | 514 | 514 |  | +0.20 | 0.000 | +2.2% | +14.9% | 30% | 19% | -0.166–-0.044 | 0.073–0.222 |
| mom_12_1 | 282 | 282 |  | -0.27 | 0.000 | +24.2% | +1.2% | 16% | 58% | 0.429–0.815 | 1.89–3.68 |
| dolar_getiri_60g | 474 | 474 |  | -0.20 | 0.000 | +10.5% | -0.9% | 34% | 43% | -0.335–-0.0327 | 0.443–1.11 |
| endekse_gore_20g | 514 | 513 |  | -0.19 | 0.001 | +10.6% | -2.3% | 24% | 38% | -0.259–-0.0634 | 0.162–0.906 |
| kar_buyume_yillik | 456 | 7 | çeyreklik adım | -0.20 | 0.001 | +4.2% | +4.4% | 30% | 38% | -0.349–0.101 | 4.54–4.54 |
| piyasa_degeri_mn | 533 | 527 | seviye | -0.18 | 0.001 | +7.5% | -2.3% | 21% | 59% | 3.74e+03–5.74e+03 | 1.9e+04–2.92e+04 |
| ma50_uzaklik | 484 | 483 |  | -0.18 | 0.003 | +10.1% | -1.2% | 33% | 37% | -0.224–-0.0217 | 0.201–0.745 |
| usdtry_getiri_20g | 513 | 506 |  | -0.16 | 0.010 | +17.5% | +6.6% | 17% | 33% | -0.00183–0.0102 | 0.0176–0.0464 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.3% | +0.5% | +0.9% | +5.3% | 54% |
| siyasi | hayır | 17 | +0.8% | +0.0% | +0.7% | +5.5% | 53% |
| derecelendirme | hayır | 15 | -1.1% | -2.5% | -3.7% | +6.9% | 53% |
| jeopolitik | hayır | 10 | +0.2% | -1.5% | -2.6% | +1.4% | 60% |
| enflasyon | hayır | 9 | +2.9% | +1.2% | +4.3% | +11.7% | 56% |
| regulasyon | hayır | 6 | +2.0% | -4.0% | -5.3% | +4.3% | 50% |
| haber | hayır | 5 | +1.8% | -0.3% | +6.4% | +8.7% | 40% |
| kuresel_faiz | hayır | 5 | -2.6% | -1.4% | +0.8% | +6.4% | 60% |
| sok | hayır | 5 | -8.5% | -3.4% | +3.5% | +9.9% | 100% |
| tarife | hayır | 5 | +1.4% | +0.7% | +4.2% | +2.5% | 60% |
| kur | hayır | 4 | +1.8% | +1.7% | +7.7% | +3.7% | 75% |
| dusus | hayır | 3 | -2.0% | -2.3% | -3.9% | +10.3% | 100% |
| yukselis | hayır | 3 | +2.5% | -0.6% | -2.8% | +11.9% | 100% |
| butce_vergi | hayır | 2 | -0.3% | -2.4% | +0.7% | +31.9% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 332 gün, test 222 gün, 196 deneme. Al-tut Sharpe: eğitim 1.20, test 1.90.
Eğitimde seçilen kural: **usdtry_getiri_20g < 0.01664 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.82 → test Sharpe 0.6; testte nakitte kalma oranı 84%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +6.9%, test +9.7%.
Deflated Sharpe (deneme sayısı 196): 0.05 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 113 | +1.0% | 3.0 |
| haftanin_gunu | 1.0 | 111 | +0.6% | 2.0 |
| haftanin_gunu | 2.0 | 110 | -0.2% | -0.6 |
| haftanin_gunu | 3.0 | 110 | -0.1% | -0.3 |
| haftanin_gunu | 4.0 | 110 | +0.3% | 1.0 |
| ay_donusu | 0.0 | 405 | +0.5% | 3.2 |
| ay_donusu | 1.0 | 149 | -0.3% | -0.9 |
| bayram_oncesi | 0.0 | 550 | +0.3% | 2.2 |
| bayram_oncesi | 1.0 | 4 | +0.9% | 0.7 |
| bayram_sonrasi | 0.0 | 550 | +0.3% | 2.2 |
| bayram_sonrasi | 1.0 | 4 | +0.4% | 0.4 |
| bilanco_sezonu | 0.0 | 344 | +0.3% | 1.4 |
| bilanco_sezonu | 1.0 | 210 | +0.4% | 1.9 |

## Son durum (en yeni satır)

getiri_1g=0.0137, getiri_5g=0.161, getiri_20g=0.0121, getiri_60g=-0.26, getiri_120g=0.00723, mom_12_1=1.5, zirve_52h_yakinlik=0.731, zirveden_dusus=-0.269, oynaklik_20g=0.812, oynaklik_60g=0.728, atr_20g_oran=0.0593, rsi_14=56.2, ma20_uzaklik=0.118, ma50_uzaklik=0.016, ma200_uzaklik=0.0422, hacim_z_20=-0.162, amihud_20g=0.198, devir_hizi_20g=0.04, gece_ort_20g=0.000952, gunici_ort_20g=0.000591, aof_1g_sapma=0.0259, max_gunluk_20g=0.103, min_gunluk_20g=-0.0992, ivol_60g=0.598, endekse_gore_1g=-0.00594, endekse_gore_20g=0.0579, endekse_gore_60g=-0.0867, beta_60g=1.52, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.294, piyasa_degeri_mn=2.13e+04, halka_aciklik=0.318, fk=10.2, kazanc_verimi=0.0984, pd_dd=2.96, fd_favok=8.88, snak_verimi=-0.00973, temettu_verimi=0, roe_ttm=0.291, net_kar_marji=0.334, kar_buyume_yillik=1.48, satis_buyume_yillik=4.23, net_borc_ozkaynak=0.105, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0