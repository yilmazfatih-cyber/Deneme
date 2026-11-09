# Hisse dosyası analizi — TRMET

Satır: 2288 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 154 (28 bağımsız bölüm); ≥%10 yükseliş 307 gün (41 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +336.7% (t=3.9), gün içi (açılış→kapanış) toplam -38.2% (t=-0.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 4.72e+04 | 2.94e+04 | +0.91 |
| snak_verimi | 0.0754 | 0.184 | -0.74 |
| mom_12_1 | 0.583 | 0.457 | +0.68 |
| satis_buyume_yillik | 0.23 | 0.297 | +0.66 |
| pd_dd | 1.78 | 1.63 | +0.63 |
| getiri_120g | 0.27 | 0.16 | +0.62 |
| kar_buyume_yillik | -0.945 | -0.945 | -0.60 |
| ma200_uzaklik | 0.179 | 0.14 | +0.56 |
| oynaklik_60g | 0.506 | 0.443 | +0.56 |
| ivol_60g | 0.409 | 0.402 | +0.50 |
| endekse_gore_60g | 0.202 | 0.0692 | +0.49 |
| devir_hizi_20g | 0.029 | 0.0299 | -0.45 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.0352 | 0.0283 | +0.77 |
| mom_12_1 | 0.437 | 0.565 | -0.53 |
| max_gunluk_20g | 0.0502 | 0.0583 | -0.45 |
| kar_buyume_yillik | -0.945 | -0.945 | +0.42 |
| pd_dd | 1.59 | 1.73 | -0.39 |
| endekse_gore_60g | 0.0517 | 0.119 | -0.37 |
| oynaklik_60g | 0.436 | 0.471 | -0.35 |
| ivol_60g | 0.399 | 0.402 | -0.35 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mom_12_1 | 441 | 438 |  | -0.46 | 0.000 | +8.8% | -5.0% | 4% | 45% | 0.0634–0.35 | 0.674–1.3 |
| pd_dd | 692 | 634 |  | -0.34 | 0.000 | +9.3% | +0.5% | 3% | 36% | 0.919–1.47 | 1.85–2.71 |
| snak_verimi | 643 | 586 |  | +0.30 | 0.000 | -6.2% | +8.3% | 47% | 2% | 0.0423–0.0738 | 0.212–0.265 |
| oynaklik_60g | 632 | 630 |  | -0.29 | 0.000 | +8.2% | +0.3% | 15% | 32% | 0.353–0.402 | 0.534–0.615 |
| max_gunluk_20g | 672 | 65 |  | -0.26 | 0.000 | +10.3% | +1.1% | 1% | 24% | 0.026–0.0425 | 0.0764–0.101 |
| endekse_gore_60g | 633 | 633 |  | -0.24 | 0.000 | +5.0% | -4.4% | 20% | 46% | -0.381–-0.126 | 0.241–0.518 |
| devir_hizi_20g | 219 | 219 |  | +0.39 | 0.000 | -1.3% | +16.1% | 50% | 9% | 0.0231–0.0272 | 0.0369–0.07 |
| piyasa_degeri_mn | 692 | 678 | seviye | -0.21 | 0.000 | +5.9% | -3.7% | 8% | 53% | 1.63e+04–2.24e+04 | 4.67e+04–6.56e+04 |
| ma200_uzaklik | 493 | 492 |  | -0.24 | 0.000 | +7.2% | -0.1% | 8% | 42% | -0.0795–0.0581 | 0.247–0.754 |
| oynaklik_20g | 672 | 670 |  | -0.20 | 0.000 | +6.5% | -0.4% | 12% | 31% | 0.239–0.364 | 0.557–0.708 |
| getiri_120g | 573 | 570 |  | -0.20 | 0.000 | +5.1% | -3.5% | 17% | 50% | -0.2–0.0391 | 0.381–1.25 |
| getiri_60g | 633 | 632 |  | -0.19 | 0.000 | +7.3% | -0.6% | 18% | 38% | -0.34–-0.0455 | 0.25–0.773 |
| gece_ort_20g | 672 | 642 |  | +0.18 | 0.000 | -0.4% | +5.4% | 36% | 15% | -0.00927–0.000532 | 0.00443–0.0131 |
| beta_60g | 632 | 632 |  | -0.18 | 0.000 | +5.3% | -0.1% | 20% | 36% | 0.191–0.656 | 1.22–1.57 |
| usdtry_getiri_20g | 672 | 664 |  | -0.17 | 0.001 | +7.0% | +1.9% | 12% | 22% | -0.013–0.00947 | 0.019–0.0482 |
| dolar_getiri_60g | 633 | 633 |  | -0.17 | 0.001 | +7.3% | +0.4% | 18% | 36% | -0.367–-0.0833 | 0.202–0.716 |
| ivol_60g | 573 | 571 |  | -0.17 | 0.003 | +7.5% | -0.5% | 12% | 37% | 0.309–0.374 | 0.444–0.543 |
| getiri_5g | 688 | 684 |  | -0.15 | 0.006 | +5.0% | +0.5% | 17% | 30% | -0.185–-0.0447 | 0.0701–0.207 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.1% | -1.0% | -1.1% | +3.3% | 61% |
| siyasi | hayır | 17 | +0.3% | +0.2% | +3.1% | +7.6% | 76% |
| derecelendirme | hayır | 15 | -1.1% | -0.7% | -2.2% | +1.0% | 53% |
| jeopolitik | hayır | 10 | -0.0% | -0.6% | -1.8% | -6.3% | 30% |
| enflasyon | hayır | 9 | +2.4% | +0.2% | +3.6% | +2.7% | 56% |
| regulasyon | hayır | 6 | -0.2% | +0.7% | +7.4% | +13.5% | 100% |
| haber | hayır | 5 | +2.9% | +0.9% | +4.7% | -0.4% | 40% |
| kuresel_faiz | hayır | 5 | -0.3% | -0.1% | +4.1% | +5.8% | 60% |
| sok | hayır | 5 | -4.7% | +1.4% | +10.8% | +15.4% | 100% |
| tarife | hayır | 5 | -0.5% | +1.5% | +4.8% | +3.4% | 80% |
| kur | hayır | 4 | -3.0% | +1.3% | -1.8% | -8.7% | 25% |
| dusus | hayır | 3 | +0.8% | -0.8% | +2.7% | +3.4% | 33% |
| yukselis | hayır | 3 | +3.4% | -1.9% | -6.4% | -15.8% | 0% |
| butce_vergi | hayır | 2 | +1.2% | +0.2% | +2.3% | +5.9% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 231 deneme. Al-tut Sharpe: eğitim 1.09, test 0.83.
Eğitimde seçilen kural: **rsi_14 > 47.12 ise nakde geç** (kantil 0.3). Eğitim Sharpe 3.02 → test Sharpe 0.2; testte nakitte kalma oranı 72%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.9%, test +3.7%.
Deflated Sharpe (deneme sayısı 231): 0.06 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.5 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.3 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.6 |
| haftanin_gunu | 3.0 | 143 | +0.9% | 3.9 |
| haftanin_gunu | 4.0 | 143 | +0.3% | 1.2 |
| ay_donusu | 0.0 | 521 | +0.3% | 2.5 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.9 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.6 |
| bayram_oncesi | 1.0 | 5 | +0.8% | 0.4 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.7 |
| bayram_sonrasi | 1.0 | 6 | -1.3% | -0.9 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.0 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.3 |

## Son durum (en yeni satır)

getiri_1g=0.0417, getiri_5g=0.167, getiri_20g=-0.156, getiri_60g=-0.0903, getiri_120g=-0.0636, mom_12_1=0.484, zirve_52h_yakinlik=0.679, zirveden_dusus=-0.321, oynaklik_20g=0.722, oynaklik_60g=0.612, atr_20g_oran=0.0556, rsi_14=45.5, ma20_uzaklik=0.00918, ma50_uzaklik=-0.0921, ma200_uzaklik=-0.109, hacim_z_20=-0.238, amihud_20g=0.0814, devir_hizi_20g=0.0248, gece_ort_20g=-0.002, gunici_ort_20g=-0.0053, aof_1g_sapma=0.00553, max_gunluk_20g=0.0677, min_gunluk_20g=-0.1, ivol_60g=0.48, endekse_gore_1g=0.019, endekse_gore_20g=-0.113, endekse_gore_60g=0.0807, beta_60g=1.35, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.131, piyasa_degeri_mn=4.46e+04, halka_aciklik=0.406, fk=19.8, kazanc_verimi=0.0505, pd_dd=1.48, fd_favok=4, snak_verimi=0.0542, temettu_verimi=0, roe_ttm=0.0749, net_kar_marji=0.108, kar_buyume_yillik=-0.324, satis_buyume_yillik=0.23, net_borc_ozkaynak=-0.243, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0