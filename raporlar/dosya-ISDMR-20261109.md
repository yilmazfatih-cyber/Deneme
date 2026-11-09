# Hisse dosyası analizi — ISDMR

Satır: 3978 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 125 (23 bağımsız bölüm); ≥%10 yükseliş 168 gün (26 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +553.4% (t=5.7), gün içi (açılış→kapanış) toplam -76.6% (t=-2.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirveden_dusus | -0.0498 | -0.128 | +1.12 |
| zirve_52h_yakinlik | 0.95 | 0.872 | +1.10 |
| ma200_uzaklik | 0.221 | 0.0222 | +1.09 |
| dolar_getiri_60g | 0.1 | -0.0378 | +1.00 |
| getiri_60g | 0.14 | 0.00561 | +1.00 |
| getiri_120g | 0.155 | 0.0323 | +0.94 |
| piyasa_degeri_mn | 1.28e+05 | 1.17e+05 | +0.87 |
| ma50_uzaklik | 0.0632 | -0.00546 | +0.86 |
| pd_dd | 1.19 | 1.06 | +0.85 |
| endekse_gore_60g | 0.0215 | -0.0278 | +0.79 |
| devir_hizi_20g | 0.0216 | 0.0145 | +0.78 |
| kar_buyume_yillik | 0.463 | 0.162 | +0.77 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_getiri_20g | 0.0556 | 0.00608 | +0.65 |
| roe_ttm | 0.0943 | 0.109 | -0.64 |
| xu100_ma200_uzaklik | 0.103 | 0.0637 | +0.51 |
| snak_verimi | 0.19 | 0.0589 | +0.48 |
| fk | 11.4 | 8.41 | +0.47 |
| oynaklik_20g | 0.246 | 0.32 | -0.46 |
| min_gunluk_20g | -0.0277 | -0.0333 | +0.45 |
| kazanc_verimi | 0.0879 | 0.119 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 446 |  | -0.36 | 0.000 | +4.9% | -3.3% | 0% | 49% | 0.761–0.838 | 0.944–1.08 |
| zirveden_dusus | 573 | 430 |  | -0.36 | 0.000 | +4.9% | -3.3% | 0% | 49% | -0.239–-0.162 | -0.0563–0 |
| oynaklik_20g | 672 | 672 |  | -0.37 | 0.000 | +4.6% | -3.2% | 10% | 23% | 0.122–0.222 | 0.383–0.703 |
| max_gunluk_20g | 672 | 64 |  | -0.47 | 0.000 | +5.7% | -2.5% | 1% | 29% | 0.0157–0.0268 | 0.055–0.101 |
| endekse_gore_20g | 673 | 672 |  | -0.40 | 0.000 | +6.4% | -3.6% | 6% | 31% | -0.193–-0.0553 | 0.0414–0.522 |
| piyasa_degeri_mn | 692 | 690 | seviye | -0.32 | 0.000 | +5.3% | +2.2% | 0% | 28% | 1.02e+05–1.11e+05 | 1.36e+05–2.06e+05 |
| pd_dd | 692 | 651 |  | -0.29 | 0.000 | +7.6% | -1.3% | 4% | 40% | 0.687–0.86 | 1.23–1.8 |
| getiri_120g | 573 | 572 |  | -0.29 | 0.000 | +4.4% | -0.4% | 0% | 30% | -0.183–-0.0372 | 0.182–0.853 |
| getiri_60g | 633 | 631 |  | -0.27 | 0.000 | +3.6% | -2.0% | 1% | 35% | -0.181–-0.0764 | 0.155–0.532 |
| dolar_getiri_60g | 633 | 632 |  | -0.27 | 0.000 | +3.3% | -1.7% | 1% | 31% | -0.227–-0.118 | 0.118–0.464 |
| atr_20g_oran | 672 | 663 |  | -0.26 | 0.000 | +4.8% | -2.8% | 9% | 27% | 0.0138–0.0203 | 0.0346–0.0524 |
| ma50_uzaklik | 643 | 642 |  | -0.26 | 0.000 | +3.8% | -3.1% | 2% | 34% | -0.15–-0.046 | 0.0757–0.385 |
| endekse_gore_60g | 633 | 632 |  | -0.26 | 0.000 | +6.5% | -0.6% | 6% | 25% | -0.25–-0.0855 | 0.0833–0.458 |
| devir_hizi_20g | 673 | 669 |  | -0.23 | 0.000 | +5.3% | -3.6% | 5% | 46% | 0.00698–0.0107 | 0.0217–0.0399 |
| ma200_uzaklik | 493 | 493 |  | -0.24 | 0.000 | +3.3% | -3.6% | 0% | 39% | -0.101–-0.0305 | 0.184–0.619 |
| rsi_14 | 678 | 662 |  | -0.20 | 0.000 | +3.5% | -0.6% | 7% | 30% | 14.6–41.8 | 61.4–83.6 |
| getiri_20g | 673 | 668 |  | -0.20 | 0.000 | +2.6% | -2.9% | 7% | 31% | -0.184–-0.0574 | 0.084–0.51 |
| min_gunluk_20g | 672 | 72 |  | +0.18 | 0.000 | -1.9% | +1.3% | 20% | 18% | -0.099–-0.0423 | -0.021–-0.00887 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.1% | -0.3% | +0.4% | +2.1% | 41% |
| siyasi | hayır | 17 | -0.8% | +0.5% | +1.6% | +0.4% | 41% |
| derecelendirme | hayır | 15 | -0.2% | +0.3% | -0.9% | +2.2% | 40% |
| jeopolitik | hayır | 10 | -0.9% | -0.8% | -0.2% | +4.2% | 60% |
| enflasyon | hayır | 9 | +1.6% | -0.8% | +1.8% | +0.2% | 22% |
| regulasyon | hayır | 6 | -0.1% | +0.1% | +1.9% | +4.0% | 50% |
| haber | hayır | 5 | +0.3% | +0.5% | +2.1% | +6.8% | 60% |
| kuresel_faiz | hayır | 5 | +0.9% | -0.6% | +2.1% | +4.9% | 60% |
| sok | hayır | 5 | -4.0% | +2.0% | +5.8% | +10.2% | 80% |
| tarife | hayır | 5 | +0.6% | +1.0% | +1.7% | +0.1% | 40% |
| kur | hayır | 4 | -0.4% | +1.0% | +0.6% | -3.5% | 25% |
| dusus | hayır | 3 | +0.6% | +1.0% | -2.8% | -6.5% | 0% |
| yukselis | hayır | 3 | +1.1% | -0.4% | -3.1% | -0.7% | 67% |
| butce_vergi | hayır | 2 | -1.2% | -0.8% | -1.8% | -8.1% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 233 deneme. Al-tut Sharpe: eğitim 0.25, test 0.97.
Eğitimde seçilen kural: **endekse_gore_1g > 0.004661 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.22 → test Sharpe 1.21; testte nakitte kalma oranı 35%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.1%, test +0.7%.
Deflated Sharpe (deneme sayısı 233): 0.25 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 1.0 |
| haftanin_gunu | 1.0 | 142 | -0.2% | -1.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 3.2 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 1.1 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.0 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.3 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_oncesi | 1.0 | 5 | +0.5% | 0.8 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.7 |
| bayram_sonrasi | 1.0 | 6 | +2.5% | 1.5 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.8 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.6 |

## Son durum (en yeni satır)

getiri_1g=0.0221, getiri_5g=0.0755, getiri_20g=-0.191, getiri_60g=0.0482, getiri_120g=-0.0405, mom_12_1=0.625, zirve_52h_yakinlik=0.805, zirveden_dusus=-0.195, oynaklik_20g=0.637, oynaklik_60g=0.507, atr_20g_oran=0.0534, rsi_14=42.4, ma20_uzaklik=-0.0444, ma50_uzaklik=-0.0872, ma200_uzaklik=0.0224, hacim_z_20=-0.743, amihud_20g=0.557, devir_hizi_20g=0.00911, gece_ort_20g=-0.0106, gunici_ort_20g=0.00238, aof_1g_sapma=0.0192, max_gunluk_20g=0.0815, min_gunluk_20g=-0.0534, ivol_60g=0.401, endekse_gore_1g=0.00237, endekse_gore_20g=-0.145, endekse_gore_60g=0.222, beta_60g=1.11, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.000672, piyasa_degeri_mn=1.55e+05, halka_aciklik=0.0504, fk=11.2, kazanc_verimi=0.0892, pd_dd=0.99, fd_favok=8.76, snak_verimi=0.173, temettu_verimi=0.0844, roe_ttm=0.0883, net_kar_marji=0.213, kar_buyume_yillik=2.84, satis_buyume_yillik=0.259, net_borc_ozkaynak=-0.0175, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0