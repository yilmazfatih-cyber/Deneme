# Hisse dosyası analizi — KRDMD

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 194 (30 bağımsız bölüm); ≥%10 yükseliş 263 gün (38 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +562.9% (t=5.3), gün içi (açılış→kapanış) toplam -76.7% (t=-2.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| endekse_gore_60g | 0.0767 | -0.025 | +0.78 |
| zirveden_dusus | -0.117 | -0.187 | +0.67 |
| zirve_52h_yakinlik | 0.883 | 0.813 | +0.67 |
| usdtry_getiri_20g | 0.0152 | 0.013 | +0.61 |
| kar_buyume_yillik | -1 | -1 | +0.61 |
| mom_12_1 | 0.206 | 0.0505 | +0.60 |
| getiri_60g | 0.102 | 0.0422 | +0.53 |
| dolar_getiri_60g | 0.0705 | 0.00515 | +0.51 |
| amihud_20g | 0.0147 | 0.018 | -0.48 |
| ma200_uzaklik | 0.109 | 0.028 | +0.42 |
| pd_dd | 0.564 | 0.52 | +0.40 |
| fk | 11.9 | 18.5 | -0.40 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| amihud_20g | 0.0193 | 0.0149 | +0.79 |
| endekse_gore_60g | -0.045 | 0.0236 | -0.61 |
| kar_buyume_yillik | -5.43 | -1 | -0.59 |
| getiri_60g | 0.0307 | 0.0976 | -0.48 |
| dolar_getiri_60g | -0.0198 | 0.0573 | -0.48 |
| zirveden_dusus | -0.197 | -0.151 | -0.46 |
| zirve_52h_yakinlik | 0.803 | 0.849 | -0.45 |
| mom_12_1 | 0.00368 | 0.126 | -0.43 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| endekse_gore_60g | 633 | 632 |  | -0.42 | 0.000 | +10.9% | -1.7% | 2% | 33% | -0.319–-0.105 | 0.136–0.384 |
| amihud_20g | 672 | 660 |  | +0.40 | 0.000 | -3.1% | +9.7% | 34% | 13% | 0.00696–0.0119 | 0.0211–0.035 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.32 | 0.000 | +7.7% | +0.1% | 12% | 29% | 1.64e+04–1.96e+04 | 2.51e+04–3.71e+04 |
| mom_12_1 | 441 | 440 |  | -0.36 | 0.000 | +8.5% | -1.1% | 4% | 32% | -0.339–-0.0757 | 0.467–1.06 |
| getiri_60g | 633 | 629 |  | -0.29 | 0.000 | +6.1% | -1.5% | 10% | 34% | -0.356–-0.0846 | 0.215–0.492 |
| dolar_getiri_60g | 633 | 632 |  | -0.29 | 0.000 | +6.0% | -1.5% | 11% | 34% | -0.403–-0.136 | 0.177–0.475 |
| zirveden_dusus | 573 | 451 |  | -0.30 | 0.000 | +5.8% | -3.4% | 8% | 38% | -0.356–-0.242 | -0.072–0 |
| zirve_52h_yakinlik | 573 | 474 |  | -0.30 | 0.000 | +5.8% | -3.4% | 8% | 38% | 0.644–0.758 | 0.928–1.09 |
| pd_dd | 692 | 634 |  | -0.26 | 0.000 | +7.2% | -4.8% | 10% | 50% | 0.313–0.47 | 0.673–2.89 |
| ma50_uzaklik | 643 | 643 |  | -0.20 | 0.000 | +4.3% | -0.9% | 24% | 28% | -0.219–-0.0625 | 0.106–0.335 |
| getiri_120g | 573 | 573 |  | -0.20 | 0.000 | +4.9% | +1.9% | 15% | 21% | -0.273–-0.0811 | 0.303–0.838 |
| ma200_uzaklik | 493 | 493 |  | -0.21 | 0.000 | +4.6% | +1.5% | 10% | 21% | -0.173–-0.041 | 0.251–0.542 |
| devir_hizi_20g | 673 | 670 |  | -0.18 | 0.000 | +2.5% | -3.0% | 30% | 39% | 0.0364–0.0533 | 0.0767–0.107 |
| usdtry_getiri_20g | 672 | 664 |  | -0.17 | 0.001 | +3.0% | -2.1% | 18% | 51% | -0.013–0.00947 | 0.019–0.0482 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.13 | 0.025 | +4.1% | +3.9% | 20% | 31% | -0.103–-0.0775 | 0.245–0.272 |
| beta_60g | 632 | 631 |  | +0.14 | 0.031 | +1.4% | +4.5% | 24% | 15% | 0.714–0.982 | 1.36–1.76 |
| bilancodan_gun | 693 | 294 | seviye | -0.13 | 0.042 | +2.4% | -2.0% | 23% | 42% | 0.917–19 | 77–113 |
| rsi_14 | 678 | 668 |  | -0.12 | 0.052 | +3.4% | -0.2% | 25% | 29% | 16.9–41.5 | 62.1–83.7 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bilanco | evet | 2 | -0.4% | +0.5% | -2.6% | +3.9% | 50% |
| faiz | hayır | 41 | +0.4% | -0.2% | +1.1% | -0.4% | 39% |
| siyasi | hayır | 17 | -0.6% | +0.1% | +1.4% | -1.7% | 41% |
| derecelendirme | hayır | 15 | +0.2% | -0.5% | -0.9% | +3.8% | 67% |
| jeopolitik | hayır | 10 | -0.7% | -0.7% | -0.9% | +2.3% | 60% |
| enflasyon | hayır | 9 | +0.9% | -2.3% | +0.0% | -0.6% | 33% |
| regulasyon | hayır | 6 | +0.4% | -0.6% | +0.5% | +0.6% | 67% |
| sok | hayır | 6 | -4.7% | +1.2% | +5.3% | +5.6% | 83% |
| haber | hayır | 5 | +3.4% | +1.4% | -1.3% | -1.5% | 20% |
| kuresel_faiz | hayır | 5 | +1.5% | +2.9% | +4.0% | +3.2% | 40% |
| tarife | hayır | 5 | +0.6% | +0.7% | +0.1% | -2.5% | 20% |
| kur | hayır | 4 | -0.2% | +0.4% | +0.0% | +2.5% | 50% |
| dusus | hayır | 3 | -1.4% | +0.4% | -3.1% | -4.8% | 33% |
| yukselis | hayır | 3 | +4.1% | +0.8% | +0.7% | +1.9% | 67% |
| butce_vergi | hayır | 2 | -1.3% | -0.3% | -4.9% | -8.7% | 0% |
| YÖN: olumlu | evet | 3 | - | +0.5% | -2.6% | +3.9% | nan% |
| YÖN: olumsuz | evet | 2 | - | -3.8% | -4.7% | -10.2% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 221 deneme. Al-tut Sharpe: eğitim 0.44, test 0.67.
Eğitimde seçilen kural: **usdtry_getiri_20g > 0.01111 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.75 → test Sharpe -0.5; testte nakitte kalma oranı 66%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.3%, test +3.0%.
Deflated Sharpe (deneme sayısı 221): 0.01 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.3 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.3 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.4 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.0 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.4 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.7 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.5 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_oncesi | 1.0 | 5 | -0.4% | -0.5 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | +1.1% | 1.5 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.9 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0332, getiri_5g=-0.0153, getiri_20g=-0.134, getiri_60g=-0.0989, getiri_120g=-0.11, mom_12_1=0.538, zirve_52h_yakinlik=0.786, zirveden_dusus=-0.214, oynaklik_20g=0.636, oynaklik_60g=0.555, atr_20g_oran=0.0501, rsi_14=37.8, ma20_uzaklik=-0.0661, ma50_uzaklik=-0.131, ma200_uzaklik=-0.0238, hacim_z_20=1.49, amihud_20g=0.0273, devir_hizi_20g=0.0407, gece_ort_20g=-0.00894, gunici_ort_20g=0.00102, aof_1g_sapma=0.00372, max_gunluk_20g=0.0675, min_gunluk_20g=-0.0996, ivol_60g=0.44, endekse_gore_1g=0.0105, endekse_gore_20g=-0.0915, endekse_gore_60g=0.072, beta_60g=1.2, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.14, piyasa_degeri_mn=2.91e+04, halka_aciklik=0.919, fk=10.1, kazanc_verimi=0.0992, pd_dd=0.393, fd_favok=5.59, snak_verimi=0.198, temettu_verimi=0, roe_ttm=0.039, net_kar_marji=0.272, kar_buyume_yillik=2.71, satis_buyume_yillik=0.0602, net_borc_ozkaynak=0.00666, bilancodan_gun=99.9, olay_sayi_5g=2, olay_yon_5g=0