# Hisse dosyası analizi — ISMEN

Satır: 3978 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 213 (25 bağımsız bölüm); ≥%10 yükseliş 195 gün (26 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +219.7% (t=3.3), gün içi (açılış→kapanış) toplam -72.7% (t=-2.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| snak_verimi | 0.19 | 0.281 | -0.59 |
| fd_favok | 3.21 | 2.89 | +0.57 |
| roe_ttm | 0.255 | 0.281 | -0.49 |
| endekse_gore_20g | 0.0112 | -0.0302 | +0.47 |
| max_gunluk_20g | 0.0586 | 0.0492 | +0.44 |
| net_borc_ozkaynak | 0.223 | 0.0749 | +0.42 |
| beta_60g | 0.96 | 1.06 | -0.40 |
| piyasa_degeri_mn | 7.06e+04 | 6.58e+04 | +0.37 |
| oynaklik_20g | 0.391 | 0.364 | +0.35 |
| rsi_14 | 50.5 | 45.1 | +0.35 |
| endekse_gore_60g | -0.0242 | -0.0598 | +0.33 |
| gunici_ort_20g | -0.00111 | -0.00249 | +0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| aof_1g_sapma | 0.221 | 0.0801 | +0.61 |
| net_kar_marji | 0.00571 | 0.00384 | +0.57 |
| beta_60g | 1.13 | 0.995 | +0.52 |
| amihud_20g | 0.0895 | 0.0729 | +0.45 |
| xu100_ma200_uzaklik | -0.00495 | 0.0825 | -0.43 |
| temettu_verimi | 0.0298 | 0.0881 | -0.41 |
| getiri_120g | -0.00792 | 0.04 | -0.39 |
| mom_12_1 | -0.0494 | 0.0888 | -0.38 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| beta_60g | 632 | 630 |  | +0.33 | 0.000 | -1.3% | +8.9% | 28% | 9% | 0.648–0.848 | 1.22–1.49 |
| roe_ttm | 643 | 11 | çeyreklik adım | +0.32 | 0.000 | -4.7% | -2.0% | 45% | 31% | 0.207–0.252 | 0.392–0.392 |
| halka_aciklik | 692 | 6 | seviye | -0.27 | 0.000 | +5.1% | -1.5% | 10% | 33% | 0.285–0.292 | 0.292–0.295 |
| endekse_gore_20g | 673 | 672 |  | -0.23 | 0.000 | +1.5% | -4.8% | 24% | 50% | -0.213–-0.0775 | 0.0564–0.204 |
| fd_favok | 643 | 620 |  | -0.23 | 0.000 | -0.6% | -7.1% | 19% | 59% | 1.16–2.4 | 3.34–3.85 |
| getiri_120g | 573 | 573 |  | -0.23 | 0.000 | +0.3% | -7.3% | 31% | 50% | -0.386–-0.133 | 0.17–0.5 |
| snak_verimi | 643 | 599 |  | +0.21 | 0.000 | -6.3% | +0.4% | 54% | 21% | -0.978–0.128 | 0.397–0.522 |
| gunici_ort_20g | 673 | 656 |  | -0.20 | 0.000 | +5.2% | -1.8% | 14% | 41% | -0.0113–-0.00483 | 0.00113–0.0141 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.19 | 0.000 | -0.3% | -4.4% | 26% | 50% | 4.42e+04–5.76e+04 | 7.38e+04–9.78e+04 |
| aof_1g_sapma | 692 | 689 |  | +0.18 | 0.000 | -6.1% | +3.1% | 41% | 33% | -0.0235–0.0623 | 0.236–0.302 |
| usdtry_getiri_20g | 672 | 664 |  | -0.17 | 0.000 | +5.0% | -2.3% | 24% | 34% | -0.013–0.00947 | 0.019–0.0482 |
| endekse_gore_60g | 633 | 632 |  | -0.17 | 0.001 | +4.0% | -2.5% | 16% | 31% | -0.329–-0.148 | 0.0562–0.331 |
| max_gunluk_20g | 672 | 58 |  | -0.15 | 0.004 | +1.9% | -0.4% | 5% | 30% | 0.0151–0.0378 | 0.0699–0.0936 |
| mom_12_1 | 441 | 440 |  | -0.18 | 0.006 | -1.1% | -4.5% | 34% | 33% | -0.295–-0.109 | 0.232–0.647 |
| rsi_14 | 678 | 670 |  | -0.14 | 0.008 | +2.9% | -1.6% | 14% | 37% | 16.9–38.7 | 61–81.8 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.16 | 0.014 | +3.9% | -2.9% | 30% | 42% | -0.118–-0.0163 | 0.144–0.312 |
| zirve_52h_yakinlik | 573 | 500 |  | -0.15 | 0.017 | -2.0% | -4.9% | 30% | 40% | 0.555–0.694 | 0.888–1.04 |
| zirveden_dusus | 573 | 486 |  | -0.15 | 0.017 | -2.0% | -4.9% | 30% | 40% | -0.445–-0.306 | -0.112–0 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.4% | -0.3% | -0.5% | -3.7% | 29% |
| siyasi | hayır | 17 | -0.2% | +0.2% | +0.1% | -0.5% | 53% |
| derecelendirme | hayır | 15 | +0.4% | -0.4% | -0.8% | -1.4% | 47% |
| jeopolitik | hayır | 10 | -0.6% | +1.3% | -0.6% | -2.1% | 30% |
| enflasyon | hayır | 9 | +1.1% | -0.3% | -1.1% | +0.9% | 22% |
| regulasyon | hayır | 6 | -0.6% | -0.4% | -4.8% | -4.5% | 33% |
| haber | hayır | 5 | +0.8% | -0.7% | +0.9% | -3.5% | 20% |
| kuresel_faiz | hayır | 5 | +1.1% | -0.8% | -1.2% | -4.1% | 20% |
| sok | hayır | 5 | -4.7% | +2.3% | +2.1% | -5.6% | 0% |
| tarife | hayır | 5 | +1.2% | -0.5% | -1.9% | -2.2% | 20% |
| kur | hayır | 4 | -0.4% | -0.0% | -0.2% | -7.4% | 0% |
| dusus | hayır | 3 | -2.7% | -0.1% | +1.0% | -5.4% | 33% |
| yukselis | hayır | 3 | +2.3% | +1.6% | +0.7% | +2.3% | 67% |
| butce_vergi | hayır | 2 | +0.6% | +0.7% | +2.7% | -1.6% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 190 deneme. Al-tut Sharpe: eğitim 0.70, test -1.10.
Eğitimde seçilen kural: **getiri_120g > -0.04955 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.57 → test Sharpe -1.23; testte nakitte kalma oranı 58%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -3.0%, test -1.1%.
Deflated Sharpe (deneme sayısı 190): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.2 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.7 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.6 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.7 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.3 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.6 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.8 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.4 |
| bayram_oncesi | 1.0 | 5 | -3.3% | -1.0 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.2 |
| bayram_sonrasi | 1.0 | 6 | -0.4% | -0.3 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.5 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0227, getiri_5g=0.0965, getiri_20g=-0.063, getiri_60g=-0.157, getiri_120g=-0.311, mom_12_1=-0.336, zirve_52h_yakinlik=0.527, zirveden_dusus=-0.473, oynaklik_20g=0.383, oynaklik_60g=0.377, atr_20g_oran=0.0336, rsi_14=44.7, ma20_uzaklik=0.0189, ma50_uzaklik=-0.0917, ma200_uzaklik=-0.269, hacim_z_20=0.0233, amihud_20g=0.206, devir_hizi_20g=0.00803, gece_ort_20g=-0.00332, gunici_ort_20g=-0.000436, aof_1g_sapma=0.0175, max_gunluk_20g=0.0653, min_gunluk_20g=-0.0373, ivol_60g=0.272, endekse_gore_1g=0.00301, endekse_gore_20g=-0.0172, endekse_gore_60g=0.0165, beta_60g=0.915, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.195, piyasa_degeri_mn=4.19e+04, halka_aciklik=0.292, fk=5.7, kazanc_verimi=0.175, pd_dd=1.19, fd_favok=3.25, snak_verimi=-1.03, temettu_verimi=0.113, roe_ttm=0.208, net_kar_marji=0.00287, kar_buyume_yillik=-0.305, satis_buyume_yillik=-0.0715, net_borc_ozkaynak=1.09, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0