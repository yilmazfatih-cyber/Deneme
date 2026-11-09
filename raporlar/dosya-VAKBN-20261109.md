# Hisse dosyası analizi — VAKBN

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 169 (30 bağımsız bölüm); ≥%10 yükseliş 280 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +458.7% (t=5.0), gün içi (açılış→kapanış) toplam -53.4% (t=-0.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.405 | 0.235 | +0.78 |
| getiri_120g | 0.237 | 0.0891 | +0.73 |
| oynaklik_20g | 0.46 | 0.368 | +0.69 |
| max_gunluk_20g | 0.0678 | 0.0484 | +0.60 |
| piyasa_degeri_mn | 2.71e+05 | 2.42e+05 | +0.58 |
| min_gunluk_20g | -0.0519 | -0.0404 | -0.53 |
| ma200_uzaklik | 0.101 | 0.0799 | +0.47 |
| dolar_getiri_60g | 0.051 | -0.00997 | +0.47 |
| endekse_gore_60g | 0.108 | -0.00104 | +0.45 |
| getiri_60g | 0.102 | 0.0323 | +0.45 |
| zirveden_dusus | -0.126 | -0.166 | +0.34 |
| zirve_52h_yakinlik | 0.874 | 0.834 | +0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.2 | 0.343 | -0.57 |
| ma200_uzaklik | 0.0352 | 0.119 | -0.54 |
| dolar_getiri_60g | -0.0541 | 0.0535 | -0.51 |
| getiri_60g | -0.011 | 0.0943 | -0.50 |
| zirveden_dusus | -0.173 | -0.113 | -0.47 |
| zirve_52h_yakinlik | 0.827 | 0.887 | -0.47 |
| getiri_120g | 0.0894 | 0.141 | -0.43 |
| piyasa_degeri_mn | 2.34e+05 | 2.66e+05 | -0.43 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 632 |  | -0.34 | 0.000 | +10.4% | -0.2% | 6% | 30% | -0.29–-0.0891 | 0.288–0.864 |
| mom_12_1 | 441 | 441 |  | -0.40 | 0.000 | +7.9% | -3.2% | 1% | 41% | -0.0996–0.106 | 0.541–0.991 |
| dolar_getiri_60g | 633 | 633 |  | -0.34 | 0.000 | +9.9% | -0.3% | 4% | 30% | -0.318–-0.129 | 0.23–0.836 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.32 | 0.000 | +11.9% | -2.5% | 6% | 41% | 1.29e+05–2.09e+05 | 3.13e+05–4.17e+05 |
| getiri_120g | 573 | 572 |  | -0.32 | 0.000 | +5.3% | -5.3% | 9% | 49% | -0.287–0.0173 | 0.323–0.749 |
| ma200_uzaklik | 493 | 493 |  | -0.33 | 0.000 | +9.2% | -2.5% | 6% | 31% | -0.135–0.000768 | 0.188–0.49 |
| zirveden_dusus | 573 | 463 |  | -0.28 | 0.000 | +7.4% | -3.3% | 4% | 28% | -0.313–-0.229 | -0.0443–0 |
| zirve_52h_yakinlik | 573 | 498 |  | -0.28 | 0.000 | +7.4% | -3.3% | 4% | 28% | 0.687–0.771 | 0.956–1.09 |
| endekse_gore_60g | 633 | 633 |  | -0.23 | 0.000 | +6.2% | -0.7% | 20% | 35% | -0.265–-0.0851 | 0.187–0.658 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.24 | 0.000 | +4.5% | -1.5% | 27% | 41% | -0.118–-0.0163 | 0.144–0.312 |
| oynaklik_20g | 672 | 671 |  | -0.19 | 0.000 | +5.4% | -1.9% | 8% | 44% | 0.173–0.309 | 0.485–0.821 |
| max_gunluk_20g | 672 | 62 |  | -0.16 | 0.001 | +4.7% | -1.4% | 8% | 39% | 0.0116–0.0394 | 0.0784–0.1 |
| gunici_ort_20g | 673 | 656 |  | -0.15 | 0.004 | +8.4% | +1.8% | 9% | 25% | -0.0128–-0.00464 | 0.00232–0.0134 |
| xu100_getiri_20g | 673 | 671 |  | -0.15 | 0.004 | +4.8% | +1.3% | 27% | 21% | -0.166–-0.0409 | 0.0783–0.222 |
| ma50_uzaklik | 643 | 643 |  | -0.14 | 0.009 | +7.1% | +2.5% | 20% | 25% | -0.192–-0.0565 | 0.128–0.386 |
| rsi_14 | 678 | 674 |  | -0.13 | 0.020 | +5.9% | +1.2% | 19% | 18% | 26.6–42 | 65–83.2 |
| beta_60g | 632 | 632 |  | -0.13 | 0.054 | +5.5% | +2.8% | 28% | 40% | 0.246–0.964 | 1.26–1.6 |
| ivol_60g | 573 | 570 |  | +0.12 | 0.102 | +0.5% | +0.7% | 30% | 36% | 0.205–0.257 | 0.343–0.44 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.3% | -0.4% | +0.1% | +1.5% | 49% |
| siyasi | hayır | 17 | +0.7% | -0.5% | +1.9% | -0.5% | 41% |
| derecelendirme | hayır | 15 | -0.9% | -0.5% | +0.7% | +3.9% | 53% |
| jeopolitik | hayır | 10 | -0.0% | -0.5% | -2.0% | -4.3% | 40% |
| enflasyon | hayır | 9 | +1.2% | +0.5% | +0.5% | +2.8% | 56% |
| regulasyon | hayır | 6 | -0.0% | +0.4% | -1.0% | -0.7% | 33% |
| haber | hayır | 5 | +1.1% | +1.5% | +3.3% | +5.4% | 40% |
| kuresel_faiz | hayır | 5 | +0.5% | +0.5% | +4.4% | +3.9% | 60% |
| sok | hayır | 5 | -7.9% | -0.9% | +6.0% | +10.0% | 80% |
| tarife | hayır | 5 | +0.6% | -0.4% | -1.2% | -1.9% | 60% |
| kur | hayır | 4 | -0.8% | -1.1% | -1.7% | -4.9% | 25% |
| dusus | hayır | 3 | -2.2% | +0.7% | +0.6% | -3.4% | 67% |
| yukselis | hayır | 3 | +2.8% | +0.3% | -2.3% | -4.9% | 67% |
| butce_vergi | hayır | 2 | +0.1% | -1.6% | -0.3% | +5.1% | 50% |
| YÖN: notr | evet | 1 | - | -3.4% | -8.0% | -18.9% | nan% |
| YÖN: olumlu | evet | 3 | - | -0.8% | +2.5% | +1.0% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 212 deneme. Al-tut Sharpe: eğitim 1.27, test 0.64.
Eğitimde seçilen kural: **getiri_1g < -0.009323 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.68 → test Sharpe 1.4; testte nakitte kalma oranı 33%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +3.1%, test +1.8%.
Deflated Sharpe (deneme sayısı 212): 0.39 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.7 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.6 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -0.7 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.1 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 521 | +0.2% | 2.1 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.1 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.8 |
| bayram_oncesi | 1.0 | 5 | -1.7% | -2.1 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.6 |
| bayram_sonrasi | 1.0 | 6 | +0.9% | 0.8 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.4 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 1.0 |

## Son durum (en yeni satır)

getiri_1g=0.0236, getiri_5g=0.141, getiri_20g=-0.00295, getiri_60g=0.0995, getiri_120g=0.0967, mom_12_1=0.306, zirve_52h_yakinlik=0.804, zirveden_dusus=-0.196, oynaklik_20g=0.434, oynaklik_60g=0.559, atr_20g_oran=0.0377, rsi_14=55.7, ma20_uzaklik=0.0577, ma50_uzaklik=0.0214, ma200_uzaklik=0.017, hacim_z_20=1.57, amihud_20g=0.0236, devir_hizi_20g=0.0469, gece_ort_20g=-0.00391, gunici_ort_20g=0.00344, aof_1g_sapma=0.0242, max_gunluk_20g=0.0605, min_gunluk_20g=-0.0523, ivol_60g=0.392, endekse_gore_1g=0.000892, endekse_gore_20g=0.04, endekse_gore_60g=0.271, beta_60g=1.4, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.0497, piyasa_degeri_mn=3.35e+05, halka_aciklik=0.0539, temettu_verimi=0, olay_sayi_5g=2, olay_yon_5g=0