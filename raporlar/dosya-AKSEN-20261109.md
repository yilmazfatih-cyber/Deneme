# Hisse dosyası analizi — AKSEN

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 169 (23 bağımsız bölüm); ≥%10 yükseliş 241 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +206.4% (t=3.3), gün içi (açılış→kapanış) toplam -23.2% (t=-0.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 5.37e+04 | 4.82e+04 | +0.54 |
| ivol_60g | 0.367 | 0.311 | +0.43 |
| fd_favok | 7.66 | 7.21 | +0.43 |
| pd_dd | 1.4 | 1.26 | +0.41 |
| amihud_20g | 0.0603 | 0.0828 | -0.39 |
| bilancodan_gun | 64 | 45 | +0.37 |
| mom_12_1 | 0.704 | 0.407 | +0.35 |
| min_gunluk_20g | -0.0458 | -0.0416 | -0.35 |
| max_gunluk_20g | 0.0445 | 0.0475 | -0.31 |
| net_kar_marji | 0.0818 | 0.0909 | -0.29 |
| gece_ort_20g | 0.000569 | 0.00247 | -0.27 |
| net_borc_ozkaynak | 0.68 | 0.68 | +0.26 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| temettu_verimi | 0 | 0 | -0.74 |
| kar_buyume_yillik | -0.0724 | -0.4 | +0.56 |
| roe_ttm | 0.0486 | 0.0677 | -0.46 |
| max_gunluk_20g | 0.0475 | 0.0462 | +0.39 |
| halka_aciklik | 0.194 | 0.198 | -0.38 |
| zirveden_dusus | -0.104 | -0.202 | +0.37 |
| zirve_52h_yakinlik | 0.896 | 0.798 | +0.36 |
| satis_buyume_yillik | -0.106 | -0.106 | +0.34 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.29 | 0.000 | +6.6% | -4.9% | 9% | 42% | 0.0369–0.0475 | 0.2–0.2 |
| kar_buyume_yillik | 566 | 9 | çeyreklik adım | +0.27 | 0.000 | -0.0% | +14.0% | 33% | 14% | -1.13–-0.479 | 0.222–0.222 |
| pd_dd | 692 | 646 |  | -0.24 | 0.000 | +8.8% | -0.6% | 6% | 29% | 0.711–1.02 | 1.58–2.21 |
| temettu_verimi | 693 | 207 |  | -0.23 | 0.000 | +3.1% | +1.5% | 26% | 11% | 0–0.0353 | 0.0353–0.0423 |
| gece_ort_20g | 672 | 643 |  | +0.23 | 0.000 | -1.6% | +5.2% | 35% | 19% | -0.00541–-0.00072 | 0.0043–0.00862 |
| halka_aciklik | 692 | 32 | seviye | -0.21 | 0.000 | +8.9% | +2.4% | 15% | 22% | 0.187–0.19 | 0.206–0.21 |
| piyasa_degeri_mn | 692 | 686 | seviye | -0.20 | 0.000 | +6.1% | -1.3% | 2% | 41% | 3.68e+04–4.32e+04 | 8.88e+04–1.42e+05 |
| fd_favok | 643 | 605 |  | -0.20 | 0.000 | +8.2% | -1.1% | 5% | 36% | 5.08–6.39 | 10.2–13 |
| olay_sayi_5g | 693 | 5 |  | +0.16 | 0.001 | +2.3% | +11.3% | 24% | 3% | 0–1 | 2–4 |
| snak_verimi | 643 | 598 |  | -0.16 | 0.002 | +7.3% | +4.4% | 20% | 22% | -0.213–-0.158 | -0.098–0.0353 |
| max_gunluk_20g | 672 | 59 |  | +0.16 | 0.002 | +0.4% | +3.7% | 28% | 19% | 0.0164–0.0344 | 0.0739–0.11 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.16 | 0.003 | +2.1% | +14.0% | 21% | 14% | -0.623–-0.479 | 0.625–0.625 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.15 | 0.004 | +2.1% | +10.0% | 25% | 4% | -0.0353–0.0568 | 0.136–0.275 |
| usdtry_getiri_20g | 672 | 664 |  | -0.14 | 0.008 | +3.0% | +2.4% | 19% | 16% | -0.013–0.00947 | 0.019–0.0482 |
| atr_20g_oran | 672 | 663 |  | +0.13 | 0.022 | -0.2% | +4.0% | 28% | 28% | 0.0217–0.0291 | 0.0415–0.0735 |
| bilancodan_gun | 693 | 303 | seviye | -0.13 | 0.040 | +1.5% | -1.2% | 22% | 36% | 0.917–19 | 79–113 |
| beta_60g | 632 | 632 |  | -0.12 | 0.092 | +0.7% | -3.1% | 31% | 27% | 0.36–0.706 | 0.999–1.31 |
| endekse_gore_60g | 633 | 630 |  | -0.12 | 0.108 | +5.9% | +2.3% | 9% | 29% | -0.18–-0.0711 | 0.123–0.835 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.3% | +0.4% | +1.1% | +5.7% | 70% |
| siyasi | hayır | 9 | -1.3% | +0.8% | -1.1% | +9.9% | 67% |
| enflasyon | hayır | 6 | +0.5% | -0.6% | -2.8% | -4.8% | 0% |
| jeopolitik | hayır | 5 | +0.4% | -0.7% | -1.2% | +5.4% | 60% |
| sok | hayır | 5 | -8.0% | -0.9% | +1.8% | +12.2% | 100% |
| tarife | hayır | 5 | +2.9% | +0.3% | +3.2% | +4.2% | 40% |
| derecelendirme | hayır | 4 | -0.6% | +0.3% | +2.2% | +0.4% | 75% |
| dusus | hayır | 3 | -3.4% | +0.0% | -0.2% | +3.3% | 100% |
| yukselis | hayır | 3 | +0.7% | +0.1% | -0.5% | +11.7% | 100% |
| butce_vergi | hayır | 2 | +2.1% | +1.8% | +8.7% | +4.3% | 100% |
| kur | hayır | 2 | +1.2% | +4.1% | +13.2% | +2.3% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 191 deneme. Al-tut Sharpe: eğitim 0.61, test 1.31.
Eğitimde seçilen kural: **getiri_120g > -0.08568 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.15 → test Sharpe 0.52; testte nakitte kalma oranı 89%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.1%, test +5.3%.
Deflated Sharpe (deneme sayısı 191): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.2 |
| haftanin_gunu | 1.0 | 142 | +0.3% | 1.3 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.3 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.2 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.3 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.8 |
| ay_donusu | 1.0 | 192 | +0.0% | 0.2 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.6 |
| bayram_oncesi | 1.0 | 5 | -0.2% | -0.1 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.6 |
| bayram_sonrasi | 1.0 | 6 | -0.7% | -0.8 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.8 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0299, getiri_5g=0.135, getiri_20g=-0.0447, getiri_60g=-0.178, getiri_120g=-0.139, mom_12_1=0.275, zirve_52h_yakinlik=0.61, zirveden_dusus=-0.39, oynaklik_20g=0.694, oynaklik_60g=0.537, atr_20g_oran=0.0524, rsi_14=50.1, ma20_uzaklik=0.0416, ma50_uzaklik=-0.0168, ma200_uzaklik=-0.104, hacim_z_20=-0.139, amihud_20g=0.109, devir_hizi_20g=0.0182, gece_ort_20g=-0.00884, gunici_ort_20g=0.00709, aof_1g_sapma=0.0228, max_gunluk_20g=0.0737, min_gunluk_20g=-0.0996, ivol_60g=0.428, endekse_gore_1g=0.0137, endekse_gore_20g=0.00446, endekse_gore_60g=-0.00183, beta_60g=1.14, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.215, piyasa_degeri_mn=8.66e+04, halka_aciklik=0.193, fk=23.5, kazanc_verimi=0.0426, pd_dd=1.26, fd_favok=9.51, snak_verimi=-0.131, temettu_verimi=0, roe_ttm=0.0538, net_kar_marji=0.0606, kar_buyume_yillik=-0.519, satis_buyume_yillik=-0.279, net_borc_ozkaynak=0.868, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1