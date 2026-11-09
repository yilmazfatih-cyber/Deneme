# Hisse dosyası analizi — EREGL

Satır: 3982 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 157 (24 bağımsız bölüm); ≥%10 yükseliş 208 gün (30 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +332.8% (t=4.7), gün içi (açılış→kapanış) toplam -63.3% (t=-1.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | 0.27 | 0.0308 | +0.83 |
| zirve_52h_yakinlik | 0.899 | 0.836 | +0.82 |
| zirveden_dusus | -0.101 | -0.164 | +0.82 |
| ma200_uzaklik | 0.165 | 0.0405 | +0.79 |
| piyasa_degeri_mn | 2.08e+05 | 1.77e+05 | +0.77 |
| fd_favok | 8.98 | 7.95 | +0.71 |
| pd_dd | 0.832 | 0.765 | +0.67 |
| max_gunluk_20g | 0.049 | 0.0376 | +0.66 |
| endekse_gore_60g | 0.042 | -0.00191 | +0.60 |
| endekse_gore_20g | 0.0416 | -0.0105 | +0.58 |
| mom_12_1 | 0.245 | 0.108 | +0.56 |
| rsi_14 | 55.6 | 49.9 | +0.51 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| pd_dd | 0.714 | 0.8 | -0.63 |
| endekse_gore_60g | -0.00896 | 0.0306 | -0.54 |
| getiri_120g | -0.00333 | 0.143 | -0.54 |
| ivol_60g | 0.244 | 0.252 | -0.52 |
| piyasa_degeri_mn | 1.74e+05 | 1.86e+05 | -0.46 |
| ma200_uzaklik | 0.0325 | 0.0877 | -0.45 |
| max_gunluk_20g | 0.0376 | 0.0433 | -0.40 |
| xu100_ma200_uzaklik | 0.11 | 0.0639 | +0.34 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| max_gunluk_20g | 673 | 66 |  | -0.31 | 0.000 | +4.1% | -4.2% | 8% | 49% | 0.0114–0.0312 | 0.0548–0.105 |
| pd_dd | 693 | 670 |  | -0.35 | 0.000 | +8.9% | -1.9% | 6% | 34% | 0.483–0.674 | 0.899–1.11 |
| piyasa_degeri_mn | 693 | 691 | seviye | -0.29 | 0.000 | +4.8% | -0.6% | 11% | 39% | 1.39e+05–1.67e+05 | 2.13e+05–3.11e+05 |
| getiri_120g | 574 | 573 |  | -0.32 | 0.000 | +5.3% | -3.3% | 3% | 54% | -0.206–-0.0563 | 0.308–0.76 |
| kar_buyume_yillik | 541 | 9 | çeyreklik adım | -0.29 | 0.000 | +8.7% | +0.5% | 5% | 27% | -1.25–-0.924 | 61–61 |
| zirve_52h_yakinlik | 574 | 484 |  | -0.25 | 0.000 | +5.3% | -0.8% | 0% | 46% | 0.704–0.786 | 0.95–1.07 |
| zirveden_dusus | 574 | 451 |  | -0.25 | 0.000 | +5.3% | -0.8% | 0% | 46% | -0.296–-0.214 | -0.0496–0 |
| fd_favok | 644 | 638 |  | -0.23 | 0.000 | +5.7% | +1.8% | 5% | 33% | 6.04–7.4 | 9.97–13.1 |
| ma200_uzaklik | 494 | 494 |  | -0.25 | 0.000 | +4.7% | -0.6% | 1% | 46% | -0.148–-0.044 | 0.189–0.477 |
| endekse_gore_60g | 634 | 634 |  | -0.22 | 0.000 | +6.9% | -0.9% | 1% | 31% | -0.286–-0.124 | 0.126–0.441 |
| beta_60g | 633 | 632 |  | -0.17 | 0.000 | +3.1% | -2.2% | 17% | 31% | 0.522–0.743 | 1.1–1.33 |
| bilancodan_gun | 694 | 302 | seviye | -0.16 | 0.001 | +0.9% | -2.6% | 27% | 24% | 0.917–18.9 | 77.9–113 |
| mom_12_1 | 442 | 440 |  | -0.20 | 0.001 | +5.8% | +0.1% | 2% | 30% | -0.143–-0.0131 | 0.371–0.707 |
| endekse_gore_20g | 674 | 673 |  | -0.15 | 0.003 | +3.1% | -1.3% | 8% | 36% | -0.191–-0.0638 | 0.0726–0.277 |
| oynaklik_20g | 673 | 672 |  | -0.15 | 0.003 | +3.1% | -0.9% | 14% | 30% | 0.104–0.251 | 0.436–0.658 |
| net_kar_marji | 694 | 12 | çeyreklik adım | -0.14 | 0.008 | +3.9% | +0.3% | 20% | 39% | -0.0156–0.00643 | 0.132–0.168 |
| amihud_20g | 653 | 612 |  | +0.14 | 0.015 | -0.3% | +6.6% | 34% | 15% | 0.00131–0.00296 | 0.00523–0.00859 |
| dolar_getiri_60g | 634 | 633 |  | -0.14 | 0.017 | +3.7% | -1.0% | 9% | 39% | -0.27–-0.112 | 0.183–0.485 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bedelsiz | evet | 2 | +0.8% | +2.6% | +0.3% | +1.0% | 50% |
| regulasyon | evet | 2 | +0.5% | -0.2% | -0.5% | -0.8% | 50% |
| temettu | evet | 2 | -1.3% | -0.3% | -2.4% | -4.5% | 0% |
| faiz | hayır | 41 | -0.2% | -0.0% | +0.8% | +1.4% | 51% |
| siyasi | hayır | 17 | -0.5% | +0.1% | +1.6% | -0.0% | 53% |
| derecelendirme | hayır | 15 | +0.6% | +0.5% | -0.0% | +2.4% | 53% |
| jeopolitik | hayır | 10 | -0.6% | -0.9% | -0.9% | +3.2% | 50% |
| enflasyon | hayır | 9 | +1.1% | -1.1% | +1.3% | +1.5% | 33% |
| regulasyon | hayır | 6 | -0.1% | +0.3% | +2.6% | +8.0% | 83% |
| sok | hayır | 6 | -5.3% | -1.3% | +3.2% | +5.8% | 67% |
| haber | hayır | 5 | +1.2% | +1.5% | +3.2% | +6.7% | 60% |
| kuresel_faiz | hayır | 5 | +0.5% | +0.9% | +5.5% | +5.1% | 60% |
| tarife | hayır | 5 | +1.0% | +1.1% | +3.0% | +2.2% | 80% |
| kur | hayır | 4 | -1.2% | +0.7% | -0.4% | -3.8% | 25% |
| dusus | hayır | 3 | -2.5% | -0.1% | -3.0% | -3.9% | 0% |
| yukselis | hayır | 3 | +2.0% | -0.7% | -3.9% | -7.3% | 0% |
| butce_vergi | hayır | 2 | -1.2% | -0.9% | -1.8% | -9.1% | 0% |
| YÖN: notr | evet | 2 | - | +0.6% | +1.0% | -2.7% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 232 deneme. Al-tut Sharpe: eğitim 0.70, test 0.52.
Eğitimde seçilen kural: **usdtry_getiri_20g > 0.01109 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.91 → test Sharpe 0.28; testte nakitte kalma oranı 66%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.6%, test +2.1%.
Deflated Sharpe (deneme sayısı 232): 0.05 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.8 |
| haftanin_gunu | 1.0 | 143 | -0.1% | -0.4 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.3 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.7 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.6 |
| ay_donusu | 0.0 | 522 | +0.1% | 1.2 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.0 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 6 | +0.3% | 0.3 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | +1.8% | 2.3 |
| bilanco_sezonu | 0.0 | 423 | +0.1% | 0.9 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.0574, getiri_5g=0.0941, getiri_20g=-0.12, getiri_60g=-0.123, getiri_120g=-0.169, mom_12_1=0.371, zirve_52h_yakinlik=0.738, zirveden_dusus=-0.262, oynaklik_20g=0.525, oynaklik_60g=0.433, atr_20g_oran=0.0403, rsi_14=36.7, ma20_uzaklik=-0.0309, ma50_uzaklik=-0.0917, ma200_uzaklik=-0.072, hacim_z_20=0.00109, amihud_20g=0.0097, devir_hizi_20g=0.0252, gece_ort_20g=-0.00868, gunici_ort_20g=0.000825, aof_1g_sapma=0.0114, max_gunluk_20g=0.0415, min_gunluk_20g=-0.1, ivol_60g=0.302, endekse_gore_1g=0.0347, endekse_gore_20g=-0.0768, endekse_gore_60g=0.0484, beta_60g=1.1, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.162, piyasa_degeri_mn=2.29e+05, halka_aciklik=0.457, fk=29.3, kazanc_verimi=0.0342, pd_dd=0.72, fd_favok=8.85, snak_verimi=0.212, temettu_verimi=0.0168, roe_ttm=0.0246, net_kar_marji=0.132, kar_buyume_yillik=5.54, satis_buyume_yillik=0.567, net_borc_ozkaynak=0.125, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0