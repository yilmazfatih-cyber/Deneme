# Hisse dosyası analizi — DOAS

Satır: 3978 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 176 (24 bağımsız bölüm); ≥%10 yükseliş 117 gün (15 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +142.6% (t=2.4), gün içi (açılış→kapanış) toplam -77.8% (t=-3.0).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_60g | 0.063 | -0.0803 | +0.77 |
| dolar_getiri_60g | 0.00279 | -0.109 | +0.74 |
| ma50_uzaklik | 0.00858 | -0.0486 | +0.63 |
| getiri_120g | 0.0209 | -0.148 | +0.61 |
| endekse_gore_60g | -0.0378 | -0.115 | +0.61 |
| ma200_uzaklik | -0.0287 | -0.0767 | +0.53 |
| rsi_14 | 49.7 | 43.1 | +0.50 |
| gunici_ort_20g | -0.00135 | -0.00254 | +0.46 |
| ivol_60g | 0.269 | 0.251 | +0.45 |
| oynaklik_60g | 0.334 | 0.302 | +0.42 |
| oynaklik_20g | 0.336 | 0.297 | +0.37 |
| ma20_uzaklik | 0.00393 | -0.0175 | +0.36 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| satis_buyume_yillik | -0.116 | 0.168 | -0.82 |
| pd_dd | 1.06 | 0.887 | +0.76 |
| net_kar_marji | 0.0445 | 0.0342 | +0.61 |
| max_gunluk_20g | 0.0293 | 0.0344 | -0.56 |
| aof_1g_sapma | 0.323 | 0.18 | +0.51 |
| oynaklik_20g | 0.261 | 0.315 | -0.49 |
| bilancodan_gun | 59 | 44.9 | +0.46 |
| usdtry_getiri_20g | 0.0177 | 0.0132 | +0.46 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ivol_60g | 573 | 571 |  | -0.29 | 0.000 | +4.7% | -4.7% | 2% | 46% | 0.16–0.208 | 0.323–0.517 |
| oynaklik_20g | 672 | 672 |  | -0.24 | 0.000 | +2.5% | -5.9% | 24% | 43% | 0.143–0.241 | 0.402–0.82 |
| oynaklik_60g | 632 | 631 |  | -0.25 | 0.000 | +3.7% | -4.4% | 11% | 41% | 0.208–0.27 | 0.488–0.656 |
| getiri_60g | 633 | 632 |  | -0.24 | 0.000 | -0.4% | -7.3% | 17% | 61% | -0.333–-0.177 | 0.0755–0.651 |
| dolar_getiri_60g | 633 | 632 |  | -0.23 | 0.000 | +0.0% | -6.7% | 16% | 60% | -0.367–-0.21 | 0.0312–0.536 |
| min_gunluk_20g | 672 | 64 |  | +0.21 | 0.000 | -2.8% | +0.1% | 36% | 16% | -0.15–-0.0627 | -0.0252–-0.0131 |
| mom_12_1 | 441 | 439 |  | -0.25 | 0.000 | +3.8% | -6.4% | 35% | 39% | -0.459–-0.273 | -0.00435–0.331 |
| bilancodan_gun | 693 | 303 | seviye | +0.19 | 0.000 | -3.9% | +1.7% | 29% | 28% | 0.917–19 | 79–113 |
| ma200_uzaklik | 493 | 493 |  | -0.20 | 0.000 | +0.7% | -6.6% | 21% | 54% | -0.257–-0.179 | 0.0144–0.28 |
| beta_60g | 632 | 632 |  | +0.16 | 0.003 | -4.9% | -3.0% | 39% | 38% | 0.141–0.543 | 0.908–1.28 |
| max_gunluk_20g | 672 | 69 |  | -0.15 | 0.004 | -2.6% | -5.3% | 35% | 45% | 0.0192–0.0265 | 0.0611–0.0986 |
| endekse_gore_60g | 633 | 633 |  | -0.14 | 0.014 | -1.0% | -4.9% | 19% | 48% | -0.502–-0.193 | 0.0262–0.462 |
| fd_favok | 643 | 607 |  | -0.13 | 0.030 | -2.8% | -7.5% | 15% | 43% | 1.68–2.25 | 4.41–5.08 |
| fk | 643 | 622 |  | -0.12 | 0.075 | -3.7% | -5.1% | 14% | 30% | 2.61–3.34 | 11.9–15.3 |
| kazanc_verimi | 643 | 578 |  | +0.12 | 0.075 | -5.1% | -3.7% | 30% | 14% | 0.0653–0.0837 | 0.3–0.383 |
| gece_ort_20g | 672 | 631 |  | +0.12 | 0.104 | -3.1% | +1.0% | 29% | 24% | -0.0106–-0.00166 | 0.00444–0.0104 |
| getiri_120g | 573 | 572 |  | -0.12 | 0.135 | -1.3% | -5.3% | 9% | 47% | -0.476–-0.227 | 0.0713–0.29 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.11 | 0.212 | -1.4% | -0.2% | 19% | 27% | 3.12e+04–4.52e+04 | 7.46e+04–1.36e+05 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.9% | -0.8% | -2.5% | -1.7% | 39% |
| siyasi | hayır | 9 | -0.5% | +0.3% | +0.4% | +2.0% | 33% |
| enflasyon | hayır | 6 | +0.8% | +0.8% | +1.1% | -2.2% | 33% |
| jeopolitik | hayır | 5 | -3.4% | -1.1% | -3.1% | -5.0% | 20% |
| sok | hayır | 5 | -3.8% | +1.5% | +2.2% | +1.1% | 60% |
| tarife | hayır | 5 | +1.9% | +1.6% | -0.7% | -8.0% | 20% |
| derecelendirme | hayır | 4 | +0.2% | -0.2% | -3.6% | -4.5% | 25% |
| dusus | hayır | 3 | -2.3% | +0.6% | -0.8% | -0.7% | 33% |
| yukselis | hayır | 3 | +2.1% | -1.5% | -1.6% | -4.1% | 0% |
| butce_vergi | hayır | 2 | -1.8% | -0.7% | -0.1% | +3.1% | 50% |
| kur | hayır | 2 | -1.1% | -1.0% | +0.4% | +2.1% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 190 deneme. Al-tut Sharpe: eğitim -0.30, test -0.56.
Eğitimde seçilen kural: **gunici_ort_20g > -0.00345 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.13 → test Sharpe 0.12; testte nakitte kalma oranı 54%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.9%, test -1.1%.
Deflated Sharpe (deneme sayısı 190): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.4% | -1.6 |
| haftanin_gunu | 1.0 | 142 | -0.3% | -1.4 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.5 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.6 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 1.1 |
| ay_donusu | 0.0 | 521 | -0.0% | -0.3 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.8 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.8 |
| bayram_oncesi | 1.0 | 5 | +1.9% | 2.3 |
| bayram_sonrasi | 0.0 | 707 | -0.1% | -0.6 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.2 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -1.1 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=0.0267, getiri_5g=0.0313, getiri_20g=-0.0428, getiri_60g=-0.194, getiri_120g=-0.239, mom_12_1=-0.209, zirve_52h_yakinlik=0.569, zirveden_dusus=-0.431, oynaklik_20g=0.6, oynaklik_60g=0.393, atr_20g_oran=0.0361, rsi_14=45.1, ma20_uzaklik=0.0169, ma50_uzaklik=-0.065, ma200_uzaklik=-0.247, hacim_z_20=1.72, amihud_20g=0.19, devir_hizi_20g=0.0133, gece_ort_20g=0.00192, gunici_ort_20g=-0.00414, aof_1g_sapma=0.00699, max_gunluk_20g=0.0995, min_gunluk_20g=-0.0999, ivol_60g=0.377, endekse_gore_1g=0.0105, endekse_gore_20g=0.00627, endekse_gore_60g=-0.0175, beta_60g=0.283, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.23, piyasa_degeri_mn=3.05e+04, halka_aciklik=0.395, fk=12.4, kazanc_verimi=0.0805, pd_dd=0.41, fd_favok=4.57, snak_verimi=-0.209, temettu_verimi=0.217, roe_ttm=0.033, net_kar_marji=0.0281, kar_buyume_yillik=-0.374, satis_buyume_yillik=-0.238, net_borc_ozkaynak=0.434, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1