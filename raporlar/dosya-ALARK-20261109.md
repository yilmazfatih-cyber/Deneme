# Hisse dosyası analizi — ALARK

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 186 (30 bağımsız bölüm); ≥%10 yükseliş 175 gün (26 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +153.2% (t=2.8), gün içi (açılış→kapanış) toplam -56.4% (t=-1.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ivol_60g | 0.305 | 0.222 | +0.51 |
| piyasa_degeri_mn | 4.5e+04 | 4.26e+04 | +0.50 |
| getiri_60g | 0.0578 | -0.0388 | +0.50 |
| ma200_uzaklik | 0.0446 | -0.0165 | +0.50 |
| satis_buyume_yillik | -0.124 | -0.0346 | -0.49 |
| getiri_120g | 0.103 | -0.0252 | +0.47 |
| dolar_getiri_60g | 0.00288 | -0.0736 | +0.45 |
| ma50_uzaklik | 0.00694 | -0.0232 | +0.43 |
| amihud_20g | 0.0344 | 0.0444 | -0.43 |
| devir_hizi_20g | 0.0355 | 0.0275 | +0.42 |
| oynaklik_60g | 0.35 | 0.341 | +0.38 |
| roe_ttm | 0.0759 | 0.0246 | +0.34 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 4.01e+04 | 4.42e+04 | -0.68 |
| amihud_20g | 0.0468 | 0.0396 | +0.63 |
| roe_ttm | 0.0193 | 0.0759 | -0.59 |
| mom_12_1 | -0.138 | 0 | -0.58 |
| dolar_getiri_60g | -0.144 | -0.021 | -0.58 |
| getiri_60g | -0.104 | 0.0247 | -0.57 |
| ma200_uzaklik | -0.0359 | 0.0196 | -0.56 |
| ivol_60g | 0.21 | 0.262 | -0.54 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 629 |  | -0.35 | 0.000 | +6.3% | -2.8% | 5% | 34% | -0.271–-0.136 | 0.114–0.495 |
| amihud_20g | 672 | 671 |  | +0.33 | 0.000 | -3.1% | +3.9% | 30% | 13% | 0.0109–0.0238 | 0.0522–0.0896 |
| dolar_getiri_60g | 633 | 632 |  | -0.35 | 0.000 | +6.8% | -2.8% | 6% | 33% | -0.284–-0.167 | 0.0656–0.407 |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.41 | 0.000 | +7.9% | -3.7% | 9% | 37% | 3.39e+04–3.95e+04 | 4.83e+04–6.72e+04 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.33 | 0.000 | +3.1% | -5.5% | 20% | 41% | -0.0164–0.0186 | 0.152–0.162 |
| ivol_60g | 573 | 569 |  | -0.33 | 0.000 | +6.8% | -3.7% | 10% | 47% | 0.161–0.199 | 0.315–0.403 |
| kazanc_verimi | 643 | 576 |  | -0.25 | 0.000 | +2.4% | -1.0% | 19% | 31% | -0.0368–0.0296 | 0.143–0.18 |
| ma200_uzaklik | 493 | 492 |  | -0.28 | 0.000 | +5.6% | -3.4% | 11% | 34% | -0.237–-0.11 | 0.0949–0.277 |
| getiri_120g | 573 | 573 |  | -0.22 | 0.000 | +3.1% | -4.4% | 15% | 47% | -0.4–-0.165 | 0.146–0.344 |
| devir_hizi_20g | 673 | 666 |  | -0.20 | 0.000 | +0.3% | -5.4% | 33% | 44% | 0.0163–0.0212 | 0.0437–0.0804 |
| pd_dd | 692 | 637 |  | -0.19 | 0.000 | +3.2% | +0.5% | 16% | 31% | 0.447–0.53 | 0.979–2.72 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.20 | 0.000 | -1.1% | +4.1% | 38% | 3% | -0.614–-0.277 | 0.263–2.41 |
| ma50_uzaklik | 643 | 643 |  | -0.20 | 0.000 | +5.2% | -3.3% | 2% | 38% | -0.16–-0.0834 | 0.0795–0.241 |
| mom_12_1 | 441 | 440 |  | -0.23 | 0.000 | +5.7% | -4.4% | 26% | 41% | -0.417–-0.2 | 0.188–0.476 |
| hacim_z_20 | 672 | 672 |  | +0.16 | 0.001 | -3.1% | +1.5% | 43% | 19% | -4.06–-0.865 | 0.705–18.6 |
| temettu_verimi | 693 | 466 |  | +0.16 | 0.002 | +1.6% | +3.5% | 27% | 18% | 0–0.00923 | 0.0308–0.0449 |
| oynaklik_60g | 632 | 628 |  | -0.16 | 0.002 | +2.2% | -4.2% | 21% | 47% | 0.237–0.304 | 0.391–0.506 |
| fd_favok | 499 | 494 |  | +0.17 | 0.010 | -4.9% | +0.7% | 38% | 30% | 10.2–14 | 192–290 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.2% | -0.0% | -0.2% | +0.7% | 35% |
| siyasi | hayır | 9 | -0.7% | +0.2% | +2.0% | +5.9% | 56% |
| enflasyon | hayır | 6 | +0.8% | +0.7% | -0.2% | -0.5% | 33% |
| jeopolitik | hayır | 5 | -2.1% | +0.0% | -2.2% | -2.1% | 40% |
| sok | hayır | 5 | -4.7% | +1.7% | +6.0% | +12.9% | 100% |
| tarife | hayır | 5 | +0.3% | +0.5% | -1.2% | -7.3% | 20% |
| derecelendirme | hayır | 4 | +0.2% | -0.9% | -0.5% | -2.3% | 50% |
| dusus | hayır | 3 | -1.0% | +1.3% | +7.1% | +11.0% | 100% |
| yukselis | hayır | 3 | +2.2% | +0.8% | +0.1% | +0.0% | 67% |
| butce_vergi | hayır | 2 | -2.4% | +1.4% | +0.0% | -7.0% | 0% |
| kur | hayır | 2 | +0.0% | +1.4% | +1.3% | -4.2% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 203 deneme. Al-tut Sharpe: eğitim 0.02, test 0.64.
Eğitimde seçilen kural: **dolar_getiri_60g > -0.154 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.95 → test Sharpe 1.97; testte nakitte kalma oranı 86%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -5.1%, test +0.8%.
Deflated Sharpe (deneme sayısı 203): 0.70 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.2 |
| haftanin_gunu | 1.0 | 142 | -0.2% | -0.9 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.3 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.9 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.5 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.6 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.1 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.4 |
| bayram_oncesi | 1.0 | 5 | +0.0% | 0.0 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.4 |
| bayram_sonrasi | 1.0 | 6 | +0.7% | 0.4 |
| bilanco_sezonu | 0.0 | 422 | -0.0% | -0.2 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.9 |

## Son durum (en yeni satır)

getiri_1g=-0.00786, getiri_5g=0.0716, getiri_20g=-0.0742, getiri_60g=-0.0242, getiri_120g=0.0466, mom_12_1=0.273, zirve_52h_yakinlik=0.863, zirveden_dusus=-0.137, oynaklik_20g=0.363, oynaklik_60g=0.394, atr_20g_oran=0.0342, rsi_14=50.2, ma20_uzaklik=-0.00903, ma50_uzaklik=-0.0448, ma200_uzaklik=-0.0106, hacim_z_20=-0.834, amihud_20g=0.0868, devir_hizi_20g=0.0172, gece_ort_20g=-0.00309, gunici_ort_20g=0.000494, aof_1g_sapma=0.0118, max_gunluk_20g=0.0473, min_gunluk_20g=-0.0486, ivol_60g=0.267, endekse_gore_1g=-0.024, endekse_gore_20g=-0.0251, endekse_gore_60g=0.152, beta_60g=1.05, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0684, piyasa_degeri_mn=4.21e+04, halka_aciklik=0.335, fk=6.07, kazanc_verimi=0.165, pd_dd=0.46, fd_favok=179, snak_verimi=0.0204, temettu_verimi=0.0315, roe_ttm=0.0759, net_kar_marji=1.2, satis_buyume_yillik=0.114, net_borc_ozkaynak=0.225, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1