# Hisse dosyası analizi — YKBNK

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 215 (26 bağımsız bölüm); ≥%10 yükseliş 230 gün (27 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +303.1% (t=3.8), gün içi (açılış→kapanış) toplam -51.3% (t=-0.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.127 | 0.0375 | +0.90 |
| getiri_120g | 0.133 | -0.0129 | +0.71 |
| ma200_uzaklik | 0.0964 | -0.00639 | +0.69 |
| piyasa_degeri_mn | 2.83e+05 | 2.64e+05 | +0.65 |
| zirveden_dusus | -0.148 | -0.198 | +0.50 |
| zirve_52h_yakinlik | 0.852 | 0.802 | +0.49 |
| mom_12_1 | 0.256 | 0.13 | +0.49 |
| xu100_getiri_20g | 0.0308 | 0.00113 | +0.46 |
| rsi_14 | 55.7 | 51.3 | +0.35 |
| oynaklik_60g | 0.419 | 0.439 | -0.34 |
| gunici_ort_20g | -0.000152 | -0.00173 | +0.31 |
| ivol_60g | 0.269 | 0.272 | -0.31 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | -0.0322 | 0.0771 | -0.87 |
| piyasa_degeri_mn | 2.42e+05 | 2.8e+05 | -0.84 |
| zirve_52h_yakinlik | 0.767 | 0.843 | -0.81 |
| zirveden_dusus | -0.233 | -0.157 | -0.81 |
| getiri_120g | -0.0552 | 0.102 | -0.68 |
| dolar_getiri_60g | -0.108 | 0.0206 | -0.58 |
| rsi_14 | 47 | 55.4 | -0.56 |
| getiri_60g | -0.0828 | 0.0578 | -0.54 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 631 |  | -0.33 | 0.000 | +8.9% | -1.1% | 17% | 33% | -0.331–-0.115 | 0.242–0.595 |
| zirveden_dusus | 573 | 474 |  | -0.36 | 0.000 | +8.8% | -2.8% | 14% | 41% | -0.414–-0.246 | -0.0453–0 |
| zirve_52h_yakinlik | 573 | 487 |  | -0.36 | 0.000 | +8.8% | -2.8% | 14% | 41% | 0.586–0.754 | 0.955–1.04 |
| getiri_120g | 573 | 572 |  | -0.40 | 0.000 | +8.6% | -3.0% | 12% | 50% | -0.277–-0.086 | 0.252–0.718 |
| ma200_uzaklik | 493 | 493 |  | -0.44 | 0.000 | +10.7% | -3.0% | 5% | 34% | -0.234–-0.0537 | 0.163–0.312 |
| dolar_getiri_60g | 633 | 633 |  | -0.33 | 0.000 | +9.1% | -1.2% | 16% | 33% | -0.375–-0.161 | 0.198–0.535 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.40 | 0.000 | +10.4% | -4.0% | 17% | 56% | 1.71e+05–2.29e+05 | 3.02e+05–3.72e+05 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.34 | 0.000 | +9.2% | -3.3% | 7% | 60% | -0.118–-0.0163 | 0.144–0.312 |
| rsi_14 | 678 | 670 |  | -0.28 | 0.000 | +8.2% | -3.0% | 14% | 39% | 23.9–40.1 | 62.1–79.5 |
| xu100_getiri_20g | 673 | 671 |  | -0.23 | 0.000 | +6.2% | -1.6% | 14% | 41% | -0.166–-0.0409 | 0.0783–0.222 |
| ma20_uzaklik | 673 | 671 |  | -0.23 | 0.000 | +7.4% | -1.9% | 20% | 36% | -0.223–-0.0586 | 0.0694–0.212 |
| getiri_20g | 673 | 670 |  | -0.22 | 0.000 | +7.4% | -0.6% | 19% | 35% | -0.309–-0.0763 | 0.117–0.454 |
| ma50_uzaklik | 643 | 643 |  | -0.22 | 0.000 | +8.4% | +0.6% | 12% | 22% | -0.217–-0.0737 | 0.108–0.345 |
| endekse_gore_60g | 633 | 633 |  | -0.21 | 0.000 | +4.7% | +0.3% | 31% | 22% | -0.255–-0.1 | 0.114–0.41 |
| gunici_ort_20g | 673 | 659 |  | -0.18 | 0.000 | +6.7% | -1.2% | 17% | 40% | -0.0138–-0.00465 | 0.00235–0.0132 |
| mom_12_1 | 441 | 441 |  | -0.21 | 0.000 | +8.2% | +1.1% | 11% | 40% | -0.384–0.0218 | 0.368–0.811 |
| max_gunluk_20g | 672 | 63 |  | -0.17 | 0.001 | +4.0% | -2.2% | 32% | 32% | 0.00668–0.0451 | 0.0764–0.106 |
| oynaklik_60g | 632 | 628 |  | +0.17 | 0.001 | -2.3% | +2.2% | 50% | 28% | 0.294–0.387 | 0.485–0.535 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.6% | +0.4% | +1.1% | -0.5% | 41% |
| siyasi | hayır | 17 | -0.1% | -0.5% | +1.6% | +1.7% | 47% |
| derecelendirme | hayır | 15 | -0.7% | -0.5% | +0.7% | +4.1% | 60% |
| haber | hayır | 10 | +1.2% | -1.2% | -0.3% | +2.5% | 60% |
| jeopolitik | hayır | 10 | -1.0% | -0.4% | -2.1% | -1.9% | 40% |
| enflasyon | hayır | 9 | +1.0% | -0.4% | +0.0% | +1.5% | 44% |
| regulasyon | hayır | 6 | -1.0% | +0.4% | -2.4% | -5.7% | 17% |
| kuresel_faiz | hayır | 5 | +1.8% | +1.7% | +3.5% | +0.2% | 20% |
| sok | hayır | 5 | -7.2% | +0.0% | +6.8% | +10.4% | 80% |
| tarife | hayır | 5 | +1.3% | +0.7% | +1.7% | +0.2% | 60% |
| kur | hayır | 4 | -0.4% | -2.1% | -2.4% | -0.0% | 50% |
| dusus | hayır | 3 | -1.6% | -2.9% | -1.4% | +0.4% | 67% |
| yukselis | hayır | 3 | +4.6% | -1.8% | -2.1% | -4.7% | 33% |
| butce_vergi | hayır | 2 | -0.8% | +0.6% | +2.4% | +2.3% | 50% |
| YÖN: olumlu | evet | 1 | - | -0.3% | -6.9% | +3.5% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 191 deneme. Al-tut Sharpe: eğitim 0.97, test 0.45.
Eğitimde seçilen kural: **getiri_120g > -0.07962 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.05 → test Sharpe 1.52; testte nakitte kalma oranı 86%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.6%, test +0.4%.
Deflated Sharpe (deneme sayısı 191): 0.39 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.4% | 1.6 |
| haftanin_gunu | 1.0 | 142 | +0.2% | 1.0 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.2 |
| haftanin_gunu | 3.0 | 143 | +0.1% | 0.4 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.0 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.7 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.3 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.4 |
| bayram_oncesi | 1.0 | 5 | -1.1% | -4.5 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.1 |
| bayram_sonrasi | 1.0 | 6 | +1.7% | 2.4 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.0 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.8 |

## Son durum (en yeni satır)

getiri_1g=0.0436, getiri_5g=0.0856, getiri_20g=0.0942, getiri_60g=0.0967, getiri_120g=0.0526, mom_12_1=0.0349, zirve_52h_yakinlik=0.881, zirveden_dusus=-0.119, oynaklik_20g=0.346, oynaklik_60g=0.424, atr_20g_oran=0.0325, rsi_14=57.7, ma20_uzaklik=0.0861, ma50_uzaklik=0.0825, ma200_uzaklik=0.0562, hacim_z_20=0.775, amihud_20g=0.00361, devir_hizi_20g=0.0514, gece_ort_20g=-0.0043, gunici_ort_20g=0.00676, aof_1g_sapma=0.00994, max_gunluk_20g=0.0463, min_gunluk_20g=-0.0341, ivol_60g=0.314, endekse_gore_1g=0.0208, endekse_gore_20g=0.137, endekse_gore_60g=0.268, beta_60g=1, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.047, piyasa_degeri_mn=3.28e+05, halka_aciklik=0.385, temettu_verimi=0, olay_sayi_5g=2, olay_yon_5g=0