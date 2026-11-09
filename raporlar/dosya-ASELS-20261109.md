# Hisse dosyası analizi — ASELS

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 121 (24 bağımsız bölüm); ≥%10 yükseliş 315 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +865.5% (t=6.2), gün içi (açılış→kapanış) toplam -23.0% (t=-0.1).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 9.95e+05 | 6.01e+05 | +0.72 |
| fd_favok | 24.7 | 15.2 | +0.71 |
| pd_dd | 5.66 | 4.37 | +0.66 |
| fk | 40.6 | 31 | +0.62 |
| amihud_20g | 0.00332 | 0.00533 | -0.58 |
| kazanc_verimi | 0.0246 | 0.0322 | -0.58 |
| gece_ort_20g | 0.0045 | 0.00302 | +0.56 |
| beta_60g | 1.01 | 0.967 | +0.54 |
| roe_ttm | 0.138 | 0.134 | +0.51 |
| satis_buyume_yillik | 0.317 | 0.436 | -0.50 |
| net_kar_marji | 0.155 | 0.133 | +0.42 |
| net_borc_ozkaynak | 0.114 | 0.128 | -0.38 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| temettu_verimi | 0.000737 | 0.000564 | +0.61 |
| satis_buyume_yillik | 0.436 | 0.427 | +0.54 |
| beta_60g | 0.916 | 1.02 | -0.46 |
| devir_hizi_20g | 0.0218 | 0.0244 | -0.27 |
| getiri_20g | 0.0326 | 0.0706 | -0.27 |
| snak_verimi | 0.00429 | -0.00389 | +0.26 |
| xu100_getiri_20g | 0.0016 | 0.0256 | -0.25 |
| gunici_ort_20g | -9.34e-05 | 0.000316 | -0.25 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| beta_60g | 632 | 632 |  | -0.35 | 0.000 | +12.6% | +1.5% | 5% | 31% | 0.071–0.68 | 1.17–1.84 |
| temettu_verimi | 693 | 319 |  | +0.41 | 0.000 | +1.4% | +18.4% | 24% | 5% | 0–0.000574 | 0.000863–0.00192 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.33 | 0.000 | -0.8% | +15.1% | 33% | 8% | 0.15–0.23 | 0.909–0.909 |
| pd_dd | 692 | 665 |  | -0.24 | 0.000 | +6.1% | -1.2% | 1% | 37% | 1.9–2.66 | 5.81–8.47 |
| amihud_20g | 672 | 644 |  | +0.22 | 0.000 | +0.7% | +8.2% | 41% | 7% | 0.00158–0.00319 | 0.00853–0.0125 |
| gece_ort_20g | 672 | 644 |  | -0.20 | 0.000 | +9.3% | +2.4% | 10% | 30% | -0.00629–0.00108 | 0.00568–0.0134 |
| fd_favok | 643 | 626 |  | -0.20 | 0.000 | +2.0% | -3.0% | 15% | 44% | 6.32–8 | 24.6–29.6 |
| piyasa_degeri_mn | 692 | 662 | seviye | -0.19 | 0.000 | +7.0% | -0.8% | 1% | 41% | 2.13e+05–2.73e+05 | 1.52e+06–1.99e+06 |
| fk | 643 | 626 |  | -0.19 | 0.000 | +3.1% | -0.8% | 13% | 36% | 17.9–21.7 | 41.9–58.5 |
| kazanc_verimi | 643 | 581 |  | +0.19 | 0.000 | -0.8% | +3.1% | 36% | 13% | 0.0171–0.0238 | 0.0461–0.0559 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.18 | 0.000 | +0.8% | +11.9% | 40% | 11% | 0.0558–0.11 | 0.24–0.301 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.18 | 0.002 | +9.1% | +2.8% | 13% | 24% | -0.118–-0.0163 | 0.144–0.312 |
| devir_hizi_20g | 673 | 667 |  | -0.15 | 0.005 | +13.1% | +4.7% | 13% | 8% | 0.0134–0.0182 | 0.033–0.0546 |
| getiri_20g | 673 | 671 |  | -0.14 | 0.009 | +5.3% | +2.4% | 15% | 24% | -0.179–-0.0379 | 0.164–0.561 |
| xu100_getiri_20g | 673 | 671 |  | -0.14 | 0.018 | +7.2% | +2.3% | 14% | 15% | -0.166–-0.0409 | 0.0783–0.222 |
| snak_verimi | 643 | 574 |  | +0.14 | 0.026 | +6.8% | +11.4% | 15% | 19% | -0.0449–-0.0348 | 0.0126–0.0217 |
| ma200_uzaklik | 493 | 493 |  | -0.15 | 0.031 | +5.8% | -0.4% | 19% | 18% | -0.0295–0.187 | 0.636–0.939 |
| oynaklik_60g | 632 | 629 |  | -0.13 | 0.047 | +9.8% | +3.7% | 17% | 23% | 0.23–0.364 | 0.496–0.573 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| is_iliskisi | evet | 8 | -0.9% | -1.4% | -0.1% | +2.2% | 75% |
| bilanco | evet | 2 | +5.0% | -1.0% | -2.0% | +3.4% | 50% |
| temettu | evet | 2 | +2.8% | -0.9% | -0.7% | +17.3% | 50% |
| faiz | hayır | 41 | -0.2% | +0.7% | +1.7% | +6.1% | 63% |
| siyasi | hayır | 17 | +0.9% | +0.1% | +0.9% | +5.9% | 53% |
| derecelendirme | hayır | 15 | +0.1% | +0.8% | -0.5% | -1.2% | 33% |
| jeopolitik | hayır | 10 | +0.4% | -0.1% | +2.0% | +2.6% | 60% |
| enflasyon | hayır | 9 | +2.0% | -1.2% | +1.7% | +1.3% | 56% |
| regulasyon | hayır | 6 | +0.1% | -1.0% | +2.2% | +3.2% | 83% |
| haber | hayır | 5 | +0.4% | -0.3% | -2.0% | +2.4% | 40% |
| kuresel_faiz | hayır | 5 | +0.5% | +0.0% | +0.3% | +12.7% | 80% |
| sok | hayır | 5 | -3.4% | +2.7% | +5.2% | +7.9% | 100% |
| tarife | hayır | 5 | -0.9% | -0.8% | -0.3% | +4.9% | 80% |
| kur | hayır | 4 | -1.7% | +2.7% | +5.4% | +8.6% | 100% |
| dusus | hayır | 3 | -3.8% | +4.5% | -0.6% | +8.4% | 67% |
| yukselis | hayır | 3 | +1.4% | +2.9% | +2.8% | +12.0% | 100% |
| butce_vergi | hayır | 2 | +2.2% | -0.2% | +1.6% | +16.6% | 100% |
| YÖN: olumlu | evet | 12 | - | -1.3% | -0.5% | +3.8% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 193 deneme. Al-tut Sharpe: eğitim 2.39, test 1.18.
Eğitimde seçilen kural: **getiri_120g > 1.025 ise nakde geç** (kantil 0.8). Eğitim Sharpe 2.81 → test Sharpe 1.51; testte nakitte kalma oranı 8%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +4.9%, test -7.6%.
Deflated Sharpe (deneme sayısı 193): 0.48 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.3 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.4 |
| haftanin_gunu | 2.0 | 141 | +0.4% | 1.4 |
| haftanin_gunu | 3.0 | 143 | +0.7% | 3.2 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.6 |
| ay_donusu | 0.0 | 521 | +0.4% | 3.3 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.5 |
| bayram_oncesi | 0.0 | 708 | +0.3% | 3.2 |
| bayram_oncesi | 1.0 | 5 | -0.8% | -0.5 |
| bayram_sonrasi | 0.0 | 707 | +0.3% | 3.0 |
| bayram_sonrasi | 1.0 | 6 | +0.9% | 1.0 |
| bilanco_sezonu | 0.0 | 422 | +0.4% | 3.3 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.9 |

## Son durum (en yeni satır)

getiri_1g=0.0196, getiri_5g=-0.0131, getiri_20g=-0.0377, getiri_60g=-0.131, getiri_120g=-0.185, mom_12_1=0.852, zirve_52h_yakinlik=0.775, zirveden_dusus=-0.225, oynaklik_20g=0.533, oynaklik_60g=0.521, atr_20g_oran=0.0451, rsi_14=43.2, ma20_uzaklik=-0.0132, ma50_uzaklik=-0.0669, ma200_uzaklik=-0.0658, hacim_z_20=0.319, amihud_20g=0.00258, devir_hizi_20g=0.0258, gece_ort_20g=-0.00112, gunici_ort_20g=-0.000845, aof_1g_sapma=0.00137, max_gunluk_20g=0.0661, min_gunluk_20g=-0.0728, ivol_60g=0.373, endekse_gore_1g=-0.00311, endekse_gore_20g=0.00523, endekse_gore_60g=0.0403, beta_60g=1.3, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.17, piyasa_degeri_mn=1.54e+06, halka_aciklik=0.258, fk=31.7, kazanc_verimi=0.0315, pd_dd=4.6, fd_favok=20.9, snak_verimi=-0.016, temettu_verimi=0.000695, roe_ttm=0.145, net_kar_marji=0.191, kar_buyume_yillik=0.808, satis_buyume_yillik=0.342, net_borc_ozkaynak=0.165, bilancodan_gun=12.9, olay_sayi_5g=2, olay_yon_5g=0