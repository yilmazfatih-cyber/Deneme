# Hisse dosyası analizi — BIMAS

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 96 (15 bağımsız bölüm); ≥%10 yükseliş 196 gün (42 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +315.5% (t=4.6), gün içi (açılış→kapanış) toplam -40.4% (t=-0.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fd_favok | 15.4 | 11.3 | +0.90 |
| endekse_gore_60g | 0.127 | 0.0118 | +0.88 |
| snak_verimi | 0.0421 | 0.0531 | -0.68 |
| roe_ttm | 0.272 | 0.158 | +0.52 |
| piyasa_degeri_mn | 3.62e+05 | 3.28e+05 | +0.52 |
| getiri_120g | 0.273 | 0.129 | +0.52 |
| oynaklik_60g | 0.324 | 0.355 | -0.48 |
| mom_12_1 | 0.436 | 0.26 | +0.46 |
| getiri_60g | 0.0916 | 0.0866 | +0.45 |
| beta_60g | 0.865 | 0.972 | -0.44 |
| dolar_getiri_60g | 0.04 | 0.0419 | +0.44 |
| amihud_20g | 0.00933 | 0.012 | -0.43 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| net_kar_marji | 0.0374 | 0.0351 | +0.55 |
| piyasa_degeri_mn | 3.16e+05 | 3.34e+05 | -0.52 |
| usdtry_getiri_20g | 0.0111 | 0.0151 | -0.52 |
| temettu_verimi | 0.0132 | 0.0178 | -0.45 |
| gunici_ort_20g | 0.00102 | -0.000762 | +0.42 |
| bilancodan_gun | 40.9 | 50 | -0.37 |
| kar_buyume_yillik | -0.169 | -0.169 | +0.36 |
| aof_1g_sapma | 0.0372 | 0.0295 | +0.31 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 693 | 692 | seviye | -0.31 | 0.000 | +7.6% | +0.3% | 6% | 17% | 1.88e+05–2.95e+05 | 4.2e+05–1e+06 |
| endekse_gore_60g | 634 | 634 |  | -0.30 | 0.000 | +6.4% | -2.6% | 4% | 34% | -0.19–-0.0621 | 0.119–0.566 |
| snak_verimi | 644 | 573 |  | +0.26 | 0.000 | -3.0% | +4.9% | 31% | 3% | 0.0166–0.0252 | 0.0715–0.096 |
| pd_dd | 693 | 641 |  | -0.24 | 0.000 | +6.5% | +1.5% | 4% | 24% | 1.68–2.32 | 3.65–8.66 |
| usdtry_getiri_20g | 673 | 665 |  | -0.23 | 0.000 | +5.8% | +1.4% | 13% | 12% | -0.013–0.00945 | 0.019–0.0482 |
| fd_favok | 644 | 624 |  | -0.23 | 0.000 | +6.0% | -3.8% | 1% | 35% | 9.03–9.91 | 15.5–19.7 |
| getiri_120g | 574 | 573 |  | -0.21 | 0.000 | +1.6% | -3.2% | 15% | 28% | -0.173–-0.0383 | 0.346–0.896 |
| bilancodan_gun | 694 | 303 | seviye | -0.15 | 0.004 | +2.9% | -1.3% | 11% | 24% | 0.917–19 | 79–113 |
| endekse_gore_20g | 674 | 673 |  | -0.15 | 0.004 | +4.7% | +1.0% | 10% | 20% | -0.192–-0.0427 | 0.0676–0.215 |
| zirveden_dusus | 574 | 420 |  | -0.16 | 0.006 | +4.5% | -1.1% | 2% | 27% | -0.342–-0.206 | -0.0342–0 |
| zirve_52h_yakinlik | 574 | 455 |  | -0.16 | 0.006 | +4.5% | -1.1% | 2% | 27% | 0.658–0.794 | 0.966–1.04 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.14 | 0.012 | +1.9% | +9.1% | 2% | 8% | 0.0176–0.0304 | 0.0603–0.0628 |
| beta_60g | 633 | 633 |  | +0.14 | 0.012 | -1.2% | +2.8% | 24% | 15% | 0.614–0.81 | 1.08–1.35 |
| mom_12_1 | 442 | 441 |  | -0.17 | 0.014 | +3.1% | +0.2% | 3% | 11% | -0.258–-0.00915 | 0.5–0.767 |
| oynaklik_60g | 633 | 630 |  | +0.14 | 0.014 | -2.7% | +3.5% | 31% | 6% | 0.285–0.321 | 0.399–0.508 |
| devir_hizi_20g | 674 | 663 |  | +0.14 | 0.017 | +1.0% | +7.0% | 4% | 11% | 0.0043–0.00928 | 0.0174–0.0302 |
| oynaklik_20g | 673 | 670 |  | +0.13 | 0.036 | +1.3% | +3.0% | 10% | 7% | 0.184–0.293 | 0.42–0.742 |
| ma200_uzaklik | 494 | 494 |  | -0.15 | 0.037 | +3.3% | +0.5% | 12% | 14% | -0.22–-0.00553 | 0.209–0.368 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.5% | -0.6% | -0.4% | +0.7% | 52% |
| siyasi | hayır | 9 | -0.2% | +0.4% | -1.0% | -0.7% | 44% |
| enflasyon | hayır | 6 | +1.5% | +1.5% | +1.7% | -0.7% | 50% |
| jeopolitik | hayır | 5 | +0.2% | -0.1% | -1.1% | +1.4% | 60% |
| sok | hayır | 5 | -4.8% | +1.6% | +7.0% | +8.5% | 100% |
| tarife | hayır | 5 | +0.8% | +0.2% | -0.7% | +2.3% | 60% |
| derecelendirme | hayır | 4 | +0.9% | +0.6% | +0.5% | -0.5% | 50% |
| dusus | hayır | 3 | -1.1% | -0.7% | -0.2% | -3.3% | 33% |
| yukselis | hayır | 3 | +3.8% | +0.5% | -1.8% | -0.4% | 33% |
| butce_vergi | hayır | 2 | -1.0% | +2.6% | +4.2% | +1.9% | 100% |
| kur | hayır | 2 | -0.6% | +1.4% | +1.2% | +2.6% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 172 deneme. Al-tut Sharpe: eğitim 1.06, test 1.09.
Eğitimde seçilen kural: **min_gunluk_20g < -0.05158 ise nakde geç** (kantil 0.2). Eğitim Sharpe 1.81 → test Sharpe 1.1; testte nakitte kalma oranı 7%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.5%, test +0.0%.
Deflated Sharpe (deneme sayısı 172): 0.14 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.8 |
| haftanin_gunu | 1.0 | 143 | +0.5% | 2.4 |
| haftanin_gunu | 2.0 | 141 | +0.2% | 1.2 |
| haftanin_gunu | 3.0 | 143 | +0.1% | 0.6 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -0.9 |
| ay_donusu | 0.0 | 522 | +0.2% | 1.8 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.7 |
| bayram_oncesi | 1.0 | 6 | +1.3% | 1.3 |
| bayram_sonrasi | 0.0 | 708 | +0.2% | 1.8 |
| bayram_sonrasi | 1.0 | 6 | -0.2% | -0.3 |
| bilanco_sezonu | 0.0 | 423 | +0.2% | 2.1 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0175, getiri_5g=0.0619, getiri_20g=-0.0627, getiri_60g=0.00667, getiri_120g=-0.0668, mom_12_1=0.451, zirve_52h_yakinlik=0.868, zirveden_dusus=-0.132, oynaklik_20g=0.407, oynaklik_60g=0.349, atr_20g_oran=0.0296, rsi_14=43.8, ma20_uzaklik=-0.00245, ma50_uzaklik=-0.0612, ma200_uzaklik=0.00512, hacim_z_20=-0.328, amihud_20g=0.00593, devir_hizi_20g=0.0103, gece_ort_20g=-0.00244, gunici_ort_20g=-0.0012, aof_1g_sapma=0.00678, max_gunluk_20g=0.0369, min_gunluk_20g=-0.0492, ivol_60g=0.257, endekse_gore_1g=0.00136, endekse_gore_20g=-0.0136, endekse_gore_60g=0.183, beta_60g=0.84, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.039, piyasa_degeri_mn=4.53e+05, halka_aciklik=0.675, fk=15.3, kazanc_verimi=0.0652, pd_dd=2.25, fd_favok=9.49, snak_verimi=0.0532, temettu_verimi=0.0186, roe_ttm=0.147, net_kar_marji=0.0358, kar_buyume_yillik=1.23, satis_buyume_yillik=0.0965, net_borc_ozkaynak=0.289, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1