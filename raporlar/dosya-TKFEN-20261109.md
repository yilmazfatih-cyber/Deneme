# Hisse dosyası analizi — TKFEN

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 253 (30 bağımsız bölüm); ≥%10 yükseliş 272 gün (27 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +960.8% (t=5.1), gün içi (açılış→kapanış) toplam -51.0% (t=-0.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| dolar_getiri_60g | 0.295 | 0.0477 | +0.64 |
| getiri_60g | 0.325 | 0.104 | +0.63 |
| endekse_gore_60g | 0.277 | 0.0212 | +0.57 |
| mom_12_1 | 0.961 | 0.346 | +0.49 |
| ma200_uzaklik | 0.44 | 0.175 | +0.48 |
| amihud_20g | 0.06 | 0.0712 | -0.48 |
| pd_dd | 1.17 | 0.927 | +0.46 |
| fd_favok | 47.5 | 40 | +0.44 |
| piyasa_degeri_mn | 3.43e+04 | 2.68e+04 | +0.43 |
| devir_hizi_20g | 0.0469 | 0.0373 | +0.40 |
| oynaklik_60g | 0.503 | 0.479 | +0.39 |
| gece_ort_20g | 0.00377 | 0.00317 | +0.37 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.22 | 0.904 | -0.84 |
| beta_60g | 1.05 | 0.87 | +0.61 |
| temettu_verimi | 0 | 0 | +0.59 |
| fk | 85.4 | 98.8 | -0.49 |
| kazanc_verimi | -0.0939 | -0.0144 | -0.48 |
| fd_favok | 45.4 | 47.6 | -0.43 |
| ivol_60g | 0.44 | 0.472 | -0.42 |
| roe_ttm | -0.084 | -0.0117 | -0.40 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| mom_12_1 | 442 | 442 |  | -0.45 | 0.000 | +12.9% | -8.8% | 28% | 69% | -0.525–0.047 | 1.15–2.08 |
| beta_60g | 633 | 633 |  | +0.32 | 0.000 | -7.1% | +10.6% | 57% | 31% | 0.0725–0.483 | 1.19–1.53 |
| pd_dd | 693 | 653 |  | -0.30 | 0.000 | +14.3% | +3.9% | 15% | 45% | 0.454–0.794 | 1.4–2.7 |
| temettu_verimi | 694 | 180 |  | +0.27 | 0.000 | +3.7% | +19.1% | 38% | 27% | 0–0.00217 | 0.00217–0.00483 |
| snak_verimi | 644 | 594 |  | +0.26 | 0.000 | +2.1% | +7.9% | 26% | 31% | -0.131–-0.0533 | 0.33–0.5 |
| ivol_60g | 574 | 574 |  | -0.27 | 0.000 | +23.5% | -2.9% | 25% | 59% | 0.299–0.362 | 0.577–0.76 |
| piyasa_degeri_mn | 693 | 691 | seviye | -0.23 | 0.000 | +10.2% | +4.4% | 16% | 50% | 1.33e+04–2.01e+04 | 4.85e+04–1.02e+05 |
| amihud_20g | 653 | 653 |  | +0.23 | 0.000 | +2.4% | +11.9% | 53% | 16% | 0.0181–0.0415 | 0.0903–0.14 |
| oynaklik_60g | 633 | 632 |  | -0.22 | 0.000 | +20.0% | -0.4% | 18% | 57% | 0.341–0.413 | 0.623–0.784 |
| xu100_ma200_uzaklik | 494 | 494 |  | +0.23 | 0.000 | +0.1% | +10.3% | 49% | 44% | -0.118–-0.0168 | 0.144–0.312 |
| fk | 250 | 249 |  | -0.29 | 0.000 | +25.4% | -5.4% | 8% | 54% | 19–22.9 | 134–161 |
| kazanc_verimi | 644 | 590 |  | -0.18 | 0.000 | +20.1% | +16.0% | 19% | 32% | -0.229–-0.108 | 0.0105–0.0527 |
| roe_ttm | 644 | 11 | çeyreklik adım | -0.17 | 0.001 | +14.7% | +11.3% | 26% | 41% | -0.18–-0.0845 | 0.0133–0.0405 |
| fd_favok | 288 | 286 |  | -0.25 | 0.001 | +0.6% | -10.5% | 22% | 74% | 12.5–18.3 | 135–188 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.15 | 0.003 | +4.0% | +6.6% | 45% | 29% | -0.138–-0.0676 | 0.0671–0.0693 |
| dolar_getiri_60g | 634 | 634 |  | -0.12 | 0.095 | +1.5% | -5.0% | 32% | 65% | -0.383–-0.187 | 0.498–1.16 |
| getiri_60g | 634 | 633 |  | -0.12 | 0.171 | +1.2% | -5.0% | 31% | 64% | -0.363–-0.157 | 0.549–1.32 |
| ma200_uzaklik | 494 | 494 |  | -0.12 | 0.268 | +3.2% | -2.9% | 20% | 62% | -0.341–-0.152 | 0.602–1.32 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sok | evet | 2 | +0.7% | -0.5% | +0.2% | +11.2% | 50% |
| temettu | evet | 2 | -2.3% | +8.5% | +16.6% | +3.4% | 50% |
| faiz | hayır | 41 | +1.1% | +0.8% | +2.7% | +8.5% | 46% |
| siyasi | hayır | 17 | +0.3% | +0.3% | +3.5% | +7.2% | 53% |
| derecelendirme | hayır | 15 | -0.1% | +0.7% | +1.3% | +9.3% | 60% |
| jeopolitik | hayır | 10 | -1.4% | -0.2% | +5.2% | +16.0% | 80% |
| enflasyon | hayır | 9 | +1.4% | +0.2% | -0.2% | -6.7% | 11% |
| regulasyon | hayır | 6 | -0.8% | -2.6% | +1.8% | +5.1% | 83% |
| haber | hayır | 5 | +0.5% | -1.2% | -0.7% | -2.7% | 20% |
| kuresel_faiz | hayır | 5 | +2.1% | +1.2% | +1.0% | +4.9% | 20% |
| sok | hayır | 5 | +1.4% | +8.2% | +17.1% | +12.0% | 60% |
| tarife | hayır | 5 | -0.5% | +0.8% | -0.9% | -2.9% | 20% |
| kur | hayır | 4 | -3.1% | -1.8% | +8.5% | +34.7% | 75% |
| dusus | hayır | 3 | -1.8% | +3.5% | +5.2% | +2.0% | 33% |
| yukselis | hayır | 3 | -2.9% | -1.8% | -5.8% | +2.5% | 33% |
| butce_vergi | hayır | 2 | -0.6% | +1.9% | -4.7% | -15.0% | 0% |
| YÖN: olumlu | evet | 4 | - | +0.9% | +0.4% | +2.7% | nan% |
| YÖN: olumsuz | evet | 2 | - | +5.7% | +15.7% | +65.1% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 235 deneme. Al-tut Sharpe: eğitim 1.38, test 1.31.
Eğitimde seçilen kural: **getiri_1g < 0.01332 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.46 → test Sharpe 2.04; testte nakitte kalma oranı 65%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +3.9%, test +9.6%.
Deflated Sharpe (deneme sayısı 235): 0.57 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.5% | 1.7 |
| haftanin_gunu | 1.0 | 143 | -0.2% | -0.9 |
| haftanin_gunu | 2.0 | 141 | -0.0% | -0.1 |
| haftanin_gunu | 3.0 | 143 | +1.0% | 3.5 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.5 |
| ay_donusu | 0.0 | 522 | +0.5% | 3.2 |
| ay_donusu | 1.0 | 192 | -0.2% | -1.0 |
| bayram_oncesi | 0.0 | 708 | +0.3% | 2.2 |
| bayram_oncesi | 1.0 | 6 | +0.4% | 0.5 |
| bayram_sonrasi | 0.0 | 708 | +0.3% | 2.2 |
| bayram_sonrasi | 1.0 | 6 | +2.1% | 0.8 |
| bilanco_sezonu | 0.0 | 423 | +0.2% | 1.4 |
| bilanco_sezonu | 1.0 | 291 | +0.4% | 1.9 |

## Son durum (en yeni satır)

getiri_1g=0.0195, getiri_5g=-0.031, getiri_20g=-0.266, getiri_60g=-0.177, getiri_120g=0.419, mom_12_1=2.17, zirve_52h_yakinlik=0.699, zirveden_dusus=-0.301, oynaklik_20g=0.854, oynaklik_60g=0.768, atr_20g_oran=0.0757, rsi_14=42.4, ma20_uzaklik=-0.0346, ma50_uzaklik=-0.128, ma200_uzaklik=0.283, hacim_z_20=-0.137, amihud_20g=0.0693, devir_hizi_20g=0.0447, gece_ort_20g=-0.0129, gunici_ort_20g=-0.000535, aof_1g_sapma=-0.0205, max_gunluk_20g=0.0754, min_gunluk_20g=-0.108, ivol_60g=0.704, endekse_gore_1g=-0.00325, endekse_gore_20g=-0.223, endekse_gore_60g=-0.0059, beta_60g=0.942, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.214, piyasa_degeri_mn=7.16e+04, halka_aciklik=0.194, kazanc_verimi=-0.0445, pd_dd=1.89, fd_favok=35.8, snak_verimi=0.0326, temettu_verimi=0.00171, roe_ttm=-0.084, net_kar_marji=0.0671, satis_buyume_yillik=-0.181, net_borc_ozkaynak=0.213, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0