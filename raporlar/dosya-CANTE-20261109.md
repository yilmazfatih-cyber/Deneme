# Hisse dosyası analizi — CANTE

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 251 (32 bağımsız bölüm); ≥%10 yükseliş 181 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +1153.4% (t=5.3), gün içi (açılış→kapanış) toplam -96.3% (t=-4.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.122 | 0.044 | +0.82 |
| net_kar_marji | -0.433 | -0.234 | -0.55 |
| fd_favok | 7.94 | 6.61 | +0.53 |
| usdtry_getiri_20g | 0.0123 | 0.0153 | -0.49 |
| piyasa_degeri_mn | 1.71e+04 | 1.42e+04 | +0.45 |
| roe_ttm | -0.0793 | -0.0612 | -0.39 |
| xu100_getiri_20g | 0.0233 | 0.00488 | +0.39 |
| dolar_getiri_60g | -0.108 | -0.127 | +0.38 |
| ivol_60g | 0.396 | 0.321 | +0.37 |
| mom_12_1 | 0.0617 | -0.194 | +0.36 |
| aof_1g_sapma | 0.176 | 0.182 | -0.36 |
| getiri_60g | -0.0753 | -0.089 | +0.35 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| amihud_20g | 0.0809 | 0.0498 | +0.56 |
| usdtry_getiri_20g | 0.0153 | 0.0136 | +0.47 |
| fd_favok | 6.67 | 7.6 | -0.45 |
| net_borc_ozkaynak | 0.000337 | -0.00922 | +0.44 |
| piyasa_degeri_mn | 1.42e+04 | 1.56e+04 | -0.35 |
| olay_sayi_5g | 0 | 0 | +0.35 |
| bilancodan_gun | 58 | 43 | +0.34 |
| xu100_ma200_uzaklik | 0.0591 | 0.0807 | -0.33 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fd_favok | 644 | 569 |  | -0.34 | 0.000 | +3.4% | -6.1% | 14% | 40% | 4.42–5.91 | 9.47–13.5 |
| amihud_20g | 653 | 641 |  | +0.31 | 0.000 | -4.7% | +7.8% | 45% | 17% | 0.0148–0.0295 | 0.11–0.218 |
| devir_hizi_20g | 674 | 673 |  | -0.29 | 0.000 | +7.5% | -5.2% | 11% | 42% | 0.0146–0.027 | 0.126–0.647 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.28 | 0.000 | -5.9% | +0.5% | 54% | 22% | -1–-0.556 | 0.268–0.366 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.28 | 0.000 | -5.0% | +6.1% | 40% | 32% | -0.0663–-0.0217 | 0.0166–0.0195 |
| piyasa_degeri_mn | 693 | 612 | seviye | -0.26 | 0.000 | +4.0% | -5.5% | 11% | 43% | 1.01e+04–1.29e+04 | 1.89e+04–2.33e+04 |
| xu100_ma200_uzaklik | 494 | 494 |  | -0.29 | 0.000 | +1.3% | -8.7% | 19% | 75% | -0.118–-0.0168 | 0.144–0.312 |
| aof_1g_sapma | 693 | 646 |  | +0.19 | 0.000 | -5.7% | +1.5% | 52% | 32% | -0.0479–0.00457 | 0.193–0.244 |
| ivol_60g | 574 | 574 |  | -0.19 | 0.000 | +6.0% | -2.8% | 6% | 43% | 0.18–0.26 | 0.511–0.676 |
| halka_aciklik | 693 | 41 | seviye | -0.16 | 0.001 | -2.5% | -6.5% | 32% | 61% | 0.415–0.514 | 0.706–0.722 |
| pd_dd | 693 | 607 |  | -0.16 | 0.001 | -2.4% | -5.5% | 35% | 45% | 0.318–0.486 | 0.805–2.73 |
| usdtry_getiri_20g | 673 | 665 |  | +0.16 | 0.001 | -4.2% | +1.4% | 39% | 26% | -0.013–0.00945 | 0.019–0.0482 |
| beta_60g | 633 | 633 |  | +0.15 | 0.004 | -8.4% | -3.2% | 63% | 46% | -0.379–0.683 | 1.06–1.66 |
| xu100_getiri_20g | 674 | 672 |  | -0.15 | 0.005 | +0.2% | -3.0% | 19% | 50% | -0.166–-0.0409 | 0.0783–0.222 |
| bilancodan_gun | 694 | 303 | seviye | +0.14 | 0.012 | -1.6% | +1.8% | 31% | 22% | 0.917–19 | 79–113 |
| atr_20g_oran | 673 | 623 |  | -0.13 | 0.047 | +3.9% | -4.1% | 27% | 48% | 0.0223–0.0289 | 0.0474–0.0752 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.13 | 0.054 | -4.8% | -6.0% | 54% | 43% | -0.131–-0.117 | -0.0306–0.0265 |
| gece_ort_20g | 673 | 616 |  | -0.12 | 0.065 | +0.8% | -3.1% | 38% | 40% | -0.0102–0.0013 | 0.00616–0.0314 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | -0.3% | +0.3% | +0.9% | -1.0% | 26% |
| siyasi | hayır | 9 | -0.8% | -0.6% | -2.4% | +2.4% | 44% |
| enflasyon | hayır | 6 | +0.3% | -1.5% | -3.1% | -11.2% | 0% |
| jeopolitik | hayır | 5 | -4.7% | +0.3% | -1.1% | +2.7% | 40% |
| sok | hayır | 5 | -0.4% | +0.4% | -7.2% | -2.5% | 20% |
| tarife | hayır | 5 | +2.8% | -1.0% | +0.0% | +5.4% | 60% |
| derecelendirme | hayır | 4 | +0.9% | +1.8% | +1.3% | +0.5% | 25% |
| dusus | hayır | 3 | -1.3% | +0.1% | -1.4% | +3.6% | 33% |
| yukselis | hayır | 3 | +1.7% | -0.9% | -2.0% | +12.5% | 67% |
| butce_vergi | hayır | 2 | +1.5% | -3.0% | -5.5% | -13.3% | 0% |
| kur | hayır | 2 | +0.1% | -0.1% | +0.3% | +1.4% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 224 deneme. Al-tut Sharpe: eğitim 0.28, test -1.27.
Eğitimde seçilen kural: **atr_20g_oran < 0.03931 ise nakde geç** (kantil 0.7). Eğitim Sharpe 1.42 → test Sharpe -1.57; testte nakitte kalma oranı 50%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.1%, test -6.0%.
Deflated Sharpe (deneme sayısı 224): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.4 |
| haftanin_gunu | 1.0 | 143 | -0.2% | -1.0 |
| haftanin_gunu | 2.0 | 141 | -0.5% | -2.4 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 1.8 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 0.7 |
| ay_donusu | 0.0 | 522 | -0.0% | -0.1 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.9 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.7 |
| bayram_oncesi | 1.0 | 6 | +0.4% | 1.2 |
| bayram_sonrasi | 0.0 | 708 | -0.1% | -0.9 |
| bayram_sonrasi | 1.0 | 6 | +3.8% | 2.3 |
| bilanco_sezonu | 0.0 | 423 | -0.1% | -1.0 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.0505, getiri_5g=0.143, getiri_20g=-0.0459, getiri_60g=-0.126, getiri_120g=-0.373, mom_12_1=-0.58, zirve_52h_yakinlik=0.381, zirveden_dusus=-0.619, oynaklik_20g=0.362, oynaklik_60g=0.53, atr_20g_oran=0.0374, rsi_14=44.9, ma20_uzaklik=0.0473, ma50_uzaklik=-0.0744, ma200_uzaklik=-0.283, hacim_z_20=-0.565, amihud_20g=0.241, devir_hizi_20g=0.0144, gece_ort_20g=-0.00198, gunici_ort_20g=-0.00163, aof_1g_sapma=0.0112, max_gunluk_20g=0.0543, min_gunluk_20g=-0.0396, ivol_60g=0.519, endekse_gore_1g=0.0343, endekse_gore_20g=0.00325, endekse_gore_60g=0.0502, beta_60g=0.19, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.166, piyasa_degeri_mn=1.04e+04, halka_aciklik=0.699, kazanc_verimi=-0.234, pd_dd=0.328, fd_favok=5.82, snak_verimi=0.14, temettu_verimi=0, roe_ttm=-0.0767, net_kar_marji=-0.97, satis_buyume_yillik=-0.0815, net_borc_ozkaynak=-0.0663, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1