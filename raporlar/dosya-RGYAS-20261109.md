# Hisse dosyası analizi — RGYAS

Satır: 3899 (gün sonu satırı 632) · 2024-05-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 81 (19 bağımsız bölüm); ≥%10 yükseliş 135 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
632 günde gece (kapanış→açılış) toplam +79.6% (t=2.2), gün içi (açılış→kapanış) toplam -23.0% (t=-0.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| oynaklik_60g | 0.273 | 0.325 | -0.64 |
| xu100_ma200_uzaklik | 0.0466 | 0.0941 | -0.58 |
| ivol_60g | 0.244 | 0.261 | -0.58 |
| bilancodan_gun | 68 | 44 | +0.56 |
| pd_dd | 0.477 | 0.458 | +0.55 |
| roe_ttm | 0.318 | 0.142 | +0.51 |
| fd_favok | 4.56 | 5.35 | -0.45 |
| mom_12_1 | 0.328 | 0.328 | +0.43 |
| kazanc_verimi | 0.629 | 0.326 | +0.43 |
| net_borc_ozkaynak | 0.176 | 0.172 | +0.42 |
| amihud_20g | 0.176 | 0.143 | +0.41 |
| olay_sayi_5g | 0 | 0 | -0.37 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirveden_dusus | -0.107 | -0.0438 | -0.89 |
| zirve_52h_yakinlik | 0.893 | 0.956 | -0.88 |
| getiri_120g | 0.044 | 0.15 | -0.85 |
| ma200_uzaklik | 0.0743 | 0.156 | -0.81 |
| pd_dd | 0.412 | 0.465 | -0.80 |
| kar_buyume_yillik | -0.509 | 0.434 | -0.61 |
| piyasa_degeri_mn | 4.31e+04 | 4.8e+04 | -0.47 |
| getiri_60g | 0.0176 | 0.0944 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pd_dd | 611 | 541 |  | -0.42 | 0.000 | +7.3% | -4.0% | 7% | 30% | 0.291–0.406 | 0.492–0.686 |
| roe_ttm | 612 | 11 | çeyreklik adım | -0.32 | 0.000 | +2.2% | -3.5% | 8% | 30% | 0.0228–0.0308 | 0.328–0.412 |
| oynaklik_60g | 551 | 548 |  | +0.28 | 0.000 | -3.8% | +3.7% | 25% | 3% | 0.2–0.272 | 0.351–0.404 |
| ma200_uzaklik | 412 | 411 |  | -0.32 | 0.000 | +5.9% | -1.4% | 19% | 19% | -0.155–0.0523 | 0.202–0.327 |
| zirveden_dusus | 492 | 392 |  | -0.28 | 0.000 | +7.8% | -1.1% | 7% | 14% | -0.262–-0.132 | -0.0226–0 |
| zirve_52h_yakinlik | 492 | 432 |  | -0.28 | 0.000 | +7.8% | -1.1% | 7% | 14% | 0.738–0.868 | 0.977–1.07 |
| net_kar_marji | 612 | 11 | çeyreklik adım | -0.26 | 0.000 | +3.8% | +2.2% | 3% | 9% | -1.87–0.681 | 2.69–7.01 |
| getiri_120g | 492 | 491 |  | -0.27 | 0.000 | +7.2% | +0.7% | 5% | 6% | -0.198–0.0322 | 0.281–0.543 |
| kar_buyume_yillik | 566 | 9 | çeyreklik adım | -0.22 | 0.000 | +5.2% | +1.5% | 5% | 0% | -1.37–-0.509 | 3.66–3.66 |
| fk | 611 | 580 |  | +0.19 | 0.000 | +0.9% | +1.7% | 19% | 9% | 1.29–1.5 | 14.8–22.1 |
| kazanc_verimi | 611 | 538 |  | -0.19 | 0.000 | +1.8% | +0.9% | 9% | 19% | 0.0452–0.0676 | 0.668–0.776 |
| fd_favok | 611 | 578 |  | +0.19 | 0.000 | -2.2% | +1.0% | 29% | 14% | 2.89–4.24 | 6.35–10.7 |
| olay_sayi_5g | 612 | 5 |  | +0.18 | 0.000 | +1.4% | +3.8% | 13% | 0% | 0–1 | 2–4 |
| min_gunluk_20g | 591 | 67 |  | +0.18 | 0.000 | +2.0% | +4.3% | 2% | 1% | -0.0984–-0.0544 | -0.0197–-0.0012 |
| temettu_verimi | 612 | 172 |  | +0.17 | 0.001 | +0.5% | +5.7% | 15% | 4% | 0–0.00848 | 0.00849–0.051 |
| ivol_60g | 492 | 489 |  | +0.18 | 0.004 | -1.8% | +3.8% | 22% | 1% | 0.198–0.24 | 0.301–0.375 |
| mom_12_1 | 360 | 359 |  | -0.19 | 0.011 | +5.4% | +1.7% | 0% | 8% | -0.155–0.116 | 0.449–0.655 |
| bilancodan_gun | 612 | 288 | seviye | -0.15 | 0.012 | +2.2% | -0.1% | 10% | 24% | 0.917–18.9 | 77.9–112 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.4% | -0.6% | -1.9% | +2.0% | 52% |
| siyasi | hayır | 9 | -0.8% | -0.0% | -0.7% | +2.4% | 67% |
| enflasyon | hayır | 6 | +0.2% | -0.8% | +0.4% | +4.5% | 50% |
| jeopolitik | hayır | 5 | -1.5% | -0.5% | -1.2% | +0.6% | 60% |
| sok | hayır | 5 | -3.4% | +0.1% | +4.0% | +9.8% | 100% |
| tarife | hayır | 5 | +0.3% | +1.0% | +3.8% | +7.7% | 100% |
| derecelendirme | hayır | 4 | +1.5% | +0.7% | -2.1% | +2.9% | 50% |
| dusus | hayır | 3 | -2.2% | -1.5% | -1.3% | -1.1% | 33% |
| yukselis | hayır | 3 | +3.0% | +0.5% | -0.4% | -2.5% | 33% |
| butce_vergi | hayır | 2 | +0.0% | -0.6% | -0.4% | -5.0% | 0% |
| kur | hayır | 2 | -0.5% | +1.3% | +0.7% | +1.6% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 379 gün, test 253 gün, 212 deneme. Al-tut Sharpe: eğitim 0.63, test 0.47.
Eğitimde seçilen kural: **endekse_gore_1g > -0.009659 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.24 → test Sharpe 1.53; testte nakitte kalma oranı 74%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.0%, test +1.4%.
Deflated Sharpe (deneme sayısı 212): 0.33 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 127 | -0.1% | -0.8 |
| haftanin_gunu | 1.0 | 126 | +0.2% | 1.1 |
| haftanin_gunu | 2.0 | 125 | -0.1% | -0.5 |
| haftanin_gunu | 3.0 | 127 | +0.4% | 2.0 |
| haftanin_gunu | 4.0 | 127 | +0.1% | 0.3 |
| ay_donusu | 0.0 | 463 | +0.1% | 1.2 |
| ay_donusu | 1.0 | 169 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 627 | +0.1% | 0.9 |
| bayram_oncesi | 1.0 | 5 | +0.3% | 1.0 |
| bayram_sonrasi | 0.0 | 627 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 5 | -0.5% | -0.7 |
| bilanco_sezonu | 0.0 | 383 | +0.1% | 0.8 |
| bilanco_sezonu | 1.0 | 249 | +0.1% | 0.4 |

## Son durum (en yeni satır)

getiri_1g=0.0394, getiri_5g=0.0587, getiri_20g=-0.0839, getiri_60g=-0.153, getiri_120g=-0.12, mom_12_1=0.174, zirve_52h_yakinlik=0.823, zirveden_dusus=-0.177, oynaklik_20g=0.397, oynaklik_60g=0.342, atr_20g_oran=0.0359, rsi_14=37.5, ma20_uzaklik=-0.0151, ma50_uzaklik=-0.0686, ma200_uzaklik=-0.0386, hacim_z_20=0.203, amihud_20g=0.114, devir_hizi_20g=0.0113, gece_ort_20g=-0.00508, gunici_ort_20g=0.000385, aof_1g_sapma=0.000512, max_gunluk_20g=0.0389, min_gunluk_20g=-0.0688, ivol_60g=0.291, endekse_gore_1g=0.0232, endekse_gore_20g=-0.0348, endekse_gore_60g=0.0234, beta_60g=0.619, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.191, piyasa_degeri_mn=5.85e+04, halka_aciklik=0.245, fk=2.51, kazanc_verimi=0.398, pd_dd=0.357, fd_favok=5.25, snak_verimi=0.0202, temettu_verimi=0.0535, roe_ttm=0.142, net_kar_marji=0.924, kar_buyume_yillik=0.219, satis_buyume_yillik=0.376, net_borc_ozkaynak=0.147, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1