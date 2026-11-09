# Hisse dosyası analizi — HALKB

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 186 (31 bağımsız bölüm); ≥%10 yükseliş 309 gün (40 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +2251.0% (t=6.8), gün içi (açılış→kapanış) toplam -84.8% (t=-2.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.128 | 0.036 | +0.79 |
| piyasa_degeri_mn | 2.68e+05 | 1.44e+05 | +0.79 |
| mom_12_1 | 0.744 | 0.581 | +0.53 |
| getiri_120g | 0.34 | 0.243 | +0.47 |
| ma200_uzaklik | 0.245 | 0.144 | +0.46 |
| zirveden_dusus | -0.0835 | -0.113 | +0.32 |
| zirve_52h_yakinlik | 0.917 | 0.887 | +0.32 |
| ivol_60g | 0.391 | 0.333 | +0.25 |
| getiri_5g | 0.0155 | 0.00225 | +0.23 |
| dolar_getiri_60g | 0.118 | 0.0295 | +0.22 |
| getiri_60g | 0.169 | 0.0793 | +0.21 |
| ma50_uzaklik | 0.0525 | 0.0326 | +0.21 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| rsi_14 | 50.8 | 54.9 | -0.31 |
| ma200_uzaklik | 0.135 | 0.206 | -0.30 |
| endekse_gore_20g | 0.00664 | 0.027 | -0.28 |
| zirveden_dusus | -0.108 | -0.1 | -0.27 |
| zirve_52h_yakinlik | 0.892 | 0.9 | -0.26 |
| mom_12_1 | 0.612 | 0.651 | -0.26 |
| getiri_120g | 0.264 | 0.289 | -0.26 |
| xu100_ma200_uzaklik | 0.0583 | 0.0946 | -0.25 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ma200_uzaklik | 493 | 493 |  | -0.30 | 0.000 | +11.7% | +2.1% | 17% | 26% | -0.179–0.0538 | 0.378–0.709 |
| dolar_getiri_60g | 633 | 633 |  | -0.23 | 0.000 | +10.0% | +0.5% | 25% | 32% | -0.31–-0.0951 | 0.257–0.717 |
| getiri_60g | 633 | 632 |  | -0.22 | 0.000 | +10.1% | +0.3% | 24% | 33% | -0.283–-0.0581 | 0.307–0.772 |
| zirveden_dusus | 573 | 475 |  | -0.23 | 0.000 | +10.4% | -2.1% | 25% | 45% | -0.355–-0.193 | -0.0403–0 |
| zirve_52h_yakinlik | 573 | 513 |  | -0.23 | 0.000 | +10.4% | -2.1% | 25% | 45% | 0.645–0.807 | 0.96–1.11 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.21 | 0.000 | +7.0% | -4.9% | 6% | 58% | 8.33e+04–1.17e+05 | 2.82e+05–3.9e+05 |
| rsi_14 | 678 | 664 |  | -0.21 | 0.000 | +10.2% | -0.4% | 22% | 32% | 23.9–43.3 | 63.3–87.7 |
| ma50_uzaklik | 643 | 643 |  | -0.21 | 0.000 | +9.8% | +1.0% | 22% | 29% | -0.226–-0.045 | 0.16–0.459 |
| devir_hizi_20g | 673 | 669 |  | -0.20 | 0.000 | +7.4% | +3.4% | 20% | 17% | 0.0344–0.0564 | 0.1–0.197 |
| endekse_gore_20g | 673 | 672 |  | -0.19 | 0.000 | +8.3% | -0.4% | 33% | 28% | -0.263–-0.0587 | 0.0935–0.54 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.22 | 0.000 | +6.6% | -0.6% | 8% | 58% | -0.118–-0.0163 | 0.144–0.312 |
| getiri_20g | 673 | 672 |  | -0.18 | 0.000 | +8.5% | +0.6% | 27% | 29% | -0.289–-0.0651 | 0.141–0.567 |
| endekse_gore_60g | 633 | 632 |  | -0.18 | 0.000 | +12.2% | +2.5% | 17% | 24% | -0.26–-0.0488 | 0.207–0.636 |
| getiri_120g | 573 | 572 |  | -0.19 | 0.000 | +9.3% | -1.1% | 23% | 43% | -0.326–0.0549 | 0.463–1.08 |
| gece_ort_20g | 672 | 647 |  | -0.16 | 0.001 | +8.9% | +0.9% | 24% | 28% | -0.00375–0.00193 | 0.00696–0.0256 |
| ma20_uzaklik | 673 | 673 |  | -0.15 | 0.004 | +4.9% | +0.4% | 30% | 34% | -0.167–-0.0395 | 0.0797–0.45 |
| mom_12_1 | 441 | 441 |  | -0.18 | 0.007 | +10.4% | -0.3% | 3% | 40% | 0.0386–0.3 | 0.954–1.74 |
| halka_aciklik | 692 | 13 | seviye | +0.14 | 0.012 | +3.1% | +7.5% | 50% | 17% | 0.0597–0.0845 | 0.085–0.0876 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| borclanma | evet | 4 | -0.7% | -0.1% | -1.2% | +1.0% | 50% |
| haber | evet | 2 | +3.9% | -0.8% | -4.9% | -12.7% | 0% |
| faiz | hayır | 41 | +0.2% | -0.0% | +1.1% | +5.3% | 71% |
| siyasi | hayır | 17 | +1.1% | +0.4% | +4.5% | +6.7% | 65% |
| derecelendirme | hayır | 15 | -0.2% | +0.9% | -0.0% | +0.2% | 47% |
| jeopolitik | hayır | 10 | +0.6% | -0.1% | -1.4% | -4.9% | 40% |
| enflasyon | hayır | 9 | +2.3% | -0.1% | -0.7% | +3.8% | 33% |
| regulasyon | hayır | 6 | -0.5% | +0.1% | +0.9% | +0.5% | 33% |
| haber | hayır | 5 | +1.4% | +0.4% | +1.9% | +8.3% | 60% |
| kuresel_faiz | hayır | 5 | -1.5% | +0.3% | +1.2% | +5.6% | 80% |
| sok | hayır | 5 | -2.2% | +2.8% | +3.1% | +3.3% | 60% |
| tarife | hayır | 5 | +2.1% | +0.8% | +0.2% | -3.7% | 20% |
| kur | hayır | 4 | -0.5% | -3.2% | -2.6% | -9.9% | 25% |
| dusus | hayır | 3 | -0.1% | +4.5% | +5.2% | +2.1% | 67% |
| yukselis | hayır | 3 | +2.5% | +3.4% | +1.3% | -2.3% | 67% |
| butce_vergi | hayır | 2 | -0.9% | +1.7% | +1.2% | +9.1% | 100% |
| YÖN: notr | evet | 2 | - | +0.7% | -2.7% | -5.8% | nan% |
| YÖN: olumlu | evet | 5 | - | -0.5% | -2.9% | -2.9% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 211 deneme. Al-tut Sharpe: eğitim 1.30, test 1.03.
Eğitimde seçilen kural: **rsi_14 > 58.83 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.95 → test Sharpe 1.29; testte nakitte kalma oranı 34%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.4%, test +0.7%.
Deflated Sharpe (deneme sayısı 211): 0.29 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.1 |
| haftanin_gunu | 1.0 | 142 | +0.4% | 1.6 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.4 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.0 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.2 |
| ay_donusu | 0.0 | 521 | +0.3% | 2.0 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 2.0 |
| bayram_oncesi | 1.0 | 5 | -0.3% | -0.4 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.9 |
| bayram_sonrasi | 1.0 | 6 | +0.6% | 0.4 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.6 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.2 |

## Son durum (en yeni satır)

getiri_1g=0.0528, getiri_5g=0.0663, getiri_20g=-0.02, getiri_60g=0.259, getiri_120g=0.0647, mom_12_1=0.544, zirve_52h_yakinlik=0.793, zirveden_dusus=-0.207, oynaklik_20g=0.5, oynaklik_60g=0.663, atr_20g_oran=0.0435, rsi_14=43.8, ma20_uzaklik=0.018, ma50_uzaklik=-0.0386, ma200_uzaklik=0.0194, hacim_z_20=0.669, amihud_20g=0.037, devir_hizi_20g=0.0331, gece_ort_20g=-0.00389, gunici_ort_20g=0.00107, aof_1g_sapma=0.0102, max_gunluk_20g=0.0582, min_gunluk_20g=-0.0848, ivol_60g=0.62, endekse_gore_1g=0.03, endekse_gore_20g=0.023, endekse_gore_60g=0.43, beta_60g=0.799, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.202, piyasa_degeri_mn=3.1e+05, halka_aciklik=0.0586, temettu_verimi=0, olay_sayi_5g=2, olay_yon_5g=0