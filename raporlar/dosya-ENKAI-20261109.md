# Hisse dosyası analizi — ENKAI

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 87 (22 bağımsız bölüm); ≥%10 yükseliş 211 gün (35 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +293.6% (t=4.4), gün içi (açılış→kapanış) toplam -40.9% (t=-0.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| pd_dd | 1.39 | 1.29 | +0.89 |
| ma50_uzaklik | 0.0693 | 0.0214 | +0.65 |
| piyasa_degeri_mn | 5.08e+05 | 4.01e+05 | +0.59 |
| getiri_20g | 0.0716 | 0.0184 | +0.55 |
| xu100_ma200_uzaklik | 0.103 | 0.0655 | +0.53 |
| snak_verimi | 0.0393 | 0.0296 | +0.49 |
| roe_ttm | 0.114 | 0.0992 | +0.45 |
| gece_ort_20g | 0.00291 | 0.00176 | +0.44 |
| max_gunluk_20g | 0.0544 | 0.047 | +0.43 |
| fd_favok | 13.4 | 12 | +0.41 |
| endekse_gore_20g | 0.0338 | -0.000973 | +0.39 |
| ma20_uzaklik | 0.0299 | 0.00765 | +0.38 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| pd_dd | 1.25 | 1.35 | -0.72 |
| piyasa_degeri_mn | 3.27e+05 | 4.36e+05 | -0.58 |
| roe_ttm | 0.0927 | 0.102 | -0.53 |
| net_borc_ozkaynak | -0.135 | -0.131 | -0.51 |
| gunici_ort_20g | -0.0018 | 0.000121 | -0.47 |
| aof_1g_sapma | 0.0776 | 0.0455 | +0.47 |
| ma50_uzaklik | 0.0142 | 0.0487 | -0.40 |
| rsi_14 | 50.3 | 54 | -0.38 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pd_dd | 692 | 666 |  | -0.40 | 0.000 | +6.7% | -2.8% | 1% | 24% | 0.974–1.21 | 1.42–1.79 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.31 | 0.000 | +4.9% | -2.4% | 11% | 27% | 2.24e+05–2.88e+05 | 5.22e+05–6.7e+05 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.28 | 0.000 | +5.6% | +1.5% | 1% | 23% | 0.075–0.0884 | 0.116–0.117 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.26 | 0.000 | +4.8% | -4.1% | 10% | 25% | -0.157–-0.151 | -0.104–-0.104 |
| aof_1g_sapma | 692 | 691 |  | +0.24 | 0.000 | -3.2% | +3.4% | 29% | 14% | -0.0426–0.0166 | 0.093–0.15 |
| halka_aciklik | 692 | 31 | seviye | +0.23 | 0.000 | +1.0% | +3.9% | 16% | 15% | 0.0824–0.0827 | 0.0843–0.102 |
| max_gunluk_20g | 672 | 70 |  | -0.22 | 0.000 | +5.5% | -1.8% | 4% | 22% | 0.0161–0.0317 | 0.0676–0.101 |
| oynaklik_20g | 672 | 669 |  | -0.20 | 0.000 | +4.4% | -0.8% | 10% | 18% | 0.146–0.284 | 0.44–0.681 |
| gunici_ort_20g | 673 | 658 |  | -0.20 | 0.000 | +5.5% | -0.6% | 7% | 19% | -0.0114–-0.00367 | 0.00272–0.0105 |
| ma50_uzaklik | 643 | 641 |  | -0.20 | 0.000 | +3.4% | -1.3% | 5% | 23% | -0.112–-0.0328 | 0.0904–0.262 |
| oynaklik_60g | 632 | 630 |  | -0.18 | 0.000 | +5.1% | +0.7% | 6% | 9% | 0.214–0.321 | 0.422–0.544 |
| usdtry_getiri_20g | 672 | 664 |  | -0.17 | 0.001 | +4.6% | +1.7% | 3% | 16% | -0.013–0.00947 | 0.019–0.0482 |
| snak_verimi | 643 | 583 |  | -0.16 | 0.003 | +2.6% | -1.4% | 7% | 20% | 0.00992–0.0198 | 0.0418–0.0633 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.15 | 0.003 | +0.3% | +4.6% | 15% | 2% | 0.0953–0.161 | 0.33–0.339 |
| getiri_20g | 673 | 671 |  | -0.15 | 0.006 | +2.9% | -1.3% | 7% | 25% | -0.169–-0.0432 | 0.102–0.332 |
| ma20_uzaklik | 673 | 671 |  | -0.14 | 0.007 | +2.9% | -0.9% | 7% | 22% | -0.118–-0.032 | 0.0558–0.186 |
| endekse_gore_20g | 673 | 672 |  | -0.14 | 0.008 | +4.6% | +0.0% | 3% | 23% | -0.146–-0.0501 | 0.069–0.338 |
| min_gunluk_20g | 672 | 62 |  | +0.14 | 0.008 | -0.2% | +3.2% | 8% | 10% | -0.0835–-0.053 | -0.0293–-0.014 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.8% | +0.2% | +0.7% | +0.7% | 35% |
| siyasi | hayır | 9 | -0.1% | +1.3% | +1.5% | +3.0% | 56% |
| enflasyon | hayır | 6 | +1.3% | +0.6% | -1.2% | -1.2% | 33% |
| jeopolitik | hayır | 5 | -2.3% | -1.4% | -0.4% | +0.7% | 40% |
| sok | hayır | 5 | -4.4% | +2.2% | +7.8% | +6.1% | 100% |
| tarife | hayır | 5 | +4.1% | -0.7% | -1.6% | +1.3% | 60% |
| derecelendirme | hayır | 4 | +2.7% | +0.0% | +3.3% | +2.0% | 25% |
| dusus | hayır | 3 | -1.2% | +1.4% | +3.6% | -1.4% | 33% |
| yukselis | hayır | 3 | +3.2% | +0.9% | -1.3% | -2.6% | 0% |
| butce_vergi | hayır | 2 | -0.8% | -0.5% | -2.1% | -7.4% | 0% |
| kur | hayır | 2 | -2.3% | +0.4% | +0.1% | -1.2% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 218 deneme. Al-tut Sharpe: eğitim 1.42, test 0.32.
Eğitimde seçilen kural: **getiri_120g > 0.3204 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.43 → test Sharpe 0.78; testte nakitte kalma oranı 20%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.1%, test -1.3%.
Deflated Sharpe (deneme sayısı 218): 0.14 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.0% | -0.2 |
| haftanin_gunu | 1.0 | 142 | -0.2% | -1.2 |
| haftanin_gunu | 2.0 | 141 | +0.2% | 1.2 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 2.3 |
| haftanin_gunu | 4.0 | 143 | +0.4% | 2.0 |
| ay_donusu | 0.0 | 521 | +0.2% | 1.5 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.8 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.7 |
| bayram_oncesi | 1.0 | 5 | -0.4% | -0.6 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.7 |
| bayram_sonrasi | 1.0 | 6 | -0.4% | -0.3 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.1 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.2 |

## Son durum (en yeni satır)

getiri_1g=-0.0105, getiri_5g=0.00188, getiri_20g=-0.0403, getiri_60g=-0.0875, getiri_120g=-0.215, mom_12_1=0.0476, zirve_52h_yakinlik=0.714, zirveden_dusus=-0.286, oynaklik_20g=0.326, oynaklik_60g=0.364, atr_20g_oran=0.029, rsi_14=52.1, ma20_uzaklik=0.0195, ma50_uzaklik=-0.0394, ma200_uzaklik=-0.128, hacim_z_20=0.245, amihud_20g=0.0281, devir_hizi_20g=0.0175, gece_ort_20g=-0.000897, gunici_ort_20g=0.000613, aof_1g_sapma=0.00403, max_gunluk_20g=0.0432, min_gunluk_20g=-0.0268, ivol_60g=0.274, endekse_gore_1g=-0.0267, endekse_gore_20g=0.00883, endekse_gore_60g=0.0888, beta_60g=0.854, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.129, piyasa_degeri_mn=4.79e+05, halka_aciklik=0.0808, fk=10, kazanc_verimi=0.1, pd_dd=1.17, fd_favok=10.3, snak_verimi=0.0637, temettu_verimi=0.0368, roe_ttm=0.117, net_kar_marji=0.307, kar_buyume_yillik=0.285, satis_buyume_yillik=0.418, net_borc_ozkaynak=-0.104, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1