# Hisse dosyası analizi — ALBRK

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 134 (25 bağımsız bölüm); ≥%10 yükseliş 244 gün (29 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +234.6% (t=3.8), gün içi (açılış→kapanış) toplam -32.6% (t=-0.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| rsi_14 | 61.1 | 49.1 | +1.05 |
| getiri_20g | 0.107 | -0.00345 | +0.98 |
| ma20_uzaklik | 0.0524 | -0.00361 | +0.97 |
| ma50_uzaklik | 0.078 | 0.00184 | +0.97 |
| zirveden_dusus | -0.0679 | -0.145 | +0.96 |
| zirve_52h_yakinlik | 0.932 | 0.855 | +0.95 |
| dolar_getiri_60g | 0.103 | -0.0211 | +0.88 |
| getiri_60g | 0.147 | 0.0178 | +0.87 |
| endekse_gore_20g | 0.0477 | -0.00192 | +0.81 |
| gunici_ort_20g | 0.00148 | -0.00118 | +0.76 |
| endekse_gore_60g | 0.135 | -0.00159 | +0.75 |
| ma200_uzaklik | 0.126 | 0.0537 | +0.72 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.66e+04 | 2.03e+04 | -0.76 |
| getiri_120g | 0.0654 | 0.151 | -0.75 |
| amihud_20g | 0.168 | 0.133 | +0.48 |
| xu100_ma200_uzaklik | 0.0182 | 0.0878 | -0.46 |
| mom_12_1 | 0.224 | 0.331 | -0.46 |
| ma200_uzaklik | 0.0497 | 0.0798 | -0.45 |
| zirveden_dusus | -0.142 | -0.12 | -0.39 |
| zirve_52h_yakinlik | 0.858 | 0.88 | -0.38 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 623 |  | -0.34 | 0.000 | +6.1% | -2.2% | 2% | 36% | -0.218–-0.0594 | 0.216–0.546 |
| zirveden_dusus | 573 | 359 |  | -0.37 | 0.000 | +6.9% | -3.2% | 0% | 42% | -0.247–-0.186 | -0.0558–0 |
| zirve_52h_yakinlik | 573 | 383 |  | -0.37 | 0.000 | +6.9% | -3.2% | 0% | 42% | 0.753–0.814 | 0.944–1.07 |
| getiri_120g | 573 | 564 |  | -0.39 | 0.000 | +5.8% | -3.9% | 5% | 30% | -0.195–0.00848 | 0.256–0.641 |
| dolar_getiri_60g | 633 | 632 |  | -0.35 | 0.000 | +6.6% | -1.7% | 2% | 35% | -0.245–-0.102 | 0.17–0.479 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.38 | 0.000 | +8.2% | -1.5% | 9% | 31% | -0.118–-0.0163 | 0.144–0.312 |
| amihud_20g | 672 | 669 |  | +0.32 | 0.000 | -3.9% | +6.1% | 36% | 13% | 0.0712–0.113 | 0.206–0.379 |
| piyasa_degeri_mn | 692 | 685 | seviye | -0.42 | 0.000 | +9.6% | -4.3% | 10% | 39% | 9.85e+03–1.5e+04 | 2.15e+04–2.64e+04 |
| ma200_uzaklik | 493 | 490 |  | -0.35 | 0.000 | +5.4% | -4.9% | 0% | 34% | -0.0761–-0.00297 | 0.165–0.403 |
| rsi_14 | 678 | 653 |  | -0.29 | 0.000 | +5.4% | -2.7% | 1% | 43% | 22.5–41.7 | 63.1–84.6 |
| ma20_uzaklik | 673 | 673 |  | -0.27 | 0.000 | +4.9% | -2.5% | 1% | 43% | -0.171–-0.0427 | 0.0652–0.215 |
| getiri_20g | 673 | 662 |  | -0.26 | 0.000 | +5.0% | -1.7% | 1% | 45% | -0.217–-0.0597 | 0.114–0.376 |
| endekse_gore_60g | 633 | 633 |  | -0.24 | 0.000 | +2.7% | -3.7% | 12% | 41% | -0.183–-0.0893 | 0.153–0.358 |
| gece_ort_20g | 672 | 626 |  | -0.22 | 0.000 | +2.0% | -3.6% | 10% | 40% | -0.0103–0.000151 | 0.00391–0.00841 |
| endekse_gore_20g | 673 | 673 |  | -0.21 | 0.000 | +5.1% | +0.3% | 6% | 34% | -0.163–-0.051 | 0.0695–0.29 |
| ma50_uzaklik | 643 | 643 |  | -0.21 | 0.000 | +5.3% | -0.0% | 1% | 34% | -0.162–-0.0434 | 0.0958–0.365 |
| xu100_getiri_20g | 673 | 671 |  | -0.18 | 0.000 | +3.7% | +0.1% | 6% | 35% | -0.166–-0.0409 | 0.0783–0.222 |
| mom_12_1 | 441 | 437 |  | -0.22 | 0.000 | +3.0% | -2.8% | 13% | 28% | -0.138–0.0967 | 0.53–0.817 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.1% | -0.4% | -0.3% | +0.1% | 43% |
| siyasi | hayır | 9 | -0.1% | -1.6% | -0.6% | -1.0% | 33% |
| enflasyon | hayır | 6 | -0.3% | -0.3% | +1.9% | +3.0% | 50% |
| jeopolitik | hayır | 5 | -3.6% | +0.9% | -1.6% | +2.5% | 40% |
| sok | hayır | 5 | -5.3% | +0.8% | +5.0% | +14.1% | 100% |
| tarife | hayır | 5 | +0.9% | +0.7% | +0.6% | +1.5% | 40% |
| derecelendirme | hayır | 4 | +0.5% | -0.5% | +0.8% | -1.2% | 50% |
| dusus | hayır | 3 | -1.1% | -1.1% | +2.0% | +4.6% | 100% |
| yukselis | hayır | 3 | +5.3% | -1.5% | +1.1% | +2.8% | 67% |
| butce_vergi | hayır | 2 | -0.9% | -0.9% | +0.4% | +5.7% | 50% |
| kur | hayır | 2 | +0.7% | +0.1% | +1.2% | +1.3% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 162 deneme. Al-tut Sharpe: eğitim 1.38, test 0.25.
Eğitimde seçilen kural: **getiri_120g > 0.1151 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.19 → test Sharpe 0.84; testte nakitte kalma oranı 28%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.5%, test -2.6%.
Deflated Sharpe (deneme sayısı 162): 0.11 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.3 |
| haftanin_gunu | 1.0 | 142 | +0.3% | 1.5 |
| haftanin_gunu | 2.0 | 141 | +0.0% | 0.0 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.5 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.3 |
| ay_donusu | 0.0 | 521 | +0.2% | 2.0 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.7 |
| bayram_oncesi | 1.0 | 5 | -0.9% | -3.2 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.5 |
| bayram_sonrasi | 1.0 | 6 | +1.4% | 1.2 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.6 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.7 |

## Son durum (en yeni satır)

getiri_1g=0.0201, getiri_5g=0.087, getiri_20g=-0.0347, getiri_60g=0.0436, getiri_120g=0.0262, mom_12_1=0.0247, zirve_52h_yakinlik=0.84, zirveden_dusus=-0.16, oynaklik_20g=0.381, oynaklik_60g=0.374, atr_20g_oran=0.0328, rsi_14=51.7, ma20_uzaklik=0.0265, ma50_uzaklik=0.00833, ma200_uzaklik=0.0112, hacim_z_20=0.0201, amihud_20g=0.296, devir_hizi_20g=0.00956, gece_ort_20g=-0.0039, gunici_ort_20g=0.00269, aof_1g_sapma=0.00883, max_gunluk_20g=0.0586, min_gunluk_20g=-0.0344, ivol_60g=0.224, endekse_gore_1g=0.00395, endekse_gore_20g=0.0144, endekse_gore_60g=0.22, beta_60g=1.06, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.00372, piyasa_degeri_mn=2.15e+04, halka_aciklik=0.389, temettu_verimi=0.0304, olay_sayi_5g=1, olay_yon_5g=-1