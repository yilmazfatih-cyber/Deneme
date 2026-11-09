# Hisse dosyası analizi — TRALT

Satır: 2287 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 207 (39 bağımsız bölüm); ≥%10 yükseliş 271 gün (36 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +504.3% (t=4.6), gün içi (açılış→kapanış) toplam -66.5% (t=-1.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.35e+05 | 7.68e+04 | +0.88 |
| oynaklik_60g | 0.568 | 0.452 | +0.79 |
| oynaklik_20g | 0.559 | 0.427 | +0.78 |
| mom_12_1 | 0.876 | 0.216 | +0.77 |
| ivol_60g | 0.466 | 0.384 | +0.73 |
| devir_hizi_20g | 0.0962 | 0.112 | -0.72 |
| max_gunluk_20g | 0.0674 | 0.051 | +0.69 |
| atr_20g_oran | 0.0469 | 0.0392 | +0.62 |
| beta_60g | 1.17 | 0.967 | +0.59 |
| snak_verimi | 0.0405 | 0.0494 | -0.57 |
| halka_aciklik | 0.296 | 0.296 | -0.51 |
| ma200_uzaklik | 0.196 | 0.0495 | +0.49 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.125 | 0.0954 | +0.96 |
| kar_buyume_yillik | 1.33 | -0.21 | +0.81 |
| roe_ttm | 0.094 | 0.0517 | +0.58 |
| kazanc_verimi | 0.0351 | 0.0225 | +0.57 |
| gece_ort_20g | 0.0034 | 0.00241 | +0.55 |
| halka_aciklik | 0.296 | 0.296 | +0.49 |
| net_borc_ozkaynak | -0.111 | -0.0418 | -0.46 |
| fk | 28 | 40 | -0.43 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| devir_hizi_20g | 219 | 219 |  | +0.57 | 0.000 | -8.6% | +12.9% | 73% | 11% | 0.0606–0.0912 | 0.136–0.185 |
| kazanc_verimi | 643 | 582 |  | +0.34 | 0.000 | -3.1% | +11.1% | 50% | 16% | -0.00765–0.0093 | 0.0369–0.0465 |
| fk | 579 | 579 |  | -0.35 | 0.000 | +11.7% | -0.7% | 16% | 34% | 21.5–26.7 | 96.6–137 |
| halka_aciklik | 219 | 18 | seviye | +0.67 | 0.000 | -12.3% | +16.8% | 82% | 9% | 0.248–0.296 | 0.299–0.299 |
| beta_60g | 632 | 632 |  | -0.26 | 0.000 | +6.5% | +0.1% | 12% | 49% | 0.336–0.857 | 1.33–1.77 |
| gece_ort_20g | 672 | 647 |  | +0.24 | 0.000 | -2.2% | +6.7% | 40% | 24% | -0.00989–0.000628 | 0.00487–0.0168 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.23 | 0.000 | +7.0% | -4.2% | 3% | 64% | 6.07e+04–7.24e+04 | 1.48e+05–1.98e+05 |
| max_gunluk_20g | 672 | 68 |  | -0.24 | 0.000 | +5.6% | -0.8% | 5% | 48% | 0.0155–0.0405 | 0.083–0.108 |
| snak_verimi | 643 | 586 |  | +0.24 | 0.000 | -6.6% | +1.9% | 50% | 29% | 0.0087–0.0249 | 0.0558–0.0867 |
| oynaklik_20g | 672 | 671 |  | -0.23 | 0.000 | +5.9% | -1.6% | 6% | 49% | 0.202–0.337 | 0.612–0.785 |
| oynaklik_60g | 632 | 630 |  | -0.23 | 0.000 | +7.9% | -1.2% | 9% | 49% | 0.313–0.382 | 0.595–0.69 |
| atr_20g_oran | 672 | 660 |  | -0.21 | 0.000 | +4.0% | -1.6% | 10% | 47% | 0.0215–0.0333 | 0.0506–0.0753 |
| kar_buyume_yillik | 326 | 6 | çeyreklik adım | +0.26 | 0.000 | -2.7% | +0.1% | 55% | 49% | -1.06–-0.947 | 1.63–1.63 |
| min_gunluk_20g | 672 | 64 |  | +0.18 | 0.000 | -3.7% | +0.7% | 46% | 27% | -0.101–-0.0812 | -0.0372–-0.0194 |
| ivol_60g | 573 | 572 |  | -0.19 | 0.000 | +9.1% | +0.7% | 7% | 48% | 0.243–0.309 | 0.511–0.629 |
| mom_12_1 | 441 | 441 |  | -0.20 | 0.001 | +3.6% | -6.6% | 19% | 62% | -0.204–0.0612 | 0.967–1.6 |
| roe_ttm | 643 | 11 | çeyreklik adım | +0.16 | 0.002 | -2.6% | +4.8% | 50% | 37% | -0.0187–0.0204 | 0.119–0.119 |
| bilancodan_gun | 693 | 279 | seviye | +0.15 | 0.002 | +1.0% | +3.3% | 37% | 21% | 0.917–19 | 80–113 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.5% | -1.1% | -0.0% | +5.2% | 61% |
| siyasi | hayır | 9 | -1.2% | +1.3% | +2.5% | +9.2% | 89% |
| enflasyon | hayır | 6 | +1.7% | -1.2% | +4.3% | +5.3% | 50% |
| jeopolitik | hayır | 5 | -2.1% | -3.6% | -5.7% | -15.7% | 0% |
| sok | hayır | 5 | -5.3% | +1.6% | +5.6% | +3.6% | 60% |
| tarife | hayır | 5 | +0.3% | +2.2% | +3.2% | -1.4% | 60% |
| derecelendirme | hayır | 4 | +2.6% | -1.6% | -5.7% | -0.6% | 50% |
| dusus | hayır | 3 | -1.0% | +1.3% | +3.4% | +5.1% | 67% |
| yukselis | hayır | 3 | +3.4% | -0.5% | -4.3% | -14.9% | 0% |
| butce_vergi | hayır | 2 | +1.6% | -3.7% | -4.4% | +0.2% | 50% |
| kur | hayır | 2 | -5.8% | -1.9% | +0.1% | -12.7% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 223 deneme. Al-tut Sharpe: eğitim 0.53, test 0.98.
Eğitimde seçilen kural: **rsi_14 > 43.84 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.40 → test Sharpe -0.07; testte nakitte kalma oranı 78%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.1%, test +5.1%.
Deflated Sharpe (deneme sayısı 223): 0.02 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.4 |
| haftanin_gunu | 1.0 | 142 | -0.2% | -0.8 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.0 |
| haftanin_gunu | 3.0 | 143 | +0.9% | 3.4 |
| haftanin_gunu | 4.0 | 143 | +0.4% | 1.6 |
| ay_donusu | 0.0 | 521 | +0.3% | 2.1 |
| ay_donusu | 1.0 | 192 | -0.2% | -1.0 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.3 |
| bayram_oncesi | 1.0 | 5 | -1.1% | -0.5 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.3 |
| bayram_sonrasi | 1.0 | 6 | -0.7% | -1.1 |
| bilanco_sezonu | 0.0 | 422 | +0.0% | 0.0 |
| bilanco_sezonu | 1.0 | 291 | +0.4% | 1.8 |

## Son durum (en yeni satır)

getiri_1g=0.0452, getiri_5g=0.162, getiri_20g=-0.0935, getiri_60g=-0.16, getiri_120g=-0.159, mom_12_1=0.545, zirve_52h_yakinlik=0.65, zirveden_dusus=-0.35, oynaklik_20g=0.698, oynaklik_60g=0.591, atr_20g_oran=0.0534, rsi_14=44.8, ma20_uzaklik=0.0281, ma50_uzaklik=-0.113, ma200_uzaklik=-0.168, hacim_z_20=0.46, amihud_20g=0.0148, devir_hizi_20g=0.0792, gece_ort_20g=-0.00501, gunici_ort_20g=0.000598, aof_1g_sapma=0.00643, max_gunluk_20g=0.0756, min_gunluk_20g=-0.1, ivol_60g=0.407, endekse_gore_1g=0.029, endekse_gore_20g=-0.0444, endekse_gore_60g=0.0165, beta_60g=1.52, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.198, piyasa_degeri_mn=1.27e+05, halka_aciklik=0.245, fk=23.3, kazanc_verimi=0.0428, pd_dd=2.4, fd_favok=13, snak_verimi=0.0125, temettu_verimi=0.0126, roe_ttm=0.103, net_kar_marji=0.236, kar_buyume_yillik=-0.21, satis_buyume_yillik=0.292, net_borc_ozkaynak=-0.104, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1