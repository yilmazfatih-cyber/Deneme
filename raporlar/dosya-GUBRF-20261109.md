# Hisse dosyası analizi — GUBRF

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 215 (25 bağımsız bölüm); ≥%10 yükseliş 274 gün (28 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +335.4% (t=3.4), gün içi (açılış→kapanış) toplam -54.8% (t=-0.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| max_gunluk_20g | 0.0662 | 0.053 | +0.57 |
| piyasa_degeri_mn | 1.03e+05 | 9.11e+04 | +0.55 |
| oynaklik_20g | 0.482 | 0.411 | +0.50 |
| mom_12_1 | 0.675 | 0.566 | +0.37 |
| bilancodan_gun | 37 | 53.9 | -0.35 |
| net_borc_ozkaynak | 0.153 | 0.242 | -0.34 |
| pd_dd | 4.42 | 4.18 | +0.34 |
| atr_20g_oran | 0.0418 | 0.0374 | +0.34 |
| snak_verimi | 0.0507 | 0.0515 | +0.33 |
| beta_60g | 0.979 | 0.992 | +0.33 |
| endekse_gore_20g | 0.0449 | 0.00841 | +0.32 |
| roe_ttm | 0.202 | 0.16 | +0.25 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| max_gunluk_20g | 0.0491 | 0.0575 | -0.59 |
| mom_12_1 | 0.558 | 0.678 | -0.50 |
| fd_favok | 10.9 | 12.8 | -0.47 |
| oynaklik_20g | 0.393 | 0.463 | -0.42 |
| rsi_14 | 50.3 | 55.3 | -0.35 |
| net_kar_marji | 0.0447 | 0.0496 | -0.35 |
| getiri_120g | 0.232 | 0.284 | -0.33 |
| endekse_gore_20g | 0.000915 | 0.0477 | -0.32 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| max_gunluk_20g | 672 | 69 |  | -0.30 | 0.000 | +8.4% | -5.3% | 8% | 49% | 0.0203–0.0423 | 0.0994–0.102 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.31 | 0.000 | +12.5% | +2.7% | 17% | 27% | -0.671–-0.451 | 1.32–3.56 |
| oynaklik_20g | 672 | 671 |  | -0.28 | 0.000 | +8.8% | -3.8% | 17% | 45% | 0.225–0.32 | 0.556–0.82 |
| piyasa_degeri_mn | 692 | 690 | seviye | -0.26 | 0.000 | +7.8% | -4.8% | 19% | 55% | 4.46e+04–5.81e+04 | 1.49e+05–2.08e+05 |
| fd_favok | 643 | 628 |  | -0.24 | 0.000 | +6.1% | -0.3% | 13% | 35% | 8.34–9.77 | 15.7–21.1 |
| mom_12_1 | 441 | 441 |  | -0.28 | 0.000 | +13.0% | -0.9% | 9% | 30% | 0.0637–0.368 | 0.925–1.7 |
| atr_20g_oran | 672 | 662 |  | -0.20 | 0.000 | +8.3% | -0.8% | 16% | 31% | 0.0243–0.0314 | 0.0494–0.0724 |
| fk | 395 | 389 |  | -0.26 | 0.000 | +7.5% | -3.0% | 13% | 46% | 13.4–16.1 | 26.8–130 |
| oynaklik_60g | 632 | 631 |  | -0.20 | 0.000 | +6.5% | -4.4% | 23% | 41% | 0.263–0.385 | 0.502–0.604 |
| usdtry_getiri_20g | 672 | 664 |  | -0.18 | 0.000 | +7.0% | -0.0% | 24% | 36% | -0.013–0.00947 | 0.019–0.0482 |
| halka_aciklik | 692 | 25 | seviye | +0.16 | 0.001 | +1.4% | +7.3% | 32% | 29% | 0.203–0.211 | 0.239–0.24 |
| getiri_120g | 573 | 572 |  | -0.17 | 0.002 | +4.8% | -0.6% | 22% | 27% | -0.241–-0.063 | 0.674–1.12 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.14 | 0.008 | -4.4% | +5.1% | 53% | 35% | -0.135–-0.0136 | 0.474–0.65 |
| endekse_gore_20g | 673 | 673 |  | -0.12 | 0.066 | +3.4% | -0.6% | 23% | 39% | -0.256–-0.0777 | 0.118–0.398 |
| bilancodan_gun | 693 | 303 | seviye | +0.12 | 0.111 | +0.1% | +2.3% | 51% | 30% | 0.917–19 | 79–113 |
| dolar_getiri_60g | 633 | 633 |  | +0.11 | 0.247 | +5.2% | +4.9% | 24% | 22% | -0.345–-0.13 | 0.264–0.7 |
| pd_dd | 692 | 662 |  | -0.11 | 0.248 | +1.8% | +1.2% | 24% | 33% | 2.87–3.82 | 5.82–10.1 |
| endekse_gore_60g | 633 | 633 |  | +0.10 | 0.510 | +5.0% | +4.1% | 24% | 23% | -0.407–-0.145 | 0.296–0.607 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.2% | +0.0% | -0.1% | +1.6% | 43% |
| siyasi | hayır | 9 | -0.6% | -0.4% | -1.6% | -0.7% | 44% |
| enflasyon | hayır | 6 | +2.1% | -0.6% | +0.1% | +3.3% | 50% |
| jeopolitik | hayır | 5 | -2.0% | -0.6% | -4.5% | -3.2% | 20% |
| sok | hayır | 5 | -7.5% | -2.2% | +1.3% | +3.0% | 60% |
| tarife | hayır | 5 | +1.5% | -1.0% | +1.1% | +0.1% | 60% |
| derecelendirme | hayır | 4 | +1.4% | +1.1% | +0.4% | +9.4% | 100% |
| dusus | hayır | 3 | -2.9% | -1.4% | -6.9% | -3.1% | 33% |
| yukselis | hayır | 3 | +2.7% | +1.0% | +0.3% | -2.4% | 0% |
| butce_vergi | hayır | 2 | -0.6% | +0.1% | +2.0% | +3.2% | 50% |
| kur | hayır | 2 | -0.9% | -1.5% | +1.2% | -0.9% | 50% |
| YÖN: olumsuz | evet | 1 | - | -0.4% | +5.9% | +14.0% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 234 deneme. Al-tut Sharpe: eğitim 0.94, test 0.33.
Eğitimde seçilen kural: **getiri_1g < -0.01127 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.79 → test Sharpe 0.4; testte nakitte kalma oranı 32%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +2.7%, test -0.5%.
Deflated Sharpe (deneme sayısı 234): 0.05 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.5 |
| haftanin_gunu | 1.0 | 142 | -0.4% | -1.7 |
| haftanin_gunu | 2.0 | 141 | +0.2% | 0.9 |
| haftanin_gunu | 3.0 | 143 | +0.7% | 3.5 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.4 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.4 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.1 |
| bayram_oncesi | 1.0 | 5 | -0.1% | -0.0 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.1 |
| bayram_sonrasi | 1.0 | 6 | +0.6% | 0.8 |
| bilanco_sezonu | 0.0 | 422 | +0.0% | 0.1 |
| bilanco_sezonu | 1.0 | 291 | +0.3% | 1.5 |

## Son durum (en yeni satır)

getiri_1g=0.0554, getiri_5g=0.108, getiri_20g=-0.272, getiri_60g=-0.273, getiri_120g=-0.488, mom_12_1=0.308, zirve_52h_yakinlik=0.494, zirveden_dusus=-0.506, oynaklik_20g=0.827, oynaklik_60g=0.681, atr_20g_oran=0.0637, rsi_14=34.8, ma20_uzaklik=-0.0748, ma50_uzaklik=-0.244, ma200_uzaklik=-0.35, hacim_z_20=-0.18, amihud_20g=0.24, devir_hizi_20g=0.0433, gece_ort_20g=-0.0165, gunici_ort_20g=0.000923, aof_1g_sapma=0.00189, max_gunluk_20g=0.0999, min_gunluk_20g=-0.104, ivol_60g=0.496, endekse_gore_1g=0.0392, endekse_gore_20g=-0.223, endekse_gore_60g=-0.0971, beta_60g=1.66, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.306, piyasa_degeri_mn=1.02e+05, halka_aciklik=0.199, fk=12.8, kazanc_verimi=0.0781, pd_dd=2.59, fd_favok=6.66, snak_verimi=0.111, temettu_verimi=0.0147, roe_ttm=0.202, net_kar_marji=0.11, kar_buyume_yillik=-0.232, satis_buyume_yillik=0.191, net_borc_ozkaynak=-0.135, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1