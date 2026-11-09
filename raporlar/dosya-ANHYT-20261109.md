# Hisse dosyası analizi — ANHYT

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 168 (24 bağımsız bölüm); ≥%10 yükseliş 225 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +170.2% (t=2.9), gün içi (açılış→kapanış) toplam -6.3% (t=0.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | 0.23 | -0.000947 | +1.03 |
| mom_12_1 | 0.411 | 0.102 | +0.79 |
| ivol_60g | 0.386 | 0.31 | +0.75 |
| endekse_gore_60g | -0.00769 | -0.0346 | +0.67 |
| temettu_verimi | 0.0228 | 0.0592 | -0.58 |
| oynaklik_60g | 0.537 | 0.369 | +0.57 |
| atr_20g_oran | 0.0432 | 0.0337 | +0.54 |
| piyasa_degeri_mn | 4.96e+04 | 4.43e+04 | +0.53 |
| oynaklik_20g | 0.434 | 0.355 | +0.50 |
| usdtry_getiri_20g | 0.0149 | 0.0138 | +0.49 |
| dolar_getiri_60g | -0.0449 | 0.00459 | +0.49 |
| getiri_60g | 0.00298 | 0.0467 | +0.49 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 4.16e+04 | 4.72e+04 | -0.85 |
| mom_12_1 | -0.0655 | 0.21 | -0.70 |
| amihud_20g | 0.249 | 0.201 | +0.62 |
| zirve_52h_yakinlik | 0.73 | 0.806 | -0.56 |
| zirveden_dusus | -0.27 | -0.194 | -0.56 |
| beta_60g | 0.87 | 0.771 | +0.54 |
| aof_1g_sapma | 0.119 | 0.0748 | +0.52 |
| usdtry_getiri_20g | 0.0116 | 0.0149 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mom_12_1 | 441 | 441 |  | -0.48 | 0.000 | +6.3% | -6.0% | 0% | 45% | -0.488–-0.102 | 0.537–1.79 |
| piyasa_degeri_mn | 692 | 685 | seviye | -0.47 | 0.000 | +18.4% | -7.2% | 17% | 51% | 1.97e+04–3.7e+04 | 5.03e+04–6.87e+04 |
| amihud_20g | 672 | 671 |  | +0.28 | 0.000 | -2.8% | +16.6% | 32% | 27% | 0.0962–0.159 | 0.278–0.645 |
| zirve_52h_yakinlik | 573 | 461 |  | -0.23 | 0.000 | +3.4% | -5.0% | 23% | 40% | 0.505–0.681 | 0.892–1.07 |
| zirveden_dusus | 573 | 449 |  | -0.23 | 0.000 | +3.4% | -5.0% | 23% | 40% | -0.495–-0.319 | -0.108–0 |
| usdtry_getiri_20g | 672 | 664 |  | -0.20 | 0.000 | +11.5% | +0.7% | 30% | 39% | -0.013–0.00947 | 0.019–0.0482 |
| beta_60g | 632 | 632 |  | +0.20 | 0.000 | -0.9% | +18.3% | 19% | 19% | 0.339–0.57 | 0.953–1.37 |
| getiri_120g | 573 | 572 |  | -0.20 | 0.000 | +3.6% | -6.3% | 3% | 56% | -0.306–-0.139 | 0.365–2.58 |
| dolar_getiri_60g | 633 | 633 |  | +0.15 | 0.003 | -1.9% | +11.0% | 36% | 34% | -0.412–-0.146 | 0.149–2.15 |
| getiri_60g | 633 | 629 |  | +0.15 | 0.003 | -1.2% | +12.2% | 34% | 33% | -0.366–-0.107 | 0.196–2.23 |
| xu100_getiri_20g | 673 | 671 |  | +0.15 | 0.004 | -2.1% | +8.5% | 43% | 19% | -0.166–-0.0409 | 0.0783–0.222 |
| aof_1g_sapma | 692 | 690 |  | +0.14 | 0.007 | -1.8% | +8.2% | 16% | 35% | -0.0264–0.0538 | 0.139–0.235 |
| ivol_60g | 573 | 572 |  | -0.15 | 0.008 | +1.8% | -3.0% | 10% | 49% | 0.214–0.272 | 0.414–0.679 |
| endekse_gore_20g | 673 | 673 |  | -0.12 | 0.043 | +7.1% | +7.2% | 18% | 32% | -0.236–-0.0796 | 0.0811–0.778 |
| min_gunluk_20g | 672 | 68 |  | +0.11 | 0.112 | +4.5% | +10.8% | 32% | 16% | -0.0999–-0.055 | -0.0286–-0.0123 |
| getiri_5g | 688 | 682 |  | +0.10 | 0.443 | +1.4% | +13.4% | 30% | 22% | -0.171–-0.0377 | 0.0539–0.312 |
| gunici_ort_20g | 673 | 649 |  | -0.09 | 0.950 | +6.8% | +10.6% | 21% | 26% | -0.0176–-0.00391 | 0.00294–0.027 |
| halka_aciklik | 692 | 7 | seviye | +0.08 | 1.000 | +2.6% | +7.7% | 24% | 4% | 0.147–0.151 | 0.151–0.154 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +1.0% | -0.3% | -0.5% | -1.9% | 39% |
| siyasi | hayır | 9 | -0.9% | -1.1% | -2.5% | +0.7% | 67% |
| enflasyon | hayır | 6 | +0.8% | -1.2% | -2.0% | +0.7% | 67% |
| jeopolitik | hayır | 5 | -0.3% | +0.3% | -0.0% | -0.1% | 60% |
| sok | hayır | 5 | -2.8% | +1.3% | -2.2% | +3.5% | 80% |
| tarife | hayır | 5 | +1.9% | -1.2% | +0.3% | -0.2% | 40% |
| derecelendirme | hayır | 4 | +2.3% | -1.2% | -4.3% | -5.2% | 0% |
| dusus | hayır | 3 | -1.9% | +0.9% | -1.4% | -3.0% | 33% |
| yukselis | hayır | 3 | +1.5% | +2.8% | +1.4% | +3.1% | 100% |
| butce_vergi | hayır | 2 | +0.7% | -0.8% | -2.2% | -3.5% | 50% |
| kur | hayır | 2 | -0.3% | +2.5% | +4.5% | +6.8% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 137 deneme. Al-tut Sharpe: eğitim 1.29, test 0.28.
Eğitimde seçilen kural: **gunici_ort_20g < 0.002097 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.58 → test Sharpe -0.88; testte nakitte kalma oranı 86%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.8%, test +0.5%.
Deflated Sharpe (deneme sayısı 137): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.3 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.3 |
| haftanin_gunu | 2.0 | 141 | +0.4% | 1.7 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.7 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.3 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.1 |
| ay_donusu | 1.0 | 192 | +0.3% | 1.3 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.7 |
| bayram_oncesi | 1.0 | 5 | -0.8% | -0.5 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.6 |
| bayram_sonrasi | 1.0 | 6 | +0.4% | 0.4 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 2.0 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0211, getiri_5g=0.0817, getiri_20g=-0.0662, getiri_60g=-0.095, getiri_120g=-0.128, mom_12_1=-0.0307, zirve_52h_yakinlik=0.779, zirveden_dusus=-0.221, oynaklik_20g=0.365, oynaklik_60g=0.298, atr_20g_oran=0.0353, rsi_14=47.3, ma20_uzaklik=0.011, ma50_uzaklik=-0.0349, ma200_uzaklik=-0.102, hacim_z_20=-1.05, amihud_20g=0.227, devir_hizi_20g=0.0121, gece_ort_20g=-0.00564, gunici_ort_20g=0.0026, aof_1g_sapma=0.00954, max_gunluk_20g=0.0531, min_gunluk_20g=-0.0415, ivol_60g=0.249, endekse_gore_1g=0.00496, endekse_gore_20g=-0.0171, endekse_gore_60g=0.0812, beta_60g=0.57, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.136, piyasa_degeri_mn=4.16e+04, halka_aciklik=0.15, temettu_verimi=0.0842, olay_sayi_5g=1, olay_yon_5g=-1