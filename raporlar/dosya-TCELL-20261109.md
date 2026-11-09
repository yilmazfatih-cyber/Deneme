# Hisse dosyası analizi — TCELL

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 110 (26 bağımsız bölüm); ≥%10 yükseliş 185 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +186.4% (t=3.5), gün içi (açılış→kapanış) toplam -44.2% (t=-1.0).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | 0.0917 | 0.0114 | +1.16 |
| getiri_120g | 0.24 | 0.0285 | +1.10 |
| piyasa_degeri_mn | 2.42e+05 | 2.18e+05 | +0.98 |
| zirveden_dusus | -0.0943 | -0.158 | +0.86 |
| zirve_52h_yakinlik | 0.906 | 0.842 | +0.86 |
| xu100_ma200_uzaklik | 0.113 | 0.0639 | +0.74 |
| fd_favok | 2.59 | 2.33 | +0.70 |
| mom_12_1 | 0.151 | 0.083 | +0.53 |
| endekse_gore_60g | 0.028 | -0.0206 | +0.43 |
| fk | 10.5 | 8.86 | +0.42 |
| bilancodan_gun | 57.5 | 47.9 | +0.35 |
| devir_hizi_20g | 0.0163 | 0.0194 | -0.35 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 2.06e+05 | 2.24e+05 | -0.85 |
| net_kar_marji | 0.0894 | 0.0767 | +0.60 |
| getiri_120g | 0.00934 | 0.0633 | -0.45 |
| aof_1g_sapma | 0.0521 | 0.0248 | +0.44 |
| bilancodan_gun | 42 | 50 | -0.39 |
| zirveden_dusus | -0.166 | -0.143 | -0.38 |
| zirve_52h_yakinlik | 0.834 | 0.857 | -0.37 |
| min_gunluk_20g | -0.0343 | -0.0361 | +0.34 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 446 |  | -0.38 | 0.000 | +3.0% | -4.4% | 6% | 41% | 0.717–0.806 | 0.915–1.04 |
| zirveden_dusus | 573 | 429 |  | -0.38 | 0.000 | +3.0% | -4.4% | 6% | 41% | -0.283–-0.194 | -0.0855–0 |
| getiri_120g | 573 | 572 |  | -0.38 | 0.000 | +1.9% | -5.9% | 5% | 57% | -0.192–-0.0656 | 0.181–0.823 |
| piyasa_degeri_mn | 692 | 686 | seviye | -0.54 | 0.000 | +9.1% | -5.5% | 2% | 42% | 1.36e+05–2.06e+05 | 2.41e+05–2.8e+05 |
| snak_verimi | 643 | 577 |  | +0.31 | 0.000 | -3.8% | +2.6% | 21% | 12% | -0.154–0.0882 | 0.24–0.292 |
| bilancodan_gun | 693 | 303 | seviye | -0.23 | 0.000 | +2.6% | -3.5% | 16% | 34% | 0.917–19 | 79–113 |
| ma200_uzaklik | 493 | 493 |  | -0.24 | 0.000 | +2.0% | -3.7% | 4% | 35% | -0.116–-0.0354 | 0.0904–0.3 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.19 | 0.000 | +0.7% | +6.5% | 9% | 11% | -0.124–0.0679 | 0.341–0.537 |
| endekse_gore_60g | 633 | 632 |  | -0.20 | 0.000 | +3.9% | -1.1% | 7% | 30% | -0.239–-0.0855 | 0.0617–0.472 |
| aof_1g_sapma | 692 | 690 |  | +0.17 | 0.001 | -0.6% | +4.4% | 16% | 17% | -0.0317–0.00326 | 0.0695–0.102 |
| halka_aciklik | 692 | 69 | seviye | +0.15 | 0.003 | +0.4% | -3.5% | 10% | 0% | 0.381–0.431 | 0.548–0.548 |
| usdtry_getiri_20g | 672 | 664 |  | -0.14 | 0.020 | +4.4% | +2.0% | 15% | 11% | -0.013–0.00947 | 0.019–0.0482 |
| fk | 643 | 622 |  | -0.13 | 0.030 | +2.6% | +0.3% | 10% | 26% | 4.06–6.61 | 11.5–16.6 |
| kazanc_verimi | 643 | 577 |  | +0.13 | 0.030 | +0.3% | +2.6% | 26% | 10% | 0.0601–0.0869 | 0.151–0.246 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.13 | 0.146 | +0.9% | -0.6% | 14% | 33% | -0.118–-0.0163 | 0.144–0.312 |
| fd_favok | 643 | 600 |  | -0.12 | 0.164 | +3.2% | +1.2% | 6% | 29% | 1.74–2.06 | 2.8–3.48 |
| devir_hizi_20g | 673 | 653 |  | +0.11 | 0.205 | -0.8% | -0.5% | 25% | 15% | 0.0108–0.0157 | 0.0251–0.0367 |
| rsi_14 | 678 | 664 |  | -0.10 | 0.446 | +4.5% | +3.4% | 6% | 12% | 25.5–43 | 61.5–84.9 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.2% | -0.2% | -1.1% | -0.1% | 43% |
| siyasi | hayır | 9 | -0.8% | -0.4% | -0.3% | -1.0% | 44% |
| enflasyon | hayır | 6 | +1.4% | -1.2% | +1.0% | -1.8% | 33% |
| jeopolitik | hayır | 5 | -2.2% | +0.8% | -1.1% | -1.3% | 20% |
| sok | hayır | 5 | -4.8% | +0.6% | +3.4% | +8.8% | 80% |
| tarife | hayır | 5 | +1.7% | -0.1% | +0.2% | -2.0% | 40% |
| derecelendirme | hayır | 4 | +1.0% | +0.1% | -0.8% | -2.2% | 25% |
| dusus | hayır | 3 | -1.4% | +0.7% | +0.2% | -2.1% | 33% |
| yukselis | hayır | 3 | +2.8% | +1.3% | -0.6% | -7.4% | 0% |
| butce_vergi | hayır | 2 | -0.7% | +0.0% | -2.9% | +2.0% | 50% |
| kur | hayır | 2 | -0.1% | -0.5% | -1.5% | -5.2% | 0% |
| YÖN: olumsuz | evet | 1 | - | +3.7% | +5.0% | +1.8% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 211 deneme. Al-tut Sharpe: eğitim 1.03, test 0.03.
Eğitimde seçilen kural: **zirveden_dusus > -0.1873 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.89 → test Sharpe 1.02; testte nakitte kalma oranı 78%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.9%, test +0.3%.
Deflated Sharpe (deneme sayısı 211): 0.30 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.6 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.8 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.8 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.5 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -1.2 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.3 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.1 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.1 |
| bayram_oncesi | 1.0 | 5 | -0.7% | -0.5 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.0 |
| bayram_sonrasi | 1.0 | 6 | +0.8% | 0.8 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.7 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.2 |

## Son durum (en yeni satır)

getiri_1g=0.02, getiri_5g=0.000545, getiri_20g=-0.0689, getiri_60g=-0.116, getiri_120g=-0.165, mom_12_1=-0.0243, zirve_52h_yakinlik=0.722, zirveden_dusus=-0.278, oynaklik_20g=0.26, oynaklik_60g=0.302, atr_20g_oran=0.0299, rsi_14=36.9, ma20_uzaklik=-0.025, ma50_uzaklik=-0.0555, ma200_uzaklik=-0.144, hacim_z_20=0.572, amihud_20g=0.0125, devir_hizi_20g=0.0206, gece_ort_20g=-0.00586, gunici_ort_20g=0.000615, aof_1g_sapma=-0.000843, max_gunluk_20g=0.0223, min_gunluk_20g=-0.036, ivol_60g=0.232, endekse_gore_1g=0.00382, endekse_gore_20g=-0.0198, endekse_gore_60g=0.0603, beta_60g=0.661, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.156, piyasa_degeri_mn=2.02e+05, halka_aciklik=0.369, fk=9.6, kazanc_verimi=0.104, pd_dd=0.653, fd_favok=2.3, snak_verimi=-0.159, temettu_verimi=0.0198, roe_ttm=0.068, net_kar_marji=0.0767, kar_buyume_yillik=-0.0466, satis_buyume_yillik=0.027, net_borc_ozkaynak=0.397, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1