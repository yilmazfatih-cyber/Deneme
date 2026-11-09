# Hisse dosyası analizi — KCHOL

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 145 (25 bağımsız bölüm); ≥%10 yükseliş 199 gün (30 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +244.8% (t=4.1), gün içi (açılış→kapanış) toplam -56.9% (t=-1.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 5.16e+05 | 4.89e+05 | +0.76 |
| getiri_120g | 0.122 | 0.0255 | +0.67 |
| xu100_ma200_uzaklik | 0.104 | 0.0639 | +0.59 |
| satis_buyume_yillik | 0.228 | 0.0927 | +0.48 |
| xu100_getiri_20g | 0.0388 | 0.00497 | +0.48 |
| dolar_getiri_60g | 0.0232 | -0.035 | +0.47 |
| getiri_60g | 0.0504 | 0.00054 | +0.44 |
| ma50_uzaklik | 0.0133 | -0.00997 | +0.39 |
| rsi_14 | 52.7 | 49.6 | +0.37 |
| getiri_20g | 0.0387 | 0.00483 | +0.36 |
| mom_12_1 | 0.141 | 0.0227 | +0.34 |
| net_borc_ozkaynak | 1.08 | 1.24 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | -0.0928 | 0.0865 | -0.79 |
| mom_12_1 | -0.0597 | 0.0842 | -0.68 |
| ma200_uzaklik | -0.0365 | 0.0444 | -0.67 |
| piyasa_degeri_mn | 4.61e+05 | 5.01e+05 | -0.60 |
| satis_buyume_yillik | 0.0687 | 0.206 | -0.58 |
| snak_verimi | 0.0664 | -0.174 | +0.58 |
| kar_buyume_yillik | -1.14 | -0.764 | -0.52 |
| net_kar_marji | 0.0192 | 0.0134 | +0.47 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 692 | 686 | seviye | -0.38 | 0.000 | +6.3% | -3.3% | 6% | 39% | 3.55e+05–4.44e+05 | 5.42e+05–7.26e+05 |
| satis_buyume_yillik | 596 | 10 | çeyreklik adım | -0.32 | 0.000 | +4.0% | -4.2% | 14% | 45% | -0.541–0.0687 | 0.322–0.534 |
| getiri_120g | 573 | 573 |  | -0.29 | 0.000 | +4.2% | -5.0% | 10% | 51% | -0.332–-0.156 | 0.164–0.654 |
| beta_60g | 632 | 632 |  | +0.28 | 0.000 | +0.6% | +4.9% | 20% | 13% | 0.734–1.05 | 1.27–1.47 |
| mom_12_1 | 441 | 440 |  | -0.30 | 0.000 | +4.2% | -2.8% | 11% | 33% | -0.457–-0.169 | 0.235–0.447 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.22 | 0.000 | +0.1% | +3.2% | 24% | 12% | -0.0135–-0.00403 | 0.0288–0.102 |
| ma200_uzaklik | 493 | 493 |  | -0.20 | 0.000 | +4.2% | -2.3% | 17% | 37% | -0.24–-0.121 | 0.101–0.311 |
| dolar_getiri_60g | 633 | 633 |  | -0.17 | 0.001 | +1.8% | -0.4% | 16% | 37% | -0.328–-0.161 | 0.125–0.454 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.16 | 0.001 | +2.6% | +0.0% | 19% | 38% | -0.00502–-0.00472 | 0.184–0.216 |
| getiri_60g | 633 | 632 |  | -0.16 | 0.002 | +2.1% | -0.4% | 16% | 36% | -0.298–-0.123 | 0.166–0.521 |
| amihud_20g | 672 | 633 |  | +0.14 | 0.008 | -0.0% | +3.9% | 24% | 11% | 0.00164–0.00358 | 0.00605–0.00858 |
| xu100_getiri_20g | 673 | 671 |  | -0.13 | 0.031 | +2.2% | -1.1% | 9% | 31% | -0.166–-0.0409 | 0.0783–0.222 |
| usdtry_getiri_20g | 672 | 664 |  | +0.12 | 0.055 | +0.9% | +3.8% | 26% | 17% | -0.013–0.00947 | 0.019–0.0482 |
| zirve_52h_yakinlik | 573 | 494 |  | -0.13 | 0.124 | +4.0% | -2.0% | 17% | 32% | 0.512–0.659 | 0.911–1.06 |
| zirveden_dusus | 573 | 476 |  | -0.13 | 0.124 | +4.0% | -2.0% | 17% | 32% | -0.488–-0.341 | -0.0895–0 |
| oynaklik_60g | 632 | 630 |  | +0.12 | 0.152 | -0.1% | +3.4% | 31% | 9% | 0.22–0.306 | 0.399–0.52 |
| kar_buyume_yillik | 411 | 7 | çeyreklik adım | -0.14 | 0.172 | +1.6% | -1.3% | 17% | 2% | -1.68–-1.26 | 0.961–0.961 |
| pd_dd | 692 | 629 |  | -0.11 | 0.227 | +2.8% | -0.6% | 17% | 33% | 0.523–0.674 | 1.08–2.4 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bilanco | evet | 11 | -1.0% | +0.0% | +0.6% | +0.8% | 36% |
| temettu | evet | 6 | +1.0% | -0.5% | -0.5% | -0.7% | 50% |
| derecelendirme | evet | 4 | -0.3% | +0.3% | -0.0% | -3.6% | 25% |
| analist | evet | 3 | +0.7% | +1.2% | +2.8% | +3.3% | 67% |
| birlesme_devralma | evet | 3 | +1.6% | -1.4% | +1.3% | -0.7% | 67% |
| yonetim | evet | 3 | +1.6% | -0.0% | -0.6% | -2.8% | 0% |
| faiz | hayır | 41 | +0.4% | +0.4% | +0.2% | -0.8% | 41% |
| siyasi | hayır | 17 | -0.3% | +0.1% | +0.3% | -0.8% | 35% |
| derecelendirme | hayır | 16 | +0.3% | +0.0% | +0.5% | +2.3% | 62% |
| haber | hayır | 10 | +0.7% | -0.3% | +0.0% | -1.6% | 20% |
| jeopolitik | hayır | 10 | -0.8% | +0.1% | -0.5% | +2.1% | 60% |
| enflasyon | hayır | 9 | +1.1% | -0.1% | -0.0% | +0.1% | 22% |
| regulasyon | hayır | 8 | -0.2% | +0.5% | -0.5% | +1.1% | 75% |
| bilanco | hayır | 7 | -1.8% | -0.3% | -1.0% | +4.5% | 71% |
| kuresel_faiz | hayır | 5 | +1.0% | +0.5% | +0.9% | +1.7% | 40% |
| sok | hayır | 5 | -5.6% | +1.6% | +5.2% | +6.0% | 80% |
| tarife | hayır | 5 | +0.6% | -0.7% | -2.0% | -2.2% | 20% |
| birlesme_devralma | hayır | 4 | +1.6% | -1.7% | -3.7% | +0.8% | 25% |
| dusus | hayır | 4 | -2.0% | -0.2% | +0.2% | -1.1% | 50% |
| kur | hayır | 4 | -0.6% | +0.3% | +1.0% | +3.1% | 75% |
| yukselis | hayır | 4 | +1.8% | +0.9% | +0.2% | +4.5% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 177 deneme. Al-tut Sharpe: eğitim 0.58, test 0.56.
Eğitimde seçilen kural: **beta_60g < 1.25 ise nakde geç** (kantil 0.8). Eğitim Sharpe 2.34 → test Sharpe 0.05; testte nakitte kalma oranı 71%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.8%, test -0.1%.
Deflated Sharpe (deneme sayısı 177): 0.03 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.3% | 1.3 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.1 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.1 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.0 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.4 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.3 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 5 | -0.0% | -0.0 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | +0.4% | 0.5 |
| bilanco_sezonu | 0.0 | 422 | +0.0% | 0.3 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 1.0 |

## Son durum (en yeni satır)

getiri_1g=0.0272, getiri_5g=0.0818, getiri_20g=0.0183, getiri_60g=0.0232, getiri_120g=0.0607, mom_12_1=0.205, zirve_52h_yakinlik=0.939, zirveden_dusus=-0.0613, oynaklik_20g=0.33, oynaklik_60g=0.329, atr_20g_oran=0.0301, rsi_14=51.9, ma20_uzaklik=0.0433, ma50_uzaklik=0.00321, ma200_uzaklik=0.0449, hacim_z_20=1.35, amihud_20g=0.0045, devir_hizi_20g=0.0269, gece_ort_20g=-0.00441, gunici_ort_20g=0.00309, aof_1g_sapma=0.0131, max_gunluk_20g=0.0415, min_gunluk_20g=-0.0345, ivol_60g=0.199, endekse_gore_1g=0.00447, endekse_gore_20g=0.0613, endekse_gore_60g=0.194, beta_60g=0.931, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0232, piyasa_degeri_mn=5.36e+05, halka_aciklik=0.262, fk=14.1, kazanc_verimi=0.0708, pd_dd=0.677, fd_favok=7.03, snak_verimi=-0.507, temettu_verimi=0.0323, roe_ttm=0.0479, net_kar_marji=0.0288, kar_buyume_yillik=0.961, satis_buyume_yillik=0.206, net_borc_ozkaynak=1.45, bilancodan_gun=95.9, olay_sayi_5g=3, olay_yon_5g=1