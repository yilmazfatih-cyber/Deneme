# Hisse dosyası analizi — TSKB

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 133 (23 bağımsız bölüm); ≥%10 yükseliş 165 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +92.8% (t=2.2), gün içi (açılış→kapanış) toplam -18.0% (t=-0.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| oynaklik_60g | 0.331 | 0.382 | -0.70 |
| piyasa_degeri_mn | 3.77e+04 | 3.37e+04 | +0.62 |
| getiri_120g | 0.095 | -0.00593 | +0.59 |
| zirve_52h_yakinlik | 0.921 | 0.86 | +0.48 |
| zirveden_dusus | -0.0791 | -0.14 | +0.47 |
| mom_12_1 | 0.113 | 0.0416 | +0.39 |
| amihud_20g | 0.0689 | 0.0749 | -0.36 |
| atr_20g_oran | 0.0325 | 0.0327 | -0.33 |
| xu100_ma200_uzaklik | 0.0725 | 0.0667 | +0.32 |
| ma20_uzaklik | 0.0178 | 0.00288 | +0.30 |
| rsi_14 | 54.3 | 51 | +0.27 |
| getiri_5g | 0.0135 | 0.000795 | +0.27 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 3.16e+04 | 3.57e+04 | -1.07 |
| atr_20g_oran | 0.038 | 0.0299 | +0.85 |
| oynaklik_60g | 0.424 | 0.359 | +0.81 |
| ma200_uzaklik | -0.0569 | 0.0258 | -0.66 |
| zirve_52h_yakinlik | 0.822 | 0.89 | -0.62 |
| zirveden_dusus | -0.178 | -0.11 | -0.61 |
| xu100_ma200_uzaklik | 0.00487 | 0.0799 | -0.59 |
| ivol_60g | 0.248 | 0.233 | +0.53 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| atr_20g_oran | 672 | 661 |  | +0.38 | 0.000 | -1.9% | +7.7% | 23% | 2% | 0.0194–0.0247 | 0.0379–0.0535 |
| oynaklik_60g | 632 | 631 |  | +0.40 | 0.000 | -5.4% | +5.1% | 46% | 9% | 0.256–0.317 | 0.44–0.526 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.40 | 0.000 | +5.8% | -5.0% | 14% | 40% | 1.99e+04–3.1e+04 | 3.82e+04–4.26e+04 |
| ivol_60g | 573 | 566 |  | +0.30 | 0.000 | -6.8% | +3.6% | 47% | 17% | 0.189–0.216 | 0.278–0.385 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.29 | 0.000 | +3.3% | -4.0% | 16% | 28% | -0.118–-0.0163 | 0.144–0.312 |
| temettu_verimi | 693 | 103 |  | -0.23 | 0.000 | +1.1% | +1.1% | 19% | 19% | 0–0.0555 | 0–0.0555 |
| halka_aciklik | 692 | 32 | seviye | -0.23 | 0.000 | +4.3% | -3.0% | 20% | 33% | 0.401–0.407 | 0.412–0.418 |
| zirveden_dusus | 573 | 428 |  | -0.23 | 0.000 | +0.8% | -5.5% | 17% | 38% | -0.327–-0.204 | -0.0465–0 |
| zirve_52h_yakinlik | 573 | 448 |  | -0.23 | 0.000 | +0.8% | -5.5% | 17% | 38% | 0.673–0.796 | 0.954–1.02 |
| oynaklik_20g | 672 | 668 |  | +0.21 | 0.000 | -1.6% | +3.3% | 22% | 10% | 0.183–0.295 | 0.441–0.727 |
| devir_hizi_20g | 673 | 660 |  | +0.20 | 0.000 | -1.6% | +3.2% | 14% | 18% | 0.00963–0.0146 | 0.0242–0.0421 |
| max_gunluk_20g | 672 | 53 |  | +0.17 | 0.000 | -1.9% | +1.3% | 24% | 26% | 0.0173–0.0411 | 0.0678–0.0998 |
| xu100_getiri_20g | 673 | 671 |  | -0.15 | 0.003 | +2.1% | -1.2% | 15% | 21% | -0.166–-0.0409 | 0.0783–0.222 |
| ma20_uzaklik | 673 | 672 |  | -0.14 | 0.011 | +2.4% | -1.2% | 10% | 26% | -0.212–-0.0405 | 0.0508–0.182 |
| amihud_20g | 672 | 667 |  | +0.14 | 0.013 | -3.0% | +0.7% | 30% | 13% | 0.0271–0.0549 | 0.0893–0.135 |
| getiri_120g | 573 | 573 |  | -0.15 | 0.015 | +2.7% | -2.8% | 9% | 41% | -0.236–-0.0947 | 0.177–0.748 |
| olay_sayi_5g | 693 | 5 |  | -0.13 | 0.032 | +1.1% | +0.2% | 19% | 22% | 0–1 | 2–4 |
| endekse_gore_60g | 633 | 633 |  | +0.13 | 0.037 | -0.5% | +1.7% | 20% | 16% | -0.29–-0.107 | 0.0978–0.291 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.2% | +0.0% | +0.3% | -1.5% | 30% |
| siyasi | hayır | 9 | +0.2% | -1.9% | -1.9% | -4.0% | 22% |
| enflasyon | hayır | 6 | +1.0% | -0.3% | -0.6% | -2.1% | 33% |
| jeopolitik | hayır | 5 | -2.7% | -0.1% | -0.9% | -0.9% | 20% |
| sok | hayır | 5 | -5.6% | -0.5% | -0.2% | -0.9% | 80% |
| tarife | hayır | 5 | +1.7% | -0.2% | -1.8% | -1.4% | 40% |
| derecelendirme | hayır | 4 | +1.2% | -0.5% | -0.9% | -4.4% | 0% |
| dusus | hayır | 3 | -1.5% | -2.2% | +0.4% | +1.8% | 67% |
| yukselis | hayır | 3 | +4.5% | -0.7% | +1.6% | +2.1% | 67% |
| butce_vergi | hayır | 2 | -0.7% | -0.3% | -1.8% | +0.1% | 50% |
| kur | hayır | 2 | -0.6% | +2.2% | -0.7% | -4.1% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 159 deneme. Al-tut Sharpe: eğitim 1.25, test -0.55.
Eğitimde seçilen kural: **gunici_ort_20g > -0.001154 ise nakde geç** (kantil 0.3). Eğitim Sharpe 3.65 → test Sharpe 0.45; testte nakitte kalma oranı 42%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.7%, test -3.6%.
Deflated Sharpe (deneme sayısı 159): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.7 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.5 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.3 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.5 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.9 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 5 | -0.5% | -2.5 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | +1.4% | 1.3 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.4 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.1 |

## Son durum (en yeni satır)

getiri_1g=0.0136, getiri_5g=0.12, getiri_20g=0.0503, getiri_60g=-0.0517, getiri_120g=-0.137, mom_12_1=-0.251, zirve_52h_yakinlik=0.728, zirveden_dusus=-0.272, oynaklik_20g=0.404, oynaklik_60g=0.38, atr_20g_oran=0.0322, rsi_14=62.7, ma20_uzaklik=0.104, ma50_uzaklik=0.0248, ma200_uzaklik=-0.0988, hacim_z_20=-0.496, amihud_20g=0.0879, devir_hizi_20g=0.0205, gece_ort_20g=-0.00163, gunici_ort_20g=0.00446, aof_1g_sapma=0.00999, max_gunluk_20g=0.0649, min_gunluk_20g=-0.041, ivol_60g=0.238, endekse_gore_1g=-0.00259, endekse_gore_20g=0.0994, endekse_gore_60g=0.125, beta_60g=1.04, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0947, piyasa_degeri_mn=2.93e+04, halka_aciklik=0.403, temettu_verimi=0.0513, olay_sayi_5g=1, olay_yon_5g=-1