# Hisse dosyası analizi — OYAKC

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 199 (22 bağımsız bölüm); ≥%10 yükseliş 232 gün (24 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +155.7% (t=2.7), gün içi (açılış→kapanış) toplam -46.3% (t=-0.9).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fk | 11.4 | 10.4 | +0.63 |
| getiri_120g | 0.0894 | 0.00215 | +0.56 |
| fd_favok | 6.06 | 5.63 | +0.54 |
| zirveden_dusus | -0.179 | -0.252 | +0.51 |
| zirve_52h_yakinlik | 0.821 | 0.748 | +0.50 |
| usdtry_getiri_20g | 0.0149 | 0.0138 | +0.47 |
| kazanc_verimi | 0.0875 | 0.0958 | -0.46 |
| piyasa_degeri_mn | 1.09e+05 | 1.05e+05 | +0.45 |
| kar_buyume_yillik | -0.367 | 0.195 | -0.45 |
| oynaklik_20g | 0.376 | 0.355 | +0.40 |
| ma200_uzaklik | 0.0619 | -0.00922 | +0.39 |
| min_gunluk_20g | -0.0462 | -0.0395 | -0.39 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | 0.514 | 0.17 | +0.84 |
| amihud_20g | 0.0486 | 0.0452 | +0.71 |
| xu100_ma200_uzaklik | 0.016 | 0.0985 | -0.67 |
| satis_buyume_yillik | 0.341 | 0.205 | +0.60 |
| fk | 10.1 | 10.8 | -0.54 |
| roe_ttm | 0.234 | 0.199 | +0.52 |
| piyasa_degeri_mn | 1.02e+05 | 1.08e+05 | -0.52 |
| kazanc_verimi | 0.099 | 0.093 | +0.50 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fk | 644 | 619 |  | -0.37 | 0.000 | +6.2% | -5.9% | 25% | 57% | 6.07–8.91 | 12.3–17.7 |
| fd_favok | 644 | 612 |  | -0.34 | 0.000 | +6.5% | -3.4% | 22% | 46% | 4.39–5.36 | 6.5–8.93 |
| kazanc_verimi | 644 | 570 |  | +0.37 | 0.000 | -5.9% | +6.2% | 57% | 25% | 0.0565–0.0816 | 0.112–0.165 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.31 | 0.000 | -2.7% | +2.6% | 38% | 30% | 0.109–0.14 | 0.305–0.394 |
| piyasa_degeri_mn | 693 | 690 | seviye | -0.30 | 0.000 | +8.5% | -4.8% | 17% | 48% | 6.77e+04–8.42e+04 | 1.22e+05–1.66e+05 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.29 | 0.000 | -2.7% | +4.7% | 38% | 34% | -0.21–0.0746 | 0.395–0.395 |
| xu100_ma200_uzaklik | 494 | 494 |  | -0.31 | 0.000 | +2.5% | -5.1% | 37% | 47% | -0.118–-0.0168 | 0.144–0.312 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | +0.27 | 0.000 | +2.8% | +12.7% | 22% | 0% | -0.921–-0.575 | 2.63–2.63 |
| zirveden_dusus | 574 | 435 |  | -0.24 | 0.000 | +6.5% | +2.4% | 1% | 28% | -0.385–-0.287 | -0.0945–0 |
| zirve_52h_yakinlik | 574 | 467 |  | -0.24 | 0.000 | +6.5% | +2.4% | 1% | 28% | 0.615–0.713 | 0.906–1.06 |
| snak_verimi | 644 | 568 |  | -0.23 | 0.000 | +9.8% | +1.4% | 0% | 36% | -0.0804–-0.0351 | 0.0861–0.112 |
| usdtry_getiri_20g | 673 | 665 |  | -0.22 | 0.000 | +6.3% | -4.1% | 24% | 43% | -0.013–0.00945 | 0.019–0.0482 |
| getiri_60g | 634 | 629 |  | -0.22 | 0.000 | +6.7% | +0.1% | 9% | 33% | -0.357–-0.128 | 0.206–0.855 |
| amihud_20g | 653 | 648 |  | +0.21 | 0.000 | -2.5% | +7.0% | 37% | 25% | 0.0166–0.0312 | 0.0694–0.278 |
| max_gunluk_20g | 673 | 65 |  | -0.19 | 0.000 | +2.8% | -2.5% | 30% | 35% | 0.0185–0.036 | 0.0561–0.0999 |
| dolar_getiri_60g | 634 | 633 |  | -0.19 | 0.000 | +6.0% | +0.5% | 9% | 32% | -0.404–-0.163 | 0.169–0.791 |
| beta_60g | 633 | 633 |  | -0.16 | 0.004 | -0.9% | -2.9% | 35% | 31% | -0.0471–0.791 | 1.03–1.37 |
| ma200_uzaklik | 494 | 494 |  | -0.16 | 0.017 | +4.3% | +1.1% | 4% | 30% | -0.174–-0.104 | 0.185–0.651 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.6% | +0.4% | -1.0% | +0.9% | 43% |
| siyasi | hayır | 9 | -1.1% | +0.7% | +0.1% | +1.4% | 56% |
| enflasyon | hayır | 6 | +0.0% | -0.6% | +0.2% | -0.0% | 33% |
| jeopolitik | hayır | 5 | -2.3% | +0.2% | +0.0% | +1.2% | 80% |
| sok | hayır | 5 | -5.6% | +0.5% | +6.2% | +6.7% | 80% |
| tarife | hayır | 5 | +2.1% | -0.6% | -1.3% | -6.8% | 20% |
| derecelendirme | hayır | 4 | +0.1% | +0.8% | -0.4% | -2.8% | 25% |
| dusus | hayır | 3 | -1.0% | +0.4% | +1.3% | -2.9% | 33% |
| yukselis | hayır | 3 | +2.1% | +1.0% | +4.0% | +1.7% | 100% |
| butce_vergi | hayır | 2 | +1.3% | -1.4% | -2.9% | +0.3% | 50% |
| kur | hayır | 2 | -1.6% | +1.5% | +3.7% | +6.2% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 166 deneme. Al-tut Sharpe: eğitim 0.75, test -0.06.
Eğitimde seçilen kural: **fd_favok > 5.584 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.23 → test Sharpe 1.32; testte nakitte kalma oranı 50%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.0%, test -2.9%.
Deflated Sharpe (deneme sayısı 166): 0.29 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.5 |
| haftanin_gunu | 1.0 | 143 | -0.0% | -0.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.6 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 3.0 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 522 | +0.2% | 2.2 |
| ay_donusu | 1.0 | 192 | -0.4% | -2.0 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.8 |
| bayram_oncesi | 1.0 | 6 | -0.0% | -0.1 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.1 |
| bilanco_sezonu | 0.0 | 423 | +0.0% | 0.4 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.7 |

## Son durum (en yeni satır)

getiri_1g=0.0128, getiri_5g=0.0654, getiri_20g=-0.0455, getiri_60g=-0.0979, getiri_120g=-0.124, mom_12_1=-0.0789, zirve_52h_yakinlik=0.716, zirveden_dusus=-0.284, oynaklik_20g=0.34, oynaklik_60g=0.362, atr_20g_oran=0.032, rsi_14=49.9, ma20_uzaklik=0.0269, ma50_uzaklik=-0.0338, ma200_uzaklik=-0.12, hacim_z_20=0.756, amihud_20g=0.14, devir_hizi_20g=0.00737, gece_ort_20g=-0.00571, gunici_ort_20g=0.00384, aof_1g_sapma=0.0127, max_gunluk_20g=0.0412, min_gunluk_20g=-0.0332, ivol_60g=0.237, endekse_gore_1g=-0.00333, endekse_gore_20g=0.00362, endekse_gore_60g=0.0784, beta_60g=0.97, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.139, piyasa_degeri_mn=9.59e+04, halka_aciklik=0.193, fk=11.5, kazanc_verimi=0.0867, pd_dd=1.26, fd_favok=4.95, snak_verimi=0.103, temettu_verimi=0, roe_ttm=0.109, net_kar_marji=0.128, kar_buyume_yillik=-0.398, satis_buyume_yillik=-0.0565, net_borc_ozkaynak=-0.12, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1