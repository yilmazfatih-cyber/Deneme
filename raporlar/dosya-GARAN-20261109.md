# Hisse dosyası analizi — GARAN

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 140 (25 bağımsız bölüm); ≥%10 yükseliş 224 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +371.8% (t=4.5), gün içi (açılış→kapanış) toplam -45.4% (t=-0.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.125 | 0.0575 | +0.77 |
| zirve_52h_yakinlik | 0.93 | 0.843 | +0.71 |
| zirveden_dusus | -0.0698 | -0.157 | +0.71 |
| getiri_120g | 0.177 | 0.0385 | +0.68 |
| piyasa_degeri_mn | 5.88e+05 | 5.43e+05 | +0.64 |
| mom_12_1 | 0.244 | 0.102 | +0.59 |
| ma200_uzaklik | 0.121 | 0.0014 | +0.56 |
| gunici_ort_20g | 0.000747 | -0.00136 | +0.43 |
| oynaklik_20g | 0.397 | 0.366 | +0.37 |
| xu100_getiri_20g | 0.0292 | 0.00884 | +0.34 |
| max_gunluk_20g | 0.0599 | 0.0488 | +0.34 |
| amihud_20g | 0.00634 | 0.00691 | -0.34 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 4.98e+05 | 5.75e+05 | -0.90 |
| amihud_20g | 0.0082 | 0.0063 | +0.90 |
| zirveden_dusus | -0.185 | -0.0978 | -0.76 |
| zirve_52h_yakinlik | 0.815 | 0.902 | -0.76 |
| ma200_uzaklik | -0.0254 | 0.0795 | -0.61 |
| xu100_ma200_uzaklik | -0.00598 | 0.0817 | -0.55 |
| oynaklik_60g | 0.405 | 0.375 | +0.41 |
| aof_1g_sapma | 0.069 | 0.0446 | +0.40 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 452 |  | -0.37 | 0.000 | +6.3% | -5.8% | 0% | 37% | 0.693–0.792 | 0.964–1.07 |
| zirveden_dusus | 573 | 433 |  | -0.37 | 0.000 | +6.3% | -5.8% | 0% | 37% | -0.307–-0.208 | -0.0357–0 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.39 | 0.000 | +7.4% | -3.8% | 15% | 42% | -0.118–-0.0163 | 0.144–0.312 |
| amihud_20g | 672 | 652 |  | +0.34 | 0.000 | +0.5% | +12.2% | 16% | 1% | 0.00276–0.00462 | 0.00863–0.0131 |
| piyasa_degeri_mn | 692 | 687 | seviye | -0.52 | 0.000 | +12.6% | -4.2% | 6% | 37% | 2.68e+05–4.78e+05 | 6.06e+05–7.2e+05 |
| getiri_120g | 573 | 571 |  | -0.24 | 0.000 | +6.3% | -2.9% | 3% | 46% | -0.251–-0.054 | 0.238–1.09 |
| temettu_verimi | 693 | 482 |  | +0.21 | 0.000 | +0.1% | +6.1% | 27% | 2% | 0–0.0247 | 0.0394–0.0686 |
| ma200_uzaklik | 493 | 492 |  | -0.24 | 0.000 | +6.0% | -3.3% | 0% | 29% | -0.168–-0.0632 | 0.167–0.283 |
| mom_12_1 | 441 | 439 |  | -0.21 | 0.000 | +2.5% | -3.3% | 6% | 33% | -0.158–-0.00632 | 0.364–1.3 |
| halka_aciklik | 692 | 7 | seviye | -0.16 | 0.001 | +2.8% | +3.8% | 20% | 0% | 0.134–0.14 | 0.143–0.143 |
| aof_1g_sapma | 692 | 689 |  | +0.15 | 0.004 | -0.3% | +4.4% | 17% | 21% | -0.0376–0.0236 | 0.0828–0.153 |
| atr_20g_oran | 672 | 661 |  | +0.11 | 0.118 | +0.6% | +5.9% | 13% | 24% | 0.0182–0.0261 | 0.0389–0.0552 |
| xu100_getiri_20g | 673 | 671 |  | -0.11 | 0.188 | +2.9% | +0.6% | 16% | 30% | -0.166–-0.0409 | 0.0783–0.222 |
| oynaklik_60g | 632 | 632 |  | +0.11 | 0.214 | -2.7% | +2.8% | 33% | 22% | 0.226–0.332 | 0.431–0.495 |
| olay_sayi_5g | 693 | 8 |  | -0.10 | 0.282 | +3.4% | -0.9% | 19% | 28% | 0–1 | 2–7 |
| dolar_getiri_60g | 633 | 632 |  | -0.10 | 0.307 | +5.8% | +3.2% | 16% | 20% | -0.312–-0.128 | 0.188–0.842 |
| getiri_60g | 633 | 632 |  | -0.10 | 0.320 | +6.2% | +4.2% | 14% | 19% | -0.259–-0.0948 | 0.247–0.877 |
| beta_60g | 632 | 632 |  | -0.10 | 0.626 | +1.9% | -2.0% | 31% | 24% | 0.723–1.04 | 1.29–1.56 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| borclanma | evet | 2 | +0.4% | +0.1% | +5.4% | +4.4% | 100% |
| faiz | hayır | 41 | +0.2% | -0.0% | +0.5% | -1.0% | 41% |
| siyasi | hayır | 17 | +0.5% | -0.6% | +0.6% | -0.7% | 47% |
| derecelendirme | hayır | 15 | -0.4% | -0.4% | +2.0% | +2.8% | 40% |
| haber | hayır | 10 | +0.7% | -0.5% | +1.9% | +1.2% | 50% |
| jeopolitik | hayır | 10 | -2.3% | -0.5% | -1.0% | -2.6% | 30% |
| enflasyon | hayır | 9 | +1.2% | +0.1% | -0.1% | +3.0% | 44% |
| regulasyon | hayır | 6 | -1.3% | +0.8% | +0.9% | +1.6% | 50% |
| kuresel_faiz | hayır | 5 | +1.3% | +1.0% | +3.3% | +1.3% | 40% |
| sok | hayır | 5 | -6.2% | +1.3% | +6.9% | +9.3% | 80% |
| tarife | hayır | 5 | +1.0% | +0.6% | +0.9% | -1.0% | 20% |
| kur | hayır | 4 | -0.0% | -1.1% | -1.5% | -1.3% | 50% |
| dusus | hayır | 3 | -2.0% | -2.0% | +2.4% | -0.1% | 67% |
| yukselis | hayır | 3 | +4.2% | -1.9% | -1.0% | -4.0% | 33% |
| butce_vergi | hayır | 2 | +0.1% | +0.4% | -1.1% | -1.5% | 50% |
| YÖN: notr | evet | 1 | - | +0.7% | +7.9% | +3.6% | nan% |
| YÖN: olumlu | evet | 2 | - | +0.1% | +2.3% | -1.4% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 167 deneme. Al-tut Sharpe: eğitim 1.57, test 0.26.
Eğitimde seçilen kural: **amihud_20g < 0.006862 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.42 → test Sharpe 0.49; testte nakitte kalma oranı 84%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.4%, test +0.6%.
Deflated Sharpe (deneme sayısı 167): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.6 |
| haftanin_gunu | 1.0 | 142 | +0.2% | 0.8 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.5 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 1.2 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.9 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.9 |
| bayram_oncesi | 1.0 | 5 | -0.9% | -0.9 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.6 |
| bayram_sonrasi | 1.0 | 6 | +1.9% | 1.6 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.6 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.9 |

## Son durum (en yeni satır)

getiri_1g=0.0618, getiri_5g=0.183, getiri_20g=0.186, getiri_60g=0.169, getiri_120g=0.177, mom_12_1=-0.062, zirve_52h_yakinlik=0.928, zirveden_dusus=-0.0716, oynaklik_20g=0.373, oynaklik_60g=0.398, atr_20g_oran=0.0286, rsi_14=68.2, ma20_uzaklik=0.164, ma50_uzaklik=0.167, ma200_uzaklik=0.126, hacim_z_20=2.05, amihud_20g=0.00608, devir_hizi_20g=0.0351, gece_ort_20g=-0.00129, gunici_ort_20g=0.00724, aof_1g_sapma=0.0138, max_gunluk_20g=0.0773, min_gunluk_20g=-0.0324, ivol_60g=0.26, endekse_gore_1g=0.0391, endekse_gore_20g=0.229, endekse_gore_60g=0.34, beta_60g=1.07, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.116, piyasa_degeri_mn=6.42e+05, halka_aciklik=0.14, temettu_verimi=0.0344, olay_sayi_5g=2, olay_yon_5g=0