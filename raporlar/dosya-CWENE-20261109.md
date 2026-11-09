# Hisse dosyası analizi — CWENE

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 306 (27 bağımsız bölüm); ≥%10 yükseliş 248 gün (31 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +230.4% (t=2.4), gün içi (açılış→kapanış) toplam -82.1% (t=-2.0).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| snak_verimi | -0.155 | -0.18 | +0.54 |
| fd_favok | 11.6 | 10.6 | +0.53 |
| devir_hizi_20g | 0.116 | 0.0586 | +0.51 |
| endekse_gore_60g | -0.0987 | -0.04 | -0.45 |
| kar_buyume_yillik | 0.784 | 0.988 | -0.41 |
| dolar_getiri_60g | -0.149 | 0.00235 | -0.40 |
| halka_aciklik | 0.291 | 0.291 | -0.40 |
| getiri_60g | -0.1 | 0.0399 | -0.39 |
| fk | 35.4 | 25.5 | +0.36 |
| ma200_uzaklik | -0.148 | 0.233 | -0.36 |
| getiri_120g | -0.157 | -0.00219 | -0.35 |
| ivol_60g | 0.454 | 0.392 | +0.34 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| satis_buyume_yillik | 0.0294 | -0.0397 | +0.75 |
| fd_favok | 10.2 | 11.4 | -0.66 |
| snak_verimi | -0.186 | -0.16 | -0.50 |
| fk | 26 | 34.8 | -0.48 |
| devir_hizi_20g | 0.0625 | 0.0813 | -0.43 |
| endekse_gore_60g | -0.000842 | -0.0824 | +0.39 |
| dolar_getiri_60g | 0.043 | -0.12 | +0.36 |
| getiri_60g | 0.0935 | -0.0692 | +0.35 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fd_favok | 644 | 617 |  | -0.42 | 0.000 | +4.9% | -10.4% | 33% | 72% | 6.58–8.77 | 12.4–15.2 |
| snak_verimi | 644 | 599 |  | -0.39 | 0.000 | +8.5% | -11.4% | 21% | 64% | -0.378–-0.227 | -0.14–-0.0445 |
| endekse_gore_60g | 634 | 634 |  | +0.29 | 0.000 | -8.8% | +3.9% | 67% | 24% | -0.492–-0.231 | 0.134–0.734 |
| devir_hizi_20g | 674 | 673 |  | -0.28 | 0.000 | -3.4% | -12.5% | 53% | 75% | 0.00652–0.0219 | 0.315–0.626 |
| dolar_getiri_60g | 634 | 634 |  | +0.28 | 0.000 | -4.8% | +4.9% | 47% | 24% | -0.576–-0.246 | 0.227–0.742 |
| pd_dd | 693 | 664 |  | -0.27 | 0.000 | +2.4% | -5.3% | 42% | 55% | 1.1–1.75 | 3.71–11 |
| getiri_60g | 634 | 632 |  | +0.28 | 0.000 | -5.0% | +5.2% | 48% | 25% | -0.556–-0.211 | 0.269–0.792 |
| oynaklik_60g | 633 | 633 |  | -0.27 | 0.000 | +7.8% | -9.5% | 33% | 57% | 0.258–0.398 | 0.586–0.775 |
| ivol_60g | 574 | 573 |  | -0.28 | 0.000 | +3.6% | -9.1% | 33% | 52% | 0.225–0.32 | 0.519–0.708 |
| endekse_gore_20g | 674 | 674 |  | +0.25 | 0.000 | -9.0% | +1.9% | 56% | 28% | -0.343–-0.118 | 0.0776–0.625 |
| kar_buyume_yillik | 527 | 8 | çeyreklik adım | +0.24 | 0.000 | -6.6% | +2.7% | 59% | 22% | -0.65–-0.323 | 4.55–4.55 |
| fk | 644 | 623 |  | -0.22 | 0.000 | -5.7% | -8.0% | 50% | 62% | 6.06–14.9 | 55.4–69.8 |
| kazanc_verimi | 644 | 578 |  | +0.22 | 0.000 | -8.0% | -5.7% | 62% | 50% | 0.0143–0.0181 | 0.0672–0.165 |
| piyasa_degeri_mn | 693 | 686 | seviye | -0.19 | 0.000 | +4.8% | -5.8% | 32% | 55% | 1.37e+04–1.88e+04 | 3.7e+04–5.05e+04 |
| xu100_ma200_uzaklik | 494 | 494 |  | +0.22 | 0.000 | -2.4% | +4.2% | 44% | 36% | -0.118–-0.0168 | 0.144–0.312 |
| atr_20g_oran | 673 | 665 |  | -0.19 | 0.000 | +0.3% | -10.2% | 52% | 54% | 0.0227–0.0356 | 0.0506–0.102 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.19 | 0.000 | -4.1% | -8.0% | 49% | 49% | 0.148–0.286 | 0.532–0.544 |
| halka_aciklik | 693 | 26 | seviye | +0.18 | 0.000 | -5.6% | +0.2% | 57% | 37% | 0.0491–0.232 | 0.357–0.382 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.1% | +0.6% | +1.8% | +3.6% | 57% |
| siyasi | hayır | 9 | -0.9% | +1.0% | +8.1% | +12.1% | 78% |
| enflasyon | hayır | 6 | +1.4% | +1.7% | +0.5% | +2.6% | 50% |
| jeopolitik | hayır | 5 | -3.4% | +0.2% | +0.6% | -0.0% | 80% |
| sok | hayır | 5 | -6.1% | -4.9% | -4.5% | -20.0% | 20% |
| tarife | hayır | 5 | +0.1% | -0.8% | -4.0% | -3.9% | 20% |
| derecelendirme | hayır | 4 | -0.7% | -0.8% | -2.3% | +3.4% | 75% |
| dusus | hayır | 3 | -0.9% | +0.6% | -2.4% | -0.7% | 67% |
| yukselis | hayır | 3 | +2.1% | -1.2% | +3.8% | +7.3% | 100% |
| butce_vergi | hayır | 2 | +2.5% | -3.2% | -4.9% | -9.4% | 0% |
| kur | hayır | 2 | +0.8% | -0.1% | +4.2% | +3.7% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 221 deneme. Al-tut Sharpe: eğitim -0.40, test 0.16.
Eğitimde seçilen kural: **gece_ort_20g > 0.001516 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.08 → test Sharpe -0.65; testte nakitte kalma oranı 41%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.3%, test +1.7%.
Deflated Sharpe (deneme sayısı 221): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 0.5 |
| haftanin_gunu | 1.0 | 143 | -0.1% | -0.3 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 1.4 |
| haftanin_gunu | 4.0 | 143 | -0.2% | -0.8 |
| ay_donusu | 0.0 | 522 | +0.0% | 0.1 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.5 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.2 |
| bayram_oncesi | 1.0 | 6 | -0.5% | -1.0 |
| bayram_sonrasi | 0.0 | 708 | -0.0% | -0.4 |
| bayram_sonrasi | 1.0 | 6 | +1.9% | 3.1 |
| bilanco_sezonu | 0.0 | 423 | -0.1% | -0.4 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=0.0127, getiri_5g=0.265, getiri_20g=-0.0392, getiri_60g=-0.505, getiri_120g=-0.512, mom_12_1=-0.235, zirve_52h_yakinlik=0.393, zirveden_dusus=-0.607, oynaklik_20g=0.746, oynaklik_60g=0.757, atr_20g_oran=0.0547, rsi_14=51.2, ma20_uzaklik=0.142, ma50_uzaklik=-0.179, ma200_uzaklik=-0.426, hacim_z_20=1.06, amihud_20g=0.141, devir_hizi_20g=0.041, gece_ort_20g=-0.000536, gunici_ort_20g=-0.000956, aof_1g_sapma=0.0263, max_gunluk_20g=0.117, min_gunluk_20g=-0.0677, ivol_60g=0.637, endekse_gore_1g=-0.00349, endekse_gore_20g=0.00989, endekse_gore_60g=-0.329, beta_60g=1.45, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.528, piyasa_degeri_mn=1.98e+04, halka_aciklik=0.383, fk=6.16, kazanc_verimi=0.162, pd_dd=1.12, fd_favok=6.65, snak_verimi=-0.151, temettu_verimi=0, roe_ttm=0.182, net_kar_marji=0.115, kar_buyume_yillik=0.784, satis_buyume_yillik=0.0977, net_borc_ozkaynak=0.532, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1