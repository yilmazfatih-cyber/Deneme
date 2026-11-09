# Hisse dosyası analizi — TABGD

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 134 (19 bağımsız bölüm); ≥%10 yükseliş 189 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +158.2% (t=3.0), gün içi (açılış→kapanış) toplam -33.0% (t=-0.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| beta_60g | 0.518 | 0.717 | -0.79 |
| fk | 19.8 | 18 | +0.78 |
| fd_favok | 6.06 | 5.46 | +0.78 |
| ivol_60g | 0.328 | 0.265 | +0.73 |
| snak_verimi | 0.112 | 0.13 | -0.67 |
| kazanc_verimi | 0.0506 | 0.0555 | -0.65 |
| satis_buyume_yillik | 0.369 | 0.446 | -0.56 |
| kar_buyume_yillik | 0.00134 | 0.0563 | -0.55 |
| halka_aciklik | 0.201 | 0.201 | +0.53 |
| piyasa_degeri_mn | 5.53e+04 | 4.94e+04 | +0.43 |
| xu100_getiri_20g | -0.0121 | 0.0148 | -0.41 |
| atr_20g_oran | 0.0355 | 0.0308 | +0.40 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.0587 | 0.0528 | +0.99 |
| fk | 17 | 18.9 | -0.94 |
| roe_ttm | 0.174 | 0.169 | +0.61 |
| piyasa_degeri_mn | 4.61e+04 | 5.36e+04 | -0.60 |
| oynaklik_60g | 0.362 | 0.331 | +0.58 |
| oynaklik_20g | 0.333 | 0.309 | +0.51 |
| getiri_120g | 0.0846 | 0.184 | -0.51 |
| ma200_uzaklik | 0.0622 | 0.104 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ivol_60g | 573 | 572 |  | -0.33 | 0.000 | +3.4% | -3.8% | 7% | 34% | 0.2–0.229 | 0.345–0.401 |
| snak_verimi | 643 | 582 |  | +0.35 | 0.000 | -4.0% | +2.1% | 42% | 10% | 0.0687–0.0914 | 0.161–0.198 |
| fk | 643 | 638 |  | -0.43 | 0.000 | +7.3% | -5.3% | 10% | 47% | 9.69–16.2 | 20.2–24.5 |
| kazanc_verimi | 643 | 577 |  | +0.43 | 0.000 | -5.3% | +7.3% | 47% | 10% | 0.0409–0.0496 | 0.0618–0.103 |
| fd_favok | 643 | 623 |  | -0.32 | 0.000 | +6.2% | -2.2% | 2% | 38% | 4.31–5.09 | 6.32–8.73 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.30 | 0.000 | +6.0% | -3.2% | 9% | 32% | 3.03e+04–4.13e+04 | 6.35e+04–7.55e+04 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.27 | 0.000 | +5.7% | +0.3% | 13% | 25% | -0.188–-0.151 | 0.13–0.6 |
| beta_60g | 632 | 631 |  | +0.24 | 0.000 | +0.3% | +6.0% | 24% | 1% | 0.253–0.467 | 0.874–1.17 |
| getiri_120g | 573 | 572 |  | -0.24 | 0.000 | +2.3% | -3.0% | 15% | 27% | -0.267–-0.0614 | 0.282–0.798 |
| pd_dd | 692 | 659 |  | -0.20 | 0.000 | +1.5% | -1.3% | 22% | 35% | 1.99–2.54 | 3.35–16.2 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.21 | 0.000 | -2.0% | -0.1% | 31% | 26% | 0.109–0.27 | 0.464–0.783 |
| aof_1g_sapma | 692 | 689 |  | +0.18 | 0.000 | -2.4% | +3.8% | 34% | 16% | -0.0364–0.0126 | 0.0419–0.0841 |
| ma20_uzaklik | 673 | 672 |  | +0.18 | 0.000 | -2.5% | +2.8% | 38% | 12% | -0.145–-0.0368 | 0.0567–0.147 |
| xu100_getiri_20g | 673 | 671 |  | +0.17 | 0.000 | -2.1% | +2.9% | 31% | 16% | -0.166–-0.0409 | 0.0783–0.222 |
| amihud_20g | 672 | 670 |  | +0.17 | 0.000 | +1.6% | +7.3% | 19% | 2% | 0.0117–0.0655 | 0.14–0.207 |
| usdtry_getiri_20g | 672 | 664 |  | -0.17 | 0.001 | +4.1% | -0.6% | 13% | 30% | -0.013–0.00947 | 0.019–0.0482 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | +0.17 | 0.001 | -1.0% | +6.8% | 33% | 0% | -0.996–-0.447 | 1.21–1.21 |
| endekse_gore_60g | 633 | 633 |  | -0.15 | 0.004 | +3.0% | -1.2% | 17% | 24% | -0.284–-0.0929 | 0.116–0.468 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.7% | -0.5% | -0.9% | +2.2% | 65% |
| siyasi | hayır | 9 | -1.9% | +1.2% | +1.6% | +2.3% | 67% |
| enflasyon | hayır | 6 | +0.7% | -0.4% | +1.7% | +4.2% | 67% |
| jeopolitik | hayır | 5 | -2.7% | +0.1% | +1.7% | +3.4% | 80% |
| sok | hayır | 5 | -2.7% | +2.6% | +1.2% | +5.5% | 60% |
| tarife | hayır | 5 | +0.1% | -0.5% | +1.4% | +2.0% | 40% |
| derecelendirme | hayır | 4 | -0.2% | +0.9% | -0.2% | +1.6% | 50% |
| dusus | hayır | 3 | -1.7% | +0.4% | +2.8% | -3.2% | 67% |
| yukselis | hayır | 3 | +0.9% | +0.1% | +2.0% | +2.8% | 100% |
| butce_vergi | hayır | 2 | -0.9% | -1.1% | -3.4% | +3.9% | 100% |
| kur | hayır | 2 | +0.6% | -0.7% | +0.8% | +5.4% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 223 deneme. Al-tut Sharpe: eğitim 1.31, test -0.16.
Eğitimde seçilen kural: **ivol_60g > 0.306 ise nakde geç** (kantil 0.8). Eğitim Sharpe 2.22 → test Sharpe -0.63; testte nakitte kalma oranı 49%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -10.6%, test +0.4%.
Deflated Sharpe (deneme sayısı 223): 0.01 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.2% | -1.1 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.0 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.7 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 2.0 |
| haftanin_gunu | 4.0 | 143 | +0.5% | 2.7 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.3 |
| ay_donusu | 1.0 | 192 | +0.0% | 0.1 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.2 |
| bayram_oncesi | 1.0 | 5 | +0.2% | 0.2 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.2 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.1 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.4 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=0.00197, getiri_5g=0.104, getiri_20g=-0.107, getiri_60g=-0.22, getiri_120g=-0.272, mom_12_1=-0.0452, zirve_52h_yakinlik=0.705, zirveden_dusus=-0.295, oynaklik_20g=0.534, oynaklik_60g=0.381, atr_20g_oran=0.039, rsi_14=49.9, ma20_uzaklik=0.0219, ma50_uzaklik=-0.0627, ma200_uzaklik=-0.172, hacim_z_20=-0.48, amihud_20g=0.321, devir_hizi_20g=0.00731, gece_ort_20g=-0.00613, gunici_ort_20g=0.00166, aof_1g_sapma=0.0207, max_gunluk_20g=0.0475, min_gunluk_20g=-0.0547, ivol_60g=0.337, endekse_gore_1g=-0.0142, endekse_gore_20g=-0.0581, endekse_gore_60g=-0.0433, beta_60g=0.621, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.255, piyasa_degeri_mn=5.31e+04, halka_aciklik=0.316, fk=17.2, kazanc_verimi=0.0582, pd_dd=1.99, fd_favok=4.86, snak_verimi=0.0867, temettu_verimi=0.0246, roe_ttm=0.116, net_kar_marji=0.0891, kar_buyume_yillik=0.00134, satis_buyume_yillik=0.109, net_borc_ozkaynak=0.152, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1