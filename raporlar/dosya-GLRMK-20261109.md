# Hisse dosyası analizi — GLRMK

Satır: 3432 (gün sonu satırı 453) · 2025-01-17 10:30:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 181 (18 bağımsız bölüm); ≥%10 yükseliş 131 gün (18 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
453 günde gece (kapanış→açılış) toplam +197.7% (t=3.1), gün içi (açılış→kapanış) toplam -68.4% (t=-1.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fk | 12.1 | 10.9 | +0.86 |
| kazanc_verimi | 0.0824 | 0.0916 | -0.83 |
| oynaklik_20g | 0.454 | 0.381 | +0.68 |
| atr_20g_oran | 0.0407 | 0.0356 | +0.66 |
| gunici_ort_20g | -0.00107 | -0.00485 | +0.62 |
| amihud_20g | 0.0417 | 0.0513 | -0.58 |
| halka_aciklik | 0.122 | 0.12 | +0.54 |
| piyasa_degeri_mn | 5.56e+04 | 5.28e+04 | +0.53 |
| beta_60g | 0.955 | 0.658 | +0.48 |
| net_kar_marji | 0.102 | 0.123 | -0.44 |
| max_gunluk_20g | 0.059 | 0.0524 | +0.44 |
| devir_hizi_20g | 0.0532 | 0.0476 | +0.42 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.0953 | 0.0863 | +0.83 |
| ivol_60g | 0.327 | 0.394 | -0.82 |
| fk | 10.5 | 11.6 | -0.81 |
| oynaklik_60g | 0.362 | 0.433 | -0.80 |
| endekse_gore_60g | -0.142 | -0.0212 | -0.79 |
| oynaklik_20g | 0.347 | 0.433 | -0.71 |
| atr_20g_oran | 0.0348 | 0.0384 | -0.59 |
| piyasa_degeri_mn | 5.17e+04 | 5.54e+04 | -0.58 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oynaklik_20g | 412 | 412 |  | -0.39 | 0.000 | +6.3% | -7.5% | 14% | 58% | 0.229–0.319 | 0.512–0.88 |
| kazanc_verimi | 432 | 392 |  | +0.50 | 0.000 | -10.7% | +9.3% | 77% | 17% | 0.0624–0.0781 | 0.0987–0.12 |
| fk | 432 | 408 |  | -0.50 | 0.000 | +9.3% | -10.7% | 17% | 77% | 8.36–10.1 | 12.8–16 |
| halka_aciklik | 431 | 15 | seviye | -0.38 | 0.000 | +3.2% | -5.5% | 30% | 47% | 0.12–0.12 | 0.319–0.319 |
| piyasa_degeri_mn | 432 | 419 | seviye | -0.35 | 0.000 | +5.6% | -9.7% | 28% | 74% | 4.01e+04–4.65e+04 | 5.9e+04–7.87e+04 |
| oynaklik_60g | 372 | 370 |  | -0.38 | 0.000 | +3.9% | -6.4% | 35% | 59% | 0.309–0.357 | 0.49–0.631 |
| endekse_gore_60g | 373 | 373 |  | -0.36 | 0.000 | +9.3% | -5.5% | 33% | 44% | -0.37–-0.185 | 0.11–0.376 |
| atr_20g_oran | 412 | 412 |  | -0.33 | 0.000 | +5.3% | -8.2% | 23% | 64% | 0.0227–0.0306 | 0.0471–0.0797 |
| mom_12_1 | 181 | 181 |  | +0.42 | 0.000 | -15.2% | +0.1% | 95% | 44% | -0.131–-0.0125 | 0.375–0.646 |
| gunici_ort_20g | 413 | 410 |  | -0.28 | 0.000 | +5.0% | -4.5% | 22% | 55% | -0.0139–-0.00656 | 0.00269–0.0156 |
| amihud_20g | 412 | 410 |  | +0.27 | 0.000 | -4.6% | +8.6% | 57% | 13% | 0.0122–0.0325 | 0.0706–0.131 |
| net_kar_marji | 433 | 8 | çeyreklik adım | +0.27 | 0.000 | -0.2% | +6.4% | 47% | 16% | 0.0459–0.0627 | 0.17–0.17 |
| roe_ttm | 433 | 8 | çeyreklik adım | +0.25 | 0.000 | -7.0% | +0.4% | 61% | 45% | 0.137–0.218 | 0.433–0.683 |
| getiri_60g | 373 | 373 |  | -0.27 | 0.000 | +5.0% | -2.5% | 27% | 35% | -0.339–-0.0966 | 0.112–0.547 |
| ivol_60g | 313 | 313 |  | -0.28 | 0.000 | +1.2% | -6.3% | 41% | 57% | 0.237–0.309 | 0.438–0.533 |
| dolar_getiri_60g | 373 | 373 |  | -0.25 | 0.000 | +4.4% | -3.0% | 28% | 37% | -0.371–-0.13 | 0.0764–0.484 |
| max_gunluk_20g | 412 | 44 |  | -0.21 | 0.001 | +3.4% | -1.6% | 26% | 39% | 0.0197–0.0382 | 0.0728–0.0999 |
| devir_hizi_20g | 413 | 412 |  | -0.18 | 0.009 | +3.8% | -3.7% | 14% | 60% | 0.0153–0.0345 | 0.0964–0.214 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +1.2% | +1.3% | +1.5% | -0.1% | 34% |
| siyasi | hayır | 17 | -0.3% | +2.1% | +2.9% | +3.0% | 53% |
| derecelendirme | hayır | 15 | +0.4% | +3.4% | +1.6% | -0.6% | 60% |
| jeopolitik | hayır | 10 | +0.1% | +2.1% | -1.4% | -2.8% | 30% |
| enflasyon | hayır | 9 | +1.2% | -0.1% | +0.8% | -4.1% | 11% |
| regulasyon | hayır | 6 | +0.2% | -0.2% | +0.6% | -2.9% | 33% |
| haber | hayır | 5 | +2.4% | +3.6% | +5.6% | +1.2% | 40% |
| kuresel_faiz | hayır | 5 | -1.9% | +1.9% | +3.2% | +3.0% | 40% |
| sok | hayır | 5 | -5.8% | -4.8% | -3.9% | -5.0% | 20% |
| tarife | hayır | 5 | +1.0% | -0.6% | +0.7% | -0.4% | 40% |
| kur | hayır | 4 | -0.1% | -1.3% | +1.9% | +8.6% | 75% |
| dusus | hayır | 3 | -1.3% | +2.6% | +0.9% | +0.1% | 33% |
| yukselis | hayır | 3 | +1.2% | -0.5% | -3.1% | +8.0% | 67% |
| butce_vergi | hayır | 2 | +2.8% | +3.9% | +3.7% | +1.3% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 271 gün, test 182 gün, 167 deneme. Al-tut Sharpe: eğitim 1.11, test -0.89.
Eğitimde seçilen kural: **xu100_getiri_20g < 0.05539 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.08 → test Sharpe -1.93; testte nakitte kalma oranı 82%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.1%, test -0.7%.
Deflated Sharpe (deneme sayısı 167): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 92 | +0.2% | 0.7 |
| haftanin_gunu | 1.0 | 91 | -0.5% | -1.8 |
| haftanin_gunu | 2.0 | 90 | -0.5% | -1.5 |
| haftanin_gunu | 3.0 | 89 | +0.5% | 1.6 |
| haftanin_gunu | 4.0 | 91 | +0.5% | 1.6 |
| ay_donusu | 0.0 | 331 | +0.1% | 0.4 |
| ay_donusu | 1.0 | 122 | -0.1% | -0.3 |
| bayram_oncesi | 0.0 | 449 | +0.0% | 0.3 |
| bayram_oncesi | 1.0 | 4 | -0.8% | -1.4 |
| bayram_sonrasi | 0.0 | 449 | +0.0% | 0.2 |
| bayram_sonrasi | 1.0 | 4 | +0.7% | 1.8 |
| bilanco_sezonu | 0.0 | 268 | +0.1% | 0.3 |
| bilanco_sezonu | 1.0 | 185 | -0.0% | -0.0 |

## Son durum (en yeni satır)

getiri_1g=0.0349, getiri_5g=0.173, getiri_20g=-0.0898, getiri_60g=-0.306, getiri_120g=-0.326, mom_12_1=-0.304, zirve_52h_yakinlik=0.511, zirveden_dusus=-0.489, oynaklik_20g=0.573, oynaklik_60g=0.546, atr_20g_oran=0.0483, rsi_14=47.1, ma20_uzaklik=0.0484, ma50_uzaklik=-0.103, ma200_uzaklik=-0.265, hacim_z_20=-0.699, amihud_20g=0.0994, devir_hizi_20g=0.0318, gece_ort_20g=-0.004, gunici_ort_20g=-0.000608, aof_1g_sapma=0.0187, max_gunluk_20g=0.0748, min_gunluk_20g=-0.0715, ivol_60g=0.43, endekse_gore_1g=0.0152, endekse_gore_20g=-0.0439, endekse_gore_60g=-0.133, beta_60g=1.15, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.338, piyasa_degeri_mn=4.02e+04, halka_aciklik=0.25, fk=10.4, kazanc_verimi=0.0966, pd_dd=1.42, fd_favok=5.31, snak_verimi=0.0373, temettu_verimi=0, roe_ttm=0.137, net_kar_marji=0.102, kar_buyume_yillik=-0.16, satis_buyume_yillik=0.0116, net_borc_ozkaynak=0.0106, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0