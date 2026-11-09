# Hisse dosyası analizi — FROTO

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 164 (26 bağımsız bölüm); ≥%10 yükseliş 174 gün (23 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +163.4% (t=3.3), gün içi (açılış→kapanış) toplam -62.2% (t=-1.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | 0.0588 | -0.0616 | +0.80 |
| ma200_uzaklik | 0.049 | -0.0492 | +0.72 |
| fk | 8.05 | 7.02 | +0.68 |
| kazanc_verimi | 0.124 | 0.142 | -0.59 |
| max_gunluk_20g | 0.0506 | 0.0385 | +0.56 |
| dolar_getiri_60g | 0.00501 | -0.0918 | +0.56 |
| oynaklik_20g | 0.361 | 0.311 | +0.55 |
| getiri_60g | 0.057 | -0.0512 | +0.54 |
| xu100_ma200_uzaklik | 0.135 | 0.0598 | +0.53 |
| net_borc_ozkaynak | 0.646 | 0.715 | -0.52 |
| gece_ort_20g | 0.00255 | 0.00127 | +0.52 |
| piyasa_degeri_mn | 4.01e+05 | 3.64e+05 | +0.51 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| pd_dd | 3.64 | 2.75 | +0.92 |
| net_kar_marji | 0.057 | 0.0477 | +0.70 |
| temettu_verimi | 0.0377 | 0.0545 | -0.70 |
| gunici_ort_20g | 0.00113 | -0.00222 | +0.69 |
| bilancodan_gun | 61.9 | 38 | +0.66 |
| aof_1g_sapma | 0.122 | 0.102 | +0.65 |
| getiri_20g | 0.0553 | -0.0205 | +0.55 |
| ma20_uzaklik | 0.0225 | -0.0178 | +0.47 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fk | 644 | 627 |  | -0.32 | 0.000 | +2.7% | -5.8% | 14% | 52% | 4.63–5.77 | 8.19–10.7 |
| kazanc_verimi | 644 | 587 |  | +0.32 | 0.000 | -5.8% | +2.7% | 52% | 14% | 0.0936–0.122 | 0.173–0.216 |
| aof_1g_sapma | 693 | 691 |  | +0.26 | 0.000 | -5.5% | +4.1% | 37% | 17% | -0.0373–0.0177 | 0.137–0.208 |
| dolar_getiri_60g | 634 | 633 |  | -0.26 | 0.000 | +0.9% | -5.5% | 10% | 44% | -0.342–-0.187 | 0.0829–0.458 |
| getiri_60g | 634 | 632 |  | -0.26 | 0.000 | +0.7% | -5.8% | 11% | 46% | -0.316–-0.151 | 0.122–0.549 |
| max_gunluk_20g | 673 | 73 |  | -0.24 | 0.000 | +4.2% | -3.9% | 5% | 33% | 0.0119–0.0318 | 0.0538–0.0686 |
| bilancodan_gun | 694 | 303 | seviye | +0.24 | 0.000 | -4.0% | +2.5% | 32% | 19% | 0.917–19 | 79–113 |
| piyasa_degeri_mn | 693 | 692 | seviye | -0.23 | 0.000 | +0.2% | -5.2% | 20% | 47% | 2.58e+05–3.35e+05 | 4.14e+05–5.04e+05 |
| temettu_verimi | 694 | 545 |  | -0.23 | 0.000 | +3.2% | -5.1% | 17% | 35% | 0–0.0325 | 0.0912–0.132 |
| pd_dd | 693 | 668 |  | +0.21 | 0.000 | -5.4% | +2.2% | 35% | 29% | 1.44–1.99 | 4.4–11.5 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.20 | 0.000 | -2.0% | +2.7% | 39% | 9% | 0.616–0.636 | 1.1–1.1 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.21 | 0.000 | -5.4% | +2.7% | 37% | 9% | 0.198–0.239 | 0.832–0.832 |
| getiri_120g | 574 | 573 |  | -0.22 | 0.000 | -0.1% | -6.2% | 18% | 54% | -0.408–-0.148 | 0.0878–0.496 |
| atr_20g_oran | 673 | 661 |  | -0.19 | 0.000 | +4.1% | -2.0% | 4% | 29% | 0.0153–0.0234 | 0.0339–0.0465 |
| oynaklik_20g | 673 | 669 |  | -0.19 | 0.000 | +0.9% | -4.5% | 11% | 42% | 0.13–0.267 | 0.389–0.522 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.17 | 0.000 | -4.3% | +8.6% | 29% | 4% | 0.0206–0.0319 | 0.137–0.163 |
| gece_ort_20g | 673 | 637 |  | -0.17 | 0.001 | +0.9% | -3.8% | 12% | 38% | -0.00553–-0.000772 | 0.00371–0.00886 |
| ma200_uzaklik | 494 | 494 |  | -0.19 | 0.001 | -3.0% | -5.7% | 19% | 57% | -0.226–-0.123 | 0.064–0.374 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.3% | +0.0% | -0.4% | -2.3% | 26% |
| siyasi | hayır | 9 | -0.8% | +1.0% | +0.7% | -2.7% | 11% |
| enflasyon | hayır | 6 | +1.0% | +0.6% | -1.1% | -3.8% | 17% |
| jeopolitik | hayır | 5 | -1.5% | +0.2% | +0.8% | -3.2% | 40% |
| sok | hayır | 5 | -5.1% | +1.7% | +5.0% | +2.6% | 80% |
| tarife | hayır | 5 | +2.2% | -0.9% | -2.6% | -4.3% | 20% |
| derecelendirme | hayır | 4 | +0.4% | +1.0% | +1.2% | -0.0% | 50% |
| dusus | hayır | 3 | -1.2% | +2.2% | +1.3% | -3.4% | 0% |
| yukselis | hayır | 3 | +1.5% | +0.7% | +0.8% | -3.4% | 0% |
| butce_vergi | hayır | 2 | -0.7% | -0.7% | -1.5% | -4.7% | 0% |
| kur | hayır | 2 | -1.7% | +0.9% | +0.7% | -3.8% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 217 deneme. Al-tut Sharpe: eğitim 0.72, test -0.77.
Eğitimde seçilen kural: **beta_60g < 0.9335 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.58 → test Sharpe -1.08; testte nakitte kalma oranı 49%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.8%, test -0.3%.
Deflated Sharpe (deneme sayısı 217): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.0% | -0.1 |
| haftanin_gunu | 1.0 | 143 | -0.1% | -0.4 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.2 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.1 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.8 |
| ay_donusu | 1.0 | 192 | -0.1% | -1.0 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.2 |
| bayram_oncesi | 1.0 | 6 | +0.4% | 0.4 |
| bayram_sonrasi | 0.0 | 708 | +0.0% | 0.3 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.5 |
| bilanco_sezonu | 0.0 | 423 | -0.0% | -0.2 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.6 |

## Son durum (en yeni satır)

getiri_1g=0.013, getiri_5g=0.113, getiri_20g=-0.00669, getiri_60g=-0.0613, getiri_120g=-0.186, mom_12_1=-0.241, zirve_52h_yakinlik=0.552, zirveden_dusus=-0.448, oynaklik_20g=0.48, oynaklik_60g=0.369, atr_20g_oran=0.0356, rsi_14=56.4, ma20_uzaklik=0.0741, ma50_uzaklik=0.00232, ma200_uzaklik=-0.183, hacim_z_20=3.34, amihud_20g=0.0233, devir_hizi_20g=0.0232, gece_ort_20g=-0.00181, gunici_ort_20g=0.00144, aof_1g_sapma=0.0163, max_gunluk_20g=0.0827, min_gunluk_20g=-0.0491, ivol_60g=0.251, endekse_gore_1g=-0.00321, endekse_gore_20g=0.0424, endekse_gore_60g=0.115, beta_60g=0.961, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.104, piyasa_degeri_mn=2.61e+05, halka_aciklik=0.175, fk=7.35, kazanc_verimi=0.136, pd_dd=1.45, fd_favok=6.26, snak_verimi=0.182, temettu_verimi=0.131, roe_ttm=0.198, net_kar_marji=0.0206, kar_buyume_yillik=-0.442, satis_buyume_yillik=-0.138, net_borc_ozkaynak=0.625, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1