# Hisse dosyası analizi — TOASO

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 219 (29 bağımsız bölüm); ≥%10 yükseliş 218 gün (26 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +184.4% (t=2.9), gün içi (açılış→kapanış) toplam -59.3% (t=-1.4).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| atr_20g_oran | 0.0367 | 0.0327 | +0.56 |
| gece_ort_20g | 0.00282 | 0.00191 | +0.53 |
| piyasa_degeri_mn | 1.42e+05 | 1.33e+05 | +0.42 |
| xu100_getiri_20g | -0.00476 | 0.0175 | -0.39 |
| getiri_120g | 0.0418 | -0.0184 | +0.39 |
| oynaklik_20g | 0.412 | 0.361 | +0.37 |
| endekse_gore_60g | 0.013 | -0.0545 | +0.37 |
| gunici_ort_20g | -0.0012 | -0.000435 | -0.34 |
| ma200_uzaklik | 0.0465 | 0.0518 | +0.32 |
| endekse_gore_20g | -0.00153 | -0.011 | +0.32 |
| net_borc_ozkaynak | 0.174 | 0.0697 | +0.31 |
| halka_aciklik | 0.241 | 0.241 | +0.28 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| gece_ort_20g | 0.00125 | 0.00245 | -0.51 |
| ivol_60g | 0.33 | 0.31 | +0.49 |
| roe_ttm | 0.111 | 0.23 | -0.43 |
| kazanc_verimi | 0.0678 | 0.104 | -0.43 |
| piyasa_degeri_mn | 1.33e+05 | 1.37e+05 | -0.42 |
| endekse_gore_60g | -0.0727 | -0.0157 | -0.40 |
| oynaklik_60g | 0.393 | 0.389 | +0.40 |
| mom_12_1 | 0.0898 | 0.182 | -0.37 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gece_ort_20g | 672 | 645 |  | -0.32 | 0.000 | +6.8% | -2.0% | 18% | 42% | -0.0106–-0.000731 | 0.00382–0.0102 |
| halka_aciklik | 692 | 9 | seviye | -0.36 | 0.000 | +6.3% | -6.7% | 5% | 53% | 0.24–0.241 | 0.241–0.245 |
| endekse_gore_60g | 633 | 633 |  | -0.28 | 0.000 | +3.7% | -3.9% | 28% | 52% | -0.309–-0.113 | 0.0595–0.321 |
| piyasa_degeri_mn | 692 | 657 | seviye | -0.26 | 0.000 | +6.4% | -4.9% | 22% | 46% | 8.13e+04–1.16e+05 | 1.59e+05–2.02e+05 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.27 | 0.000 | +3.4% | -6.8% | 23% | 51% | 0.0617–0.0644 | 0.64–0.64 |
| atr_20g_oran | 672 | 666 |  | -0.24 | 0.000 | +6.1% | -1.9% | 11% | 54% | 0.0213–0.0278 | 0.0395–0.0574 |
| pd_dd | 692 | 660 |  | -0.21 | 0.000 | +2.5% | -2.4% | 36% | 41% | 1.32–2.26 | 3.3–8.06 |
| endekse_gore_20g | 673 | 672 |  | -0.19 | 0.000 | +5.8% | -4.3% | 24% | 45% | -0.217–-0.0825 | 0.0674–0.388 |
| xu100_getiri_20g | 673 | 671 |  | +0.19 | 0.000 | -1.1% | +3.1% | 42% | 19% | -0.166–-0.0409 | 0.0783–0.222 |
| zirve_52h_yakinlik | 573 | 483 |  | -0.19 | 0.000 | +6.8% | -2.6% | 21% | 45% | 0.432–0.576 | 0.905–1.03 |
| zirveden_dusus | 573 | 464 |  | -0.19 | 0.000 | +6.8% | -2.6% | 21% | 45% | -0.568–-0.424 | -0.0949–0 |
| bilancodan_gun | 693 | 303 | seviye | -0.17 | 0.001 | +0.6% | -2.0% | 36% | 30% | 0.917–19 | 79–113 |
| ivol_60g | 573 | 573 |  | +0.18 | 0.001 | -1.6% | +0.8% | 37% | 34% | 0.23–0.289 | 0.353–0.473 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.16 | 0.001 | +6.1% | -2.3% | 27% | 34% | -0.0058–0.014 | 0.0834–0.141 |
| mom_12_1 | 441 | 441 |  | -0.17 | 0.011 | +5.8% | -2.2% | 34% | 44% | -0.482–-0.237 | 0.433–1.07 |
| oynaklik_60g | 632 | 632 |  | +0.14 | 0.012 | -5.4% | +4.1% | 48% | 31% | 0.273–0.348 | 0.443–0.616 |
| getiri_120g | 573 | 572 |  | -0.15 | 0.020 | +2.1% | -4.6% | 17% | 50% | -0.451–-0.169 | 0.28–0.791 |
| beta_60g | 632 | 631 |  | +0.14 | 0.024 | -4.0% | +3.7% | 39% | 20% | 0.518–0.759 | 1.13–1.42 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.5% | +0.3% | +1.2% | +1.3% | 61% |
| siyasi | hayır | 9 | +0.1% | +0.0% | +0.9% | -0.1% | 56% |
| enflasyon | hayır | 6 | +1.2% | +1.6% | -0.7% | -0.1% | 50% |
| jeopolitik | hayır | 5 | -2.4% | -0.3% | +0.5% | +1.3% | 60% |
| sok | hayır | 5 | -3.8% | +0.6% | +0.9% | +0.4% | 40% |
| tarife | hayır | 5 | +1.8% | -0.8% | +0.3% | -1.2% | 20% |
| derecelendirme | hayır | 4 | +0.2% | -0.2% | +1.4% | +2.3% | 75% |
| dusus | hayır | 3 | -2.5% | -1.1% | -2.4% | +1.1% | 67% |
| yukselis | hayır | 3 | +2.4% | +1.6% | +2.3% | +0.4% | 67% |
| butce_vergi | hayır | 2 | -0.3% | +0.5% | +3.4% | +6.2% | 100% |
| kur | hayır | 2 | -3.4% | +0.3% | +0.7% | -8.4% | 0% |
| YÖN: olumlu | evet | 1 | - | +9.6% | +10.9% | +14.3% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 195 deneme. Al-tut Sharpe: eğitim 0.47, test 0.04.
Eğitimde seçilen kural: **ivol_60g > 0.2711 ise nakde geç** (kantil 0.1). Eğitim Sharpe 1.70 → test Sharpe -1.0; testte nakitte kalma oranı 81%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.0%, test +1.4%.
Deflated Sharpe (deneme sayısı 195): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.1 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.6 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.1 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.4 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.3 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.6 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.6 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.4 |
| bayram_oncesi | 1.0 | 5 | +1.7% | 1.1 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.6 |
| bayram_sonrasi | 1.0 | 6 | -1.3% | -0.8 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.9 |
| bilanco_sezonu | 1.0 | 291 | -0.0% | -0.3 |

## Son durum (en yeni satır)

getiri_1g=0.00863, getiri_5g=0.108, getiri_20g=-0.0748, getiri_60g=-0.0835, getiri_120g=-0.189, mom_12_1=0.113, zirve_52h_yakinlik=0.711, zirveden_dusus=-0.289, oynaklik_20g=0.589, oynaklik_60g=0.461, atr_20g_oran=0.0411, rsi_14=51.5, ma20_uzaklik=0.0459, ma50_uzaklik=-0.0558, ma200_uzaklik=-0.148, hacim_z_20=4.15, amihud_20g=0.0383, devir_hizi_20g=0.0265, gece_ort_20g=-0.00213, gunici_ort_20g=-0.00216, aof_1g_sapma=0.0114, max_gunluk_20g=0.0935, min_gunluk_20g=-0.0778, ivol_60g=0.334, endekse_gore_1g=-0.00754, endekse_gore_20g=-0.0257, endekse_gore_60g=0.0928, beta_60g=1.13, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.125, piyasa_degeri_mn=1.23e+05, halka_aciklik=0.241, fk=8.43, kazanc_verimi=0.119, pd_dd=1.87, fd_favok=11.5, snak_verimi=-0.266, temettu_verimi=0.0815, roe_ttm=0.221, net_kar_marji=0.0309, kar_buyume_yillik=0.435, satis_buyume_yillik=0.135, net_borc_ozkaynak=0.903, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1