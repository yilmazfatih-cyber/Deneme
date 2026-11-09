# Hisse dosyası analizi — AKFYE

Satır: 3980 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 232 (30 bağımsız bölüm); ≥%10 yükseliş 204 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +843.0% (t=5.4), gün içi (açılış→kapanış) toplam -86.1% (t=-2.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| snak_verimi | 0.0368 | -0.061 | +0.69 |
| ma200_uzaklik | 0.0713 | -0.0168 | +0.61 |
| ivol_60g | 0.353 | 0.269 | +0.54 |
| fd_favok | 6.96 | 7.13 | -0.50 |
| piyasa_degeri_mn | 2.53e+04 | 2.14e+04 | +0.49 |
| getiri_120g | 0.0701 | -0.0111 | +0.49 |
| endekse_gore_20g | 0.00957 | -0.029 | +0.49 |
| ma50_uzaklik | 0.0138 | -0.0128 | +0.48 |
| mom_12_1 | 0.176 | -0.0594 | +0.43 |
| ma20_uzaklik | 0.012 | -0.00866 | +0.41 |
| amihud_20g | 0.579 | 1.07 | -0.40 |
| roe_ttm | 0.0412 | 0.0291 | +0.39 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.124 | 0.0504 | +0.58 |
| roe_ttm | 0.0291 | 0.0412 | -0.55 |
| net_borc_ozkaynak | 0.203 | 0.222 | +0.55 |
| xu100_getiri_20g | 0.0496 | 0.008 | +0.49 |
| kazanc_verimi | 0.0643 | 0.101 | -0.49 |
| atr_20g_oran | 0.039 | 0.031 | +0.46 |
| getiri_60g | 0.0462 | -0.0136 | +0.41 |
| oynaklik_20g | 0.492 | 0.329 | +0.39 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 693 | 689 | seviye | -0.35 | 0.000 | +9.7% | -4.6% | 5% | 57% | 1.48e+04–2.01e+04 | 2.7e+04–1.51e+05 |
| snak_verimi | 644 | 605 |  | -0.31 | 0.000 | +6.4% | -2.3% | 9% | 43% | -0.346–-0.228 | 0.049–0.102 |
| roe_ttm | 644 | 11 | çeyreklik adım | -0.27 | 0.000 | +1.2% | -6.7% | 10% | 51% | -0.00836–-0.00727 | 0.316–0.316 |
| xu100_getiri_20g | 674 | 672 |  | +0.26 | 0.000 | -0.9% | +6.1% | 30% | 26% | -0.166–-0.0409 | 0.0783–0.222 |
| ivol_60g | 574 | 573 |  | -0.23 | 0.000 | +4.7% | -2.9% | 10% | 43% | 0.141–0.225 | 0.5–0.615 |
| amihud_20g | 653 | 652 |  | +0.21 | 0.000 | -2.7% | +3.5% | 52% | 26% | 0.0459–0.171 | 1.58–3.76 |
| endekse_gore_20g | 674 | 673 |  | -0.20 | 0.000 | +1.3% | -4.0% | 29% | 53% | -0.301–-0.0868 | 0.0677–0.381 |
| gece_ort_20g | 673 | 650 |  | -0.20 | 0.000 | +5.1% | -0.6% | 16% | 33% | -0.00549–0.000483 | 0.00555–0.0161 |
| kazanc_verimi | 644 | 604 |  | -0.19 | 0.000 | +1.6% | -2.6% | 7% | 38% | -0.0184–-0.0133 | 0.315–0.415 |
| pd_dd | 693 | 678 |  | -0.18 | 0.000 | +3.1% | +2.6% | 29% | 39% | 0.336–0.441 | 0.862–6.3 |
| olay_sayi_5g | 694 | 5 |  | +0.15 | 0.004 | +0.8% | +8.6% | 33% | 8% | 0–1 | 2–4 |
| fd_favok | 644 | 638 |  | +0.13 | 0.061 | -2.4% | +0.9% | 39% | 18% | 3.22–3.91 | 15.9–30.3 |
| xu100_ma200_uzaklik | 494 | 494 |  | +0.14 | 0.070 | +0.1% | +5.5% | 26% | 40% | -0.118–-0.0168 | 0.144–0.312 |
| ma50_uzaklik | 644 | 644 |  | -0.11 | 0.183 | +0.2% | -3.5% | 33% | 63% | -0.209–-0.079 | 0.0702–0.385 |
| devir_hizi_20g | 674 | 667 |  | -0.11 | 0.255 | +3.2% | -0.3% | 23% | 41% | 0.00495–0.0102 | 0.106–0.424 |
| getiri_120g | 574 | 571 |  | -0.11 | 0.298 | -0.1% | -1.8% | 25% | 54% | -0.403–-0.195 | 0.242–0.833 |
| ma200_uzaklik | 494 | 494 |  | -0.12 | 0.392 | +3.3% | -0.6% | 17% | 51% | -0.283–-0.137 | 0.152–0.453 |
| usdtry_getiri_20g | 673 | 665 |  | -0.10 | 0.645 | +0.4% | +0.3% | 21% | 41% | -0.013–0.00945 | 0.019–0.0482 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | -0.3% | -0.9% | -3.1% | -0.4% | 43% |
| siyasi | hayır | 9 | -2.2% | -0.2% | -1.4% | +2.0% | 56% |
| enflasyon | hayır | 6 | +1.0% | -0.8% | -1.3% | +2.5% | 33% |
| jeopolitik | hayır | 5 | -0.7% | +2.1% | +4.8% | +9.0% | 60% |
| sok | hayır | 5 | -7.2% | -2.1% | -2.3% | +12.9% | 100% |
| tarife | hayır | 5 | +0.2% | -0.1% | +0.1% | +2.8% | 60% |
| derecelendirme | hayır | 4 | +1.3% | +0.4% | -1.8% | +0.6% | 50% |
| dusus | hayır | 3 | -1.6% | -1.0% | +6.9% | +5.0% | 67% |
| yukselis | hayır | 3 | +2.0% | +0.2% | +3.0% | +9.8% | 67% |
| butce_vergi | hayır | 2 | +0.2% | -0.9% | -1.0% | -4.4% | 0% |
| kur | hayır | 2 | +2.7% | +1.5% | +14.0% | +12.9% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 194 deneme. Al-tut Sharpe: eğitim 0.45, test 0.34.
Eğitimde seçilen kural: **fk > 2.55 ise nakde geç** (kantil 0.1). Eğitim Sharpe 1.91 → test Sharpe 0.6; testte nakitte kalma oranı 57%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -3.3%, test -0.2%.
Deflated Sharpe (deneme sayısı 194): 0.06 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.6% | 1.9 |
| haftanin_gunu | 1.0 | 143 | -0.3% | -1.7 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -1.6 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 1.7 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.6 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.7 |
| ay_donusu | 1.0 | 192 | +0.0% | 0.1 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.6 |
| bayram_oncesi | 1.0 | 6 | +1.5% | 1.9 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.5 |
| bayram_sonrasi | 1.0 | 6 | +2.5% | 1.2 |
| bilanco_sezonu | 0.0 | 423 | +0.1% | 0.7 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=0.0502, getiri_5g=0.0644, getiri_20g=-0.176, getiri_60g=-0.182, getiri_120g=-0.208, mom_12_1=0.262, zirve_52h_yakinlik=0.667, zirveden_dusus=-0.333, oynaklik_20g=0.622, oynaklik_60g=0.614, atr_20g_oran=0.0522, rsi_14=33.1, ma20_uzaklik=-0.115, ma50_uzaklik=-0.144, ma200_uzaklik=-0.152, hacim_z_20=-0.183, amihud_20g=0.335, devir_hizi_20g=0.0191, gece_ort_20g=-0.00501, gunici_ort_20g=-0.00586, aof_1g_sapma=0.0125, max_gunluk_20g=0.065, min_gunluk_20g=-0.103, ivol_60g=0.579, endekse_gore_1g=0.034, endekse_gore_20g=-0.127, endekse_gore_60g=-0.00601, beta_60g=0.673, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.219, piyasa_degeri_mn=2.26e+04, halka_aciklik=0.234, fk=7.93, kazanc_verimi=0.126, pd_dd=0.326, fd_favok=6.34, snak_verimi=0.0594, temettu_verimi=0, roe_ttm=0.0412, net_kar_marji=0.555, satis_buyume_yillik=-0.195, net_borc_ozkaynak=0.164, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1