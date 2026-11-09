# Hisse dosyası analizi — KORDS

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 222 (33 bağımsız bölüm); ≥%10 yükseliş 174 gün (22 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +329.1% (t=3.9), gün içi (açılış→kapanış) toplam -84.8% (t=-2.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fk | 103 | 68 | +1.14 |
| kar_buyume_yillik | -0.00384 | -7.49 | +0.96 |
| getiri_120g | 0.038 | -0.172 | +0.90 |
| ma200_uzaklik | -0.00306 | -0.137 | +0.82 |
| mom_12_1 | -0.0502 | -0.245 | +0.76 |
| zirveden_dusus | -0.213 | -0.35 | +0.74 |
| zirve_52h_yakinlik | 0.787 | 0.65 | +0.73 |
| net_kar_marji | 0.00377 | -0.0333 | +0.73 |
| ivol_60g | 0.342 | 0.259 | +0.66 |
| piyasa_degeri_mn | 1.48e+04 | 1.26e+04 | +0.62 |
| oynaklik_20g | 0.397 | 0.353 | +0.56 |
| endekse_gore_20g | -0.00455 | -0.0447 | +0.55 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | -11.1 | -5.92 | -1.08 |
| snak_verimi | 0.303 | 0.113 | +0.86 |
| kazanc_verimi | -0.153 | -0.0644 | -0.81 |
| xu100_ma200_uzaklik | 0.121 | 0.0457 | +0.74 |
| roe_ttm | -0.0926 | -0.0461 | -0.68 |
| net_borc_ozkaynak | 0.901 | 1.02 | -0.67 |
| amihud_20g | 8.65 | 5.03 | +0.56 |
| bilancodan_gun | 59.5 | 42 | +0.47 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| net_kar_marji | 694 | 12 | çeyreklik adım | -0.29 | 0.000 | +6.3% | -2.8% | 11% | 44% | -0.0679–-0.0495 | 0.00621–0.0569 |
| kazanc_verimi | 644 | 597 |  | -0.26 | 0.000 | +2.4% | -0.2% | 16% | 16% | -0.218–-0.17 | 0.00975–0.0168 |
| piyasa_degeri_mn | 693 | 692 | seviye | -0.24 | 0.000 | +2.5% | -5.4% | 12% | 53% | 9.29e+03–1.09e+04 | 1.68e+04–2.24e+04 |
| snak_verimi | 644 | 619 |  | +0.25 | 0.000 | -4.3% | +3.3% | 29% | 26% | -0.067–0.0904 | 0.31–0.533 |
| xu100_getiri_20g | 674 | 672 |  | +0.21 | 0.000 | -1.5% | +5.2% | 36% | 24% | -0.166–-0.0409 | 0.0783–0.222 |
| pd_dd | 693 | 687 |  | -0.21 | 0.000 | +6.1% | +1.1% | 9% | 35% | 0.497–0.665 | 1.25–1.94 |
| amihud_20g | 653 | 653 |  | +0.22 | 0.000 | -1.8% | +4.2% | 44% | 9% | 0.0935–0.355 | 9.68–18.7 |
| roe_ttm | 644 | 11 | çeyreklik adım | -0.22 | 0.000 | +4.1% | -0.2% | 10% | 13% | -0.132–-0.129 | 0.0143–0.0163 |
| mom_12_1 | 442 | 441 |  | -0.26 | 0.000 | +3.0% | -3.9% | 12% | 62% | -0.462–-0.352 | 0.0821–0.736 |
| getiri_120g | 574 | 572 |  | -0.23 | 0.000 | -0.0% | -5.0% | 10% | 59% | -0.347–-0.226 | 0.183–0.814 |
| fk | 170 | 170 |  | -0.40 | 0.000 | +0.9% | -9.7% | 0% | 76% | 59.5–64.2 | 104–115 |
| xu100_ma200_uzaklik | 494 | 494 |  | +0.23 | 0.000 | -2.3% | +7.5% | 21% | 28% | -0.118–-0.0168 | 0.144–0.312 |
| halka_aciklik | 693 | 9 | seviye | +0.17 | 0.000 | -2.1% | -0.4% | 35% | 36% | 0.0221–0.286 | 0.286–0.291 |
| beta_60g | 633 | 633 |  | +0.18 | 0.000 | -5.8% | +1.8% | 47% | 28% | -0.0744–0.618 | 1.08–1.44 |
| ivol_60g | 574 | 574 |  | -0.18 | 0.000 | -1.4% | -7.4% | 38% | 63% | 0.13–0.203 | 0.378–0.732 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.17 | 0.002 | -0.6% | -1.8% | 34% | 9% | -0.12–0.00347 | 0.513–2.62 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | -0.15 | 0.003 | +2.7% | -7.8% | 33% | 52% | 0.804–0.883 | 1.14–1.14 |
| atr_20g_oran | 673 | 666 |  | -0.15 | 0.006 | +0.1% | -4.4% | 27% | 53% | 0.0181–0.024 | 0.0453–0.0834 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | -0.3% | -0.4% | -1.8% | -0.1% | 39% |
| siyasi | hayır | 9 | -1.7% | -0.6% | -3.4% | -6.1% | 33% |
| enflasyon | hayır | 6 | +0.8% | +0.2% | +3.3% | -0.6% | 17% |
| jeopolitik | hayır | 5 | -3.7% | -1.0% | +1.3% | +1.9% | 40% |
| sok | hayır | 5 | -8.7% | -3.2% | -9.0% | -7.0% | 20% |
| tarife | hayır | 5 | +0.8% | +0.1% | -0.3% | +1.8% | 40% |
| derecelendirme | hayır | 4 | +0.5% | -1.4% | -2.1% | +5.7% | 50% |
| dusus | hayır | 3 | -4.7% | -0.3% | -2.0% | -3.4% | 67% |
| yukselis | hayır | 3 | +2.8% | +0.2% | +1.7% | +5.5% | 100% |
| butce_vergi | hayır | 2 | -1.8% | -0.3% | -0.3% | -5.9% | 0% |
| kur | hayır | 2 | -1.3% | -2.1% | +0.3% | +5.5% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 215 deneme. Al-tut Sharpe: eğitim -0.11, test -0.17.
Eğitimde seçilen kural: **ma50_uzaklik > -0.06467 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.41 → test Sharpe -0.67; testte nakitte kalma oranı 63%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.1%, test +0.5%.
Deflated Sharpe (deneme sayısı 215): 0.01 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.3% | -1.3 |
| haftanin_gunu | 1.0 | 143 | -0.2% | -0.7 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.2 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 0.7 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 0.9 |
| ay_donusu | 0.0 | 522 | +0.0% | 0.3 |
| ay_donusu | 1.0 | 192 | -0.2% | -1.0 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.3 |
| bayram_oncesi | 1.0 | 6 | +0.4% | 1.6 |
| bayram_sonrasi | 0.0 | 708 | -0.0% | -0.2 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.2 |
| bilanco_sezonu | 0.0 | 423 | -0.1% | -0.8 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.0231, getiri_5g=0.122, getiri_20g=-0.128, getiri_60g=-0.449, getiri_120g=-0.446, mom_12_1=0.0817, zirve_52h_yakinlik=0.532, zirveden_dusus=-0.468, oynaklik_20g=0.564, oynaklik_60g=0.637, atr_20g_oran=0.0556, rsi_14=42, ma20_uzaklik=-0.00337, ma50_uzaklik=-0.167, ma200_uzaklik=-0.232, hacim_z_20=-0.178, amihud_20g=0.593, devir_hizi_20g=0.0255, gece_ort_20g=-0.00524, gunici_ort_20g=-0.00332, aof_1g_sapma=0.0156, max_gunluk_20g=0.0923, min_gunluk_20g=-0.0579, ivol_60g=0.519, endekse_gore_1g=0.0069, endekse_gore_20g=-0.0787, endekse_gore_60g=-0.273, beta_60g=1.4, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.474, piyasa_degeri_mn=9.83e+03, halka_aciklik=0.277, kazanc_verimi=-0.0814, pd_dd=0.566, fd_favok=7.75, snak_verimi=0.55, temettu_verimi=0, roe_ttm=-0.0461, net_kar_marji=0.0569, satis_buyume_yillik=0.292, net_borc_ozkaynak=0.883, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1