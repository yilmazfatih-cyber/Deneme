# Hisse dosyası analizi — TTKOM

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 135 (24 bağımsız bölüm); ≥%10 yükseliş 230 gün (35 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +430.0% (t=5.4), gün içi (açılış→kapanış) toplam -62.1% (t=-1.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 2.02e+05 | 1.78e+05 | +0.77 |
| gece_ort_20g | 0.00341 | 0.00243 | +0.61 |
| xu100_ma200_uzaklik | 0.119 | 0.054 | +0.54 |
| ma200_uzaklik | 0.0945 | 0.0431 | +0.53 |
| halka_aciklik | 0.133 | 0.133 | -0.44 |
| getiri_120g | 0.153 | 0.0672 | +0.41 |
| snak_verimi | 0.0798 | 0.108 | -0.39 |
| satis_buyume_yillik | 0.403 | 0.484 | -0.36 |
| zirve_52h_yakinlik | 0.908 | 0.865 | +0.35 |
| zirveden_dusus | -0.0921 | -0.135 | +0.34 |
| kazanc_verimi | 0.143 | 0.149 | -0.34 |
| amihud_20g | 0.0164 | 0.0213 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.73e+05 | 1.87e+05 | -0.64 |
| mom_12_1 | 0.237 | 0.136 | +0.59 |
| gece_ort_20g | 0.00211 | 0.00294 | -0.50 |
| net_kar_marji | 0.0917 | 0.0957 | +0.48 |
| getiri_120g | 0.0692 | 0.111 | -0.41 |
| ma200_uzaklik | 0.0271 | 0.0563 | -0.38 |
| gunici_ort_20g | -0.000825 | -0.00191 | +0.33 |
| oynaklik_60g | 0.368 | 0.369 | +0.32 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 692 | 676 | seviye | -0.40 | 0.000 | +10.0% | -3.7% | 6% | 42% | 8.74e+04–1.61e+05 | 2.05e+05–2.57e+05 |
| mom_12_1 | 441 | 441 |  | +0.33 | 0.000 | -3.2% | +5.0% | 31% | 12% | -0.167–0.0805 | 0.342–0.906 |
| gece_ort_20g | 672 | 624 |  | -0.27 | 0.000 | +3.9% | -2.0% | 7% | 39% | -0.00419–0.000912 | 0.00417–0.00929 |
| halka_aciklik | 692 | 15 | seviye | +0.24 | 0.000 | +1.5% | +11.3% | 20% | 6% | 0.13–0.133 | 0.133–0.139 |
| getiri_120g | 573 | 571 |  | -0.26 | 0.000 | +1.8% | -4.6% | 17% | 40% | -0.276–-0.0593 | 0.251–0.95 |
| ma200_uzaklik | 493 | 492 |  | -0.26 | 0.000 | +1.3% | -4.9% | 23% | 47% | -0.176–-0.0202 | 0.12–0.288 |
| amihud_20g | 672 | 659 |  | +0.22 | 0.000 | +0.9% | +4.7% | 21% | 14% | 0.00766–0.0129 | 0.026–0.044 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.23 | 0.000 | +2.5% | -2.2% | 17% | 39% | -0.118–-0.0163 | 0.144–0.312 |
| bilancodan_gun | 693 | 303 | seviye | -0.17 | 0.000 | +3.9% | -2.6% | 19% | 26% | 0.917–19 | 79–113 |
| zirveden_dusus | 573 | 449 |  | -0.17 | 0.002 | +1.7% | -2.9% | 22% | 41% | -0.324–-0.182 | -0.0608–0 |
| zirve_52h_yakinlik | 573 | 474 |  | -0.17 | 0.002 | +1.7% | -2.9% | 22% | 41% | 0.676–0.818 | 0.939–1.04 |
| snak_verimi | 643 | 573 |  | +0.15 | 0.005 | -0.3% | +4.4% | 33% | 9% | -0.194–0.0556 | 0.219–0.284 |
| pd_dd | 692 | 620 |  | -0.14 | 0.008 | +3.2% | +0.8% | 27% | 19% | 0.654–0.88 | 1.36–3.7 |
| beta_60g | 632 | 632 |  | +0.14 | 0.031 | -0.5% | +2.6% | 26% | 30% | 0.663–0.893 | 1.21–1.45 |
| getiri_60g | 633 | 629 |  | +0.13 | 0.036 | +0.5% | +1.8% | 13% | 24% | -0.202–-0.0829 | 0.198–0.771 |
| xu100_getiri_20g | 673 | 671 |  | -0.13 | 0.043 | +2.8% | -0.2% | 16% | 25% | -0.166–-0.0409 | 0.0783–0.222 |
| dolar_getiri_60g | 633 | 633 |  | +0.13 | 0.060 | +0.1% | +1.8% | 17% | 23% | -0.238–-0.12 | 0.148–0.755 |
| endekse_gore_60g | 633 | 633 |  | +0.12 | 0.135 | +0.8% | +2.4% | 17% | 17% | -0.273–-0.112 | 0.141–0.555 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.6% | -0.8% | -1.1% | +0.9% | 57% |
| siyasi | hayır | 9 | -1.1% | -0.9% | -1.8% | -3.7% | 33% |
| enflasyon | hayır | 6 | +0.6% | -0.6% | -1.8% | -2.4% | 17% |
| jeopolitik | hayır | 5 | -1.7% | +1.1% | -2.2% | -3.0% | 20% |
| sok | hayır | 5 | -7.6% | -0.9% | +3.7% | +9.2% | 100% |
| tarife | hayır | 5 | +1.3% | +0.5% | +0.1% | +1.5% | 40% |
| derecelendirme | hayır | 4 | +1.4% | +0.6% | -4.2% | -4.1% | 25% |
| dusus | hayır | 4 | -2.1% | -0.2% | +0.6% | +1.4% | 50% |
| yukselis | hayır | 3 | +2.2% | +0.8% | -1.8% | -10.3% | 0% |
| butce_vergi | hayır | 2 | -0.7% | -0.5% | -0.5% | +0.1% | 50% |
| kur | hayır | 2 | -1.4% | -1.1% | -2.2% | -5.1% | 0% |
| YÖN: olumlu | evet | 1 | - | +0.6% | +5.2% | +3.7% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 204 deneme. Al-tut Sharpe: eğitim 1.32, test -0.01.
Eğitimde seçilen kural: **rsi_14 > 47.67 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.83 → test Sharpe 0.62; testte nakitte kalma oranı 53%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +1.8%, test -0.5%.
Deflated Sharpe (deneme sayısı 204): 0.16 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.2 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.6 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.5 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.4 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.4 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.5 |
| ay_donusu | 1.0 | 192 | +0.0% | 0.0 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.3 |
| bayram_oncesi | 1.0 | 5 | +0.4% | 1.1 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.3 |
| bayram_sonrasi | 1.0 | 6 | +0.6% | 0.5 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.5 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0274, getiri_5g=0.0483, getiri_20g=-0.0512, getiri_60g=-0.0938, getiri_120g=-0.197, mom_12_1=-0.0652, zirve_52h_yakinlik=0.675, zirveden_dusus=-0.325, oynaklik_20g=0.302, oynaklik_60g=0.442, atr_20g_oran=0.0328, rsi_14=43.1, ma20_uzaklik=0.00504, ma50_uzaklik=-0.0425, ma200_uzaklik=-0.16, hacim_z_20=0.887, amihud_20g=0.0205, devir_hizi_20g=0.0362, gece_ort_20g=-0.00505, gunici_ort_20g=0.00117, aof_1g_sapma=-0.000871, max_gunluk_20g=0.0261, min_gunluk_20g=-0.0428, ivol_60g=0.309, endekse_gore_1g=0.0112, endekse_gore_20g=-0.00208, endekse_gore_60g=0.0825, beta_60g=1.12, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.135, piyasa_degeri_mn=1.73e+05, halka_aciklik=0.131, fk=5.4, kazanc_verimi=0.185, pd_dd=0.653, fd_favok=2.33, snak_verimi=-0.194, temettu_verimi=0, roe_ttm=0.121, net_kar_marji=0.0866, kar_buyume_yillik=-0.031, satis_buyume_yillik=0.0925, net_borc_ozkaynak=0.45, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1