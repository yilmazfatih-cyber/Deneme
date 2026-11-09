# Hisse dosyası analizi — BINHO

Satır: 3924 (gün sonu satırı 657) · 2024-03-21 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 342 (32 bağımsız bölüm); ≥%10 yükseliş 213 gün (21 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
657 günde gece (kapanış→açılış) toplam +445.8% (t=3.2), gün içi (açılış→kapanış) toplam -96.3% (t=-3.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| endekse_gore_60g | -0.0369 | -0.157 | +0.58 |
| getiri_60g | -0.0353 | -0.132 | +0.47 |
| dolar_getiri_60g | -0.0774 | -0.163 | +0.46 |
| fd_favok | 6.94 | 5.4 | +0.43 |
| oynaklik_20g | 0.564 | 0.498 | +0.37 |
| kar_buyume_yillik | -1.08 | -0.999 | -0.36 |
| ma50_uzaklik | -0.0183 | -0.0701 | +0.34 |
| fk | 5.57 | 6.03 | +0.32 |
| zirve_52h_yakinlik | 0.672 | 0.653 | +0.32 |
| zirveden_dusus | -0.328 | -0.347 | +0.32 |
| getiri_120g | -0.106 | -0.131 | +0.31 |
| halka_aciklik | 0.232 | 0.379 | -0.30 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fk | 5.97 | 6.61 | -0.61 |
| endekse_gore_60g | -0.203 | -0.07 | -0.59 |
| satis_buyume_yillik | -1 | -1 | +0.57 |
| usdtry_getiri_20g | 0.0142 | 0.0129 | +0.48 |
| zirveden_dusus | -0.36 | -0.31 | -0.45 |
| zirve_52h_yakinlik | 0.64 | 0.69 | -0.45 |
| getiri_120g | -0.129 | -0.1 | -0.42 |
| atr_20g_oran | 0.0444 | 0.0508 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| endekse_gore_60g | 577 | 576 |  | -0.34 | 0.000 | +4.9% | -13.3% | 38% | 78% | -0.478–-0.248 | 0.0623–0.676 |
| piyasa_degeri_mn | 636 | 635 | seviye | -0.36 | 0.000 | +7.7% | -6.6% | 30% | 57% | 7.33e+03–1.16e+04 | 1.71e+04–4.56e+05 |
| pd_dd | 636 | 606 |  | -0.31 | 0.000 | +4.9% | -7.5% | 25% | 59% | 0.511–0.789 | 1.23–31.5 |
| zirve_52h_yakinlik | 517 | 442 |  | -0.31 | 0.000 | +7.7% | -12.4% | 48% | 87% | 0.364–0.505 | 0.766–0.897 |
| zirveden_dusus | 517 | 442 |  | -0.31 | 0.000 | +7.7% | -12.4% | 48% | 87% | -0.636–-0.495 | -0.234–-0.103 |
| dolar_getiri_60g | 577 | 575 |  | -0.29 | 0.000 | +5.3% | -9.3% | 34% | 74% | -0.489–-0.236 | 0.0329–0.715 |
| getiri_60g | 577 | 577 |  | -0.29 | 0.000 | +5.6% | -9.2% | 33% | 73% | -0.466–-0.198 | 0.0754–0.804 |
| ma50_uzaklik | 587 | 586 |  | -0.28 | 0.000 | +1.1% | -8.2% | 43% | 76% | -0.403–-0.143 | 0.0735–0.529 |
| fd_favok | 428 | 414 |  | -0.30 | 0.000 | -2.6% | -7.3% | 47% | 78% | 3.38–4.54 | 8.14–298 |
| oynaklik_20g | 616 | 616 |  | -0.23 | 0.000 | -1.2% | -12.0% | 48% | 68% | 0.178–0.407 | 0.73–1.12 |
| ma200_uzaklik | 437 | 437 |  | -0.27 | 0.000 | +1.2% | -11.0% | 57% | 81% | -0.399–-0.256 | 0.0742–0.349 |
| atr_20g_oran | 616 | 612 |  | -0.21 | 0.000 | +1.2% | -12.9% | 51% | 65% | 0.0255–0.038 | 0.0617–0.108 |
| getiri_120g | 517 | 517 |  | -0.22 | 0.000 | +6.0% | -11.5% | 44% | 75% | -0.46–-0.328 | 0.141–0.591 |
| gece_ort_20g | 616 | 594 |  | -0.20 | 0.000 | +1.0% | -4.5% | 34% | 64% | -0.0189–2.3e-05 | 0.00748–0.0204 |
| rsi_14 | 622 | 613 |  | -0.18 | 0.000 | -4.3% | -6.8% | 50% | 67% | 22.3–37.3 | 57.6–83.6 |
| usdtry_getiri_20g | 616 | 608 |  | +0.16 | 0.003 | -5.6% | +6.0% | 59% | 37% | -0.013–0.00942 | 0.018–0.0464 |
| xu100_ma200_uzaklik | 437 | 437 |  | +0.18 | 0.007 | -9.8% | +0.0% | 60% | 35% | -0.118–-0.0113 | 0.153–0.312 |
| fk | 201 | 194 |  | -0.25 | 0.014 | +2.1% | -12.7% | 29% | 80% | 3.63–4.47 | 8.39–11 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.3% | -0.1% | -3.1% | -1.8% | 37% |
| siyasi | hayır | 17 | +0.2% | +0.5% | +0.4% | +2.9% | 59% |
| derecelendirme | hayır | 15 | +0.1% | +0.7% | -3.0% | -1.9% | 27% |
| jeopolitik | hayır | 10 | -0.6% | -0.4% | +0.7% | +0.2% | 50% |
| enflasyon | hayır | 9 | +1.4% | +0.1% | -0.9% | -12.7% | 22% |
| regulasyon | hayır | 6 | -0.7% | -1.6% | +1.9% | +0.9% | 67% |
| haber | hayır | 5 | -2.9% | +0.2% | +3.8% | -14.2% | 0% |
| kuresel_faiz | hayır | 5 | -2.3% | -4.7% | -2.8% | -19.7% | 0% |
| sok | hayır | 5 | -6.8% | -6.3% | -16.2% | -18.5% | 20% |
| tarife | hayır | 5 | +2.0% | -0.2% | -3.1% | -0.5% | 60% |
| kur | hayır | 4 | -1.8% | +3.2% | +5.1% | -5.0% | 50% |
| dusus | hayır | 3 | -2.0% | +1.9% | +2.4% | +17.5% | 100% |
| yukselis | hayır | 3 | +1.1% | -0.8% | -3.3% | +11.1% | 100% |
| butce_vergi | hayır | 2 | -2.8% | -0.9% | -1.1% | -12.6% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 394 gün, test 263 gün, 216 deneme. Al-tut Sharpe: eğitim -0.39, test -1.22.
Eğitimde seçilen kural: **endekse_gore_60g > -0.1868 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.15 → test Sharpe -1.08; testte nakitte kalma oranı 63%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -6.8%, test -5.2%.
Deflated Sharpe (deneme sayısı 216): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 133 | -0.3% | -0.7 |
| haftanin_gunu | 1.0 | 131 | -0.1% | -0.4 |
| haftanin_gunu | 2.0 | 129 | -0.8% | -2.3 |
| haftanin_gunu | 3.0 | 132 | +0.4% | 1.1 |
| haftanin_gunu | 4.0 | 132 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 479 | -0.1% | -0.4 |
| ay_donusu | 1.0 | 178 | -0.4% | -1.5 |
| bayram_oncesi | 0.0 | 651 | -0.2% | -1.2 |
| bayram_oncesi | 1.0 | 6 | +1.2% | 1.2 |
| bayram_sonrasi | 0.0 | 651 | -0.2% | -1.4 |
| bayram_sonrasi | 1.0 | 6 | +3.1% | 1.3 |
| bilanco_sezonu | 0.0 | 401 | -0.2% | -1.2 |
| bilanco_sezonu | 1.0 | 256 | -0.1% | -0.4 |

## Son durum (en yeni satır)

getiri_1g=0.0103, getiri_5g=0.214, getiri_20g=-0.358, getiri_60g=-0.611, getiri_120g=-0.583, mom_12_1=-0.502, zirve_52h_yakinlik=0.332, zirveden_dusus=-0.668, oynaklik_20g=0.817, oynaklik_60g=0.81, atr_20g_oran=0.0832, rsi_14=34.2, ma20_uzaklik=-0.0715, ma50_uzaklik=-0.391, ma200_uzaklik=-0.555, hacim_z_20=-0.351, amihud_20g=0.917, devir_hizi_20g=0.0307, gece_ort_20g=-0.0119, gunici_ort_20g=-0.00576, aof_1g_sapma=0.0152, max_gunluk_20g=0.0833, min_gunluk_20g=-0.1, ivol_60g=0.751, endekse_gore_1g=-0.00937, endekse_gore_20g=-0.313, endekse_gore_60g=-0.438, beta_60g=0.97, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.629, piyasa_degeri_mn=5.06e+03, halka_aciklik=0.378, kazanc_verimi=-0.94, pd_dd=0.353, snak_verimi=0.107, temettu_verimi=0, roe_ttm=-0.332, net_kar_marji=-inf, net_borc_ozkaynak=0.0134, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0