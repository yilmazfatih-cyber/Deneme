# Hisse dosyası analizi — THYAO

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 124 (27 bağımsız bölüm); ≥%10 yükseliş 135 gün (23 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +369.8% (t=5.0), gün içi (açılış→kapanış) toplam -72.2% (t=-2.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fk | 2.98 | 2.68 | +0.84 |
| kazanc_verimi | 0.335 | 0.373 | -0.79 |
| piyasa_degeri_mn | 4.33e+05 | 4.11e+05 | +0.71 |
| ma200_uzaklik | 0.0438 | -0.00828 | +0.67 |
| zirve_52h_yakinlik | 0.908 | 0.867 | +0.64 |
| zirveden_dusus | -0.0921 | -0.133 | +0.63 |
| roe_ttm | 0.167 | 0.195 | -0.57 |
| beta_60g | 0.903 | 0.967 | -0.53 |
| getiri_120g | 0.0475 | -0.0118 | +0.51 |
| halka_aciklik | 0.504 | 0.504 | -0.51 |
| pd_dd | 0.527 | 0.602 | -0.45 |
| devir_hizi_20g | 0.0447 | 0.041 | +0.44 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 4.01e+05 | 4.22e+05 | -1.06 |
| endekse_gore_60g | -0.0876 | -0.0086 | -0.93 |
| beta_60g | 1.04 | 0.943 | +0.93 |
| zirveden_dusus | -0.153 | -0.108 | -0.89 |
| zirve_52h_yakinlik | 0.847 | 0.892 | -0.89 |
| ma200_uzaklik | -0.017 | 0.0148 | -0.68 |
| getiri_120g | -0.0451 | 0.017 | -0.62 |
| kar_buyume_yillik | 0.0875 | 0.00407 | -0.60 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 429 |  | -0.52 | 0.000 | +4.4% | -5.3% | 8% | 39% | 0.749–0.836 | 0.932–1.01 |
| zirveden_dusus | 573 | 421 |  | -0.52 | 0.000 | +4.4% | -5.3% | 8% | 39% | -0.251–-0.164 | -0.0682–0 |
| getiri_120g | 573 | 566 |  | -0.43 | 0.000 | +5.4% | -4.2% | 7% | 39% | -0.179–-0.0582 | 0.098–0.3 |
| ma200_uzaklik | 493 | 492 |  | -0.50 | 0.000 | +3.5% | -6.0% | 8% | 42% | -0.145–-0.0447 | 0.0678–0.182 |
| fk | 643 | 564 |  | -0.44 | 0.000 | +2.1% | -6.6% | 7% | 50% | 2–2.41 | 2.96–3.52 |
| kazanc_verimi | 643 | 544 |  | +0.44 | 0.000 | -6.6% | +2.1% | 50% | 7% | 0.284–0.338 | 0.414–0.5 |
| piyasa_degeri_mn | 692 | 587 | seviye | -0.58 | 0.000 | +6.5% | -5.3% | 1% | 34% | 3.25e+05–3.95e+05 | 4.41e+05–4.81e+05 |
| endekse_gore_60g | 633 | 633 |  | -0.31 | 0.000 | +4.3% | -1.5% | 13% | 23% | -0.241–-0.117 | 0.0355–0.13 |
| beta_60g | 632 | 632 |  | +0.29 | 0.000 | -3.4% | +4.1% | 30% | 12% | 0.755–0.877 | 1.05–1.38 |
| devir_hizi_20g | 673 | 668 |  | -0.25 | 0.000 | +2.9% | -3.0% | 11% | 31% | 0.0225–0.0322 | 0.0549–0.0778 |
| getiri_60g | 633 | 630 |  | -0.24 | 0.000 | +2.8% | -2.7% | 17% | 24% | -0.231–-0.09 | 0.114–0.296 |
| amihud_20g | 672 | 560 |  | +0.23 | 0.000 | -2.9% | +2.3% | 23% | 15% | 0.000738–0.00122 | 0.00205–0.00388 |
| dolar_getiri_60g | 633 | 632 |  | -0.22 | 0.000 | +2.6% | -2.4% | 20% | 24% | -0.285–-0.129 | 0.0702–0.248 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.20 | 0.000 | +0.9% | +5.6% | 21% | 2% | -0.0103–0.0384 | 0.304–0.642 |
| gece_ort_20g | 672 | 635 |  | -0.18 | 0.000 | +3.0% | -0.7% | 7% | 29% | -0.00502–0.00074 | 0.00379–0.0102 |
| rsi_14 | 678 | 661 |  | -0.16 | 0.001 | +1.6% | -2.0% | 7% | 21% | 26.2–42 | 60.1–83.8 |
| atr_20g_oran | 672 | 658 |  | -0.14 | 0.010 | +3.4% | -1.5% | 10% | 28% | 0.0143–0.0209 | 0.0284–0.0392 |
| mom_12_1 | 441 | 438 |  | -0.16 | 0.036 | +1.8% | -1.7% | 29% | 23% | -0.198–-0.0639 | 0.131–0.303 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.5% | +0.1% | +0.5% | +1.8% | 57% |
| siyasi | hayır | 9 | -0.7% | +0.3% | +0.3% | -0.2% | 33% |
| enflasyon | hayır | 6 | +1.6% | +0.2% | -1.4% | -4.1% | 17% |
| jeopolitik | hayır | 5 | -3.7% | +1.3% | +0.3% | +2.6% | 60% |
| sok | hayır | 5 | -5.1% | +2.0% | +8.3% | +11.1% | 100% |
| tarife | hayır | 5 | +1.5% | -0.1% | +0.5% | -3.8% | 20% |
| derecelendirme | hayır | 4 | +1.1% | -0.3% | -1.9% | -1.0% | 25% |
| dusus | hayır | 3 | -0.8% | +0.6% | +2.0% | +5.6% | 67% |
| yukselis | hayır | 3 | +4.2% | -1.0% | -1.2% | -2.5% | 33% |
| butce_vergi | hayır | 2 | -1.2% | -1.0% | -1.6% | -0.8% | 50% |
| kur | hayır | 2 | -1.2% | +0.3% | -0.3% | -0.6% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 225 deneme. Al-tut Sharpe: eğitim 0.72, test 0.05.
Eğitimde seçilen kural: **beta_60g < 1.052 ise nakde geç** (kantil 0.8). Eğitim Sharpe 1.97 → test Sharpe 0.69; testte nakitte kalma oranı 83%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.7%, test -1.7%.
Deflated Sharpe (deneme sayısı 225): 0.11 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.2 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 1.4 |
| haftanin_gunu | 4.0 | 143 | +0.3% | 2.0 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.9 |
| ay_donusu | 1.0 | 192 | +0.0% | 0.0 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.7 |
| bayram_oncesi | 1.0 | 5 | +0.1% | 0.4 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.3 |
| bilanco_sezonu | 0.0 | 422 | +0.0% | 0.2 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.8 |

## Son durum (en yeni satır)

getiri_1g=0.0226, getiri_5g=0.17, getiri_20g=0.0626, getiri_60g=-0.000818, getiri_120g=0.02, mom_12_1=-0.0307, zirve_52h_yakinlik=0.876, zirveden_dusus=-0.124, oynaklik_20g=0.522, oynaklik_60g=0.393, atr_20g_oran=0.0314, rsi_14=63.5, ma20_uzaklik=0.125, ma50_uzaklik=0.0743, ma200_uzaklik=0.00525, hacim_z_20=0.56, amihud_20g=0.00261, devir_hizi_20g=0.0431, gece_ort_20g=-0.000103, gunici_ort_20g=0.00303, aof_1g_sapma=0.0107, max_gunluk_20g=0.0942, min_gunluk_20g=-0.0396, ivol_60g=0.254, endekse_gore_1g=0.00642, endekse_gore_20g=0.112, endekse_gore_60g=0.175, beta_60g=1.06, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0461, piyasa_degeri_mn=4.22e+05, halka_aciklik=0.491, fk=2.99, kazanc_verimi=0.334, pd_dd=0.414, fd_favok=5.82, snak_verimi=0.00792, temettu_verimi=0, roe_ttm=0.138, net_kar_marji=0.0274, kar_buyume_yillik=-0.666, satis_buyume_yillik=0.414, net_borc_ozkaynak=0.819, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1