# Hisse dosyası analizi — AHGAZ

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 128 (18 bağımsız bölüm); ≥%10 yükseliş 293 gün (24 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +114.2% (t=2.4), gün içi (açılış→kapanış) toplam +114.1% (t=1.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.47 | 0.333 | +0.81 |
| ivol_60g | 0.351 | 0.385 | -0.60 |
| temettu_verimi | 0 | 0 | -0.56 |
| min_gunluk_20g | -0.0388 | -0.0379 | -0.50 |
| oynaklik_60g | 0.375 | 0.402 | -0.47 |
| satis_buyume_yillik | 0.356 | 0.263 | +0.47 |
| endekse_gore_60g | -0.0153 | 0.0999 | -0.45 |
| fk | 18.7 | 17.3 | +0.43 |
| piyasa_degeri_mn | 6.68e+04 | 5.71e+04 | +0.36 |
| getiri_20g | -0.00505 | 0.0472 | -0.35 |
| max_gunluk_20g | 0.049 | 0.0571 | -0.34 |
| ma20_uzaklik | -0.00785 | 0.0193 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| mom_12_1 | 0.203 | 0.433 | -0.65 |
| pd_dd | 1.64 | 1.95 | -0.65 |
| fd_favok | 4.29 | 5.58 | -0.64 |
| ma200_uzaklik | 0.18 | 0.292 | -0.44 |
| dolar_getiri_60g | 0.0231 | 0.0872 | -0.39 |
| satis_buyume_yillik | 0.218 | 0.356 | -0.38 |
| getiri_120g | 0.208 | 0.366 | -0.37 |
| temettu_verimi | 0 | 0 | +0.35 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| temettu_verimi | 693 | 220 |  | +0.27 | 0.000 | +2.5% | +10.8% | 24% | 5% | 0–0.00069 | 0.00098–0.00172 |
| mom_12_1 | 441 | 441 |  | -0.33 | 0.000 | +15.0% | -1.2% | 1% | 48% | -0.112–0.135 | 0.858–1.57 |
| fd_favok | 643 | 638 |  | -0.25 | 0.000 | +12.7% | -2.5% | 3% | 31% | 2.62–3.72 | 6.44–7.95 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.22 | 0.000 | +5.3% | -1.4% | 13% | 34% | -0.249–-0.148 | 0.949–1.21 |
| pd_dd | 692 | 680 |  | -0.18 | 0.000 | +8.2% | +3.6% | 15% | 7% | 0.932–1.49 | 2.27–3.07 |
| getiri_120g | 573 | 573 |  | -0.20 | 0.000 | +5.4% | -2.9% | 23% | 37% | -0.321–-0.0105 | 0.502–1.07 |
| ma200_uzaklik | 493 | 493 |  | -0.18 | 0.002 | +4.7% | -0.9% | 22% | 20% | -0.217–-0.0259 | 0.369–0.592 |
| usdtry_getiri_20g | 672 | 664 |  | +0.15 | 0.003 | +3.7% | +5.5% | 21% | 9% | -0.013–0.00947 | 0.019–0.0482 |
| amihud_20g | 672 | 672 |  | +0.14 | 0.013 | +1.9% | +4.5% | 24% | 19% | 0.0453–0.11 | 0.259–0.454 |
| endekse_gore_60g | 633 | 633 |  | +0.14 | 0.021 | +0.2% | +2.6% | 31% | 12% | -0.436–-0.146 | 0.319–0.751 |
| kazanc_verimi | 643 | 593 |  | +0.13 | 0.045 | +0.5% | +6.0% | 27% | 13% | 0.0217–0.0396 | 0.13–0.177 |
| fk | 643 | 640 |  | -0.13 | 0.045 | +6.0% | +0.5% | 13% | 27% | 5.65–7.7 | 25.3–46 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.12 | 0.081 | +7.1% | +2.6% | 2% | 25% | 2.58e+04–3.65e+04 | 8.09e+04–1.26e+05 |
| gece_ort_20g | 672 | 627 |  | -0.11 | 0.164 | +3.7% | +1.1% | 26% | 18% | -0.00702–-0.000631 | 0.00319–0.00716 |
| devir_hizi_20g | 673 | 662 |  | -0.11 | 0.180 | +5.0% | +3.1% | 20% | 18% | 0.00295–0.00713 | 0.0177–0.0281 |
| ivol_60g | 573 | 572 |  | +0.12 | 0.187 | +3.1% | +6.9% | 28% | 10% | 0.258–0.342 | 0.426–0.483 |
| atr_20g_oran | 672 | 654 |  | -0.10 | 0.432 | +5.6% | +2.7% | 13% | 28% | 0.0171–0.0279 | 0.0392–0.0537 |
| beta_60g | 632 | 632 |  | -0.10 | 0.452 | +3.1% | +0.8% | 24% | 27% | -0.0274–0.263 | 0.644–0.992 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +1.1% | +1.0% | +0.9% | +4.9% | 56% |
| siyasi | hayır | 17 | +0.1% | -0.2% | -1.0% | -1.9% | 47% |
| derecelendirme | hayır | 15 | +0.2% | +0.6% | +0.9% | +4.5% | 47% |
| jeopolitik | hayır | 10 | +0.3% | -0.8% | +1.8% | +5.3% | 50% |
| enflasyon | hayır | 9 | +0.5% | +0.6% | +0.8% | +2.1% | 44% |
| regulasyon | hayır | 6 | +1.7% | +1.1% | -3.4% | +4.0% | 33% |
| haber | hayır | 5 | +0.6% | +3.5% | +4.1% | +16.7% | 60% |
| kuresel_faiz | hayır | 5 | +1.3% | -1.4% | -1.6% | +7.6% | 40% |
| sok | hayır | 5 | -3.2% | +2.6% | +11.6% | +27.2% | 100% |
| tarife | hayır | 5 | -0.1% | +0.3% | +2.7% | +5.1% | 40% |
| kur | hayır | 4 | +0.1% | +0.5% | +2.1% | -0.7% | 50% |
| dusus | hayır | 3 | -4.5% | +1.1% | -0.4% | +6.8% | 67% |
| yukselis | hayır | 3 | -1.3% | -0.9% | -3.4% | -7.6% | 0% |
| butce_vergi | hayır | 2 | -2.0% | -1.1% | +0.9% | -8.9% | 0% |
| YÖN: olumlu | evet | 1 | - | +2.2% | +9.4% | +30.7% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 234 deneme. Al-tut Sharpe: eğitim 1.92, test 0.99.
Eğitimde seçilen kural: **ma20_uzaklik > -0.004275 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.41 → test Sharpe -0.49; testte nakitte kalma oranı 54%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +4.2%, test +6.3%.
Deflated Sharpe (deneme sayısı 234): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.5 |
| haftanin_gunu | 1.0 | 142 | +0.3% | 1.3 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.1 |
| haftanin_gunu | 3.0 | 143 | +0.7% | 3.8 |
| haftanin_gunu | 4.0 | 143 | +0.5% | 2.4 |
| ay_donusu | 0.0 | 521 | +0.4% | 3.3 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.4 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 2.6 |
| bayram_oncesi | 1.0 | 5 | +0.5% | 0.7 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 2.6 |
| bayram_sonrasi | 1.0 | 6 | +0.2% | 0.3 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 2.0 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.6 |

## Son durum (en yeni satır)

getiri_1g=0.00599, getiri_5g=0.00945, getiri_20g=-0.0289, getiri_60g=0.373, getiri_120g=0.504, mom_12_1=0.726, zirve_52h_yakinlik=0.964, zirveden_dusus=-0.0357, oynaklik_20g=0.465, oynaklik_60g=0.413, atr_20g_oran=0.038, rsi_14=56, ma20_uzaklik=0.0158, ma50_uzaklik=0.0777, ma200_uzaklik=0.434, hacim_z_20=-1.3, amihud_20g=0.139, devir_hizi_20g=0.0115, gece_ort_20g=-0.000453, gunici_ort_20g=-0.000403, aof_1g_sapma=0.00979, max_gunluk_20g=0.062, min_gunluk_20g=-0.0697, ivol_60g=0.365, endekse_gore_1g=-0.0167, endekse_gore_20g=0.0141, endekse_gore_60g=0.544, beta_60g=0.677, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.311, piyasa_degeri_mn=1.22e+05, halka_aciklik=0.123, fk=20.9, kazanc_verimi=0.0479, pd_dd=2.04, fd_favok=5.45, snak_verimi=0.166, temettu_verimi=0.00123, roe_ttm=0.0976, net_kar_marji=0.152, kar_buyume_yillik=5.89, satis_buyume_yillik=0.263, net_borc_ozkaynak=-0.279, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0