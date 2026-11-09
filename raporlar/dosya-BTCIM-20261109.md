# Hisse dosyası analizi — BTCIM

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 258 (29 bağımsız bölüm); ≥%10 yükseliş 215 gün (31 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +71.0% (t=1.4), gün içi (açılış→kapanış) toplam -70.6% (t=-1.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| gece_ort_20g | 0.000306 | 0.0023 | -0.58 |
| net_kar_marji | -0.0206 | 0.0109 | -0.52 |
| getiri_20g | -0.0418 | 0.0178 | -0.46 |
| halka_aciklik | 0.489 | 0.487 | +0.45 |
| xu100_getiri_20g | -0.00148 | 0.0266 | -0.44 |
| min_gunluk_20g | -0.0518 | -0.0452 | -0.43 |
| ma50_uzaklik | -0.0476 | 0.00992 | -0.42 |
| rsi_14 | 43.8 | 50.8 | -0.41 |
| ma20_uzaklik | -0.0211 | 0.00511 | -0.40 |
| fk | 9.12 | 9.47 | +0.39 |
| atr_20g_oran | 0.0381 | 0.0379 | +0.37 |
| dolar_getiri_60g | -0.0921 | 0.0135 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| satis_buyume_yillik | -0.0257 | -0.0119 | -0.92 |
| snak_verimi | 0.0522 | 0.0611 | -0.58 |
| mom_12_1 | -0.0225 | 0.135 | -0.54 |
| net_kar_marji | 0.0535 | -0.0206 | +0.53 |
| gece_ort_20g | 0.0026 | 0.00164 | +0.48 |
| fk | 11 | 9.16 | -0.43 |
| piyasa_degeri_mn | 2.4e+04 | 2.59e+04 | -0.39 |
| xu100_ma200_uzaklik | 0.0938 | 0.0627 | +0.39 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| gece_ort_20g | 673 | 640 |  | +0.38 | 0.000 | -12.9% | +7.8% | 63% | 19% | -0.0191–-0.0011 | 0.00431–0.0131 |
| halka_aciklik | 693 | 80 | seviye | -0.36 | 0.000 | +9.4% | -16.0% | 7% | 60% | 0.0368–0.443 | 0.612–0.646 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.45 | 0.000 | -15.0% | +5.6% | 59% | 10% | 0.213–0.245 | 0.403–3.87 |
| piyasa_degeri_mn | 693 | 683 | seviye | -0.28 | 0.000 | +1.1% | -5.9% | 28% | 49% | 1.04e+04–2.25e+04 | 3.04e+04–4.46e+04 |
| getiri_20g | 674 | 660 |  | +0.28 | 0.000 | -10.3% | +0.1% | 56% | 32% | -0.528–-0.1 | 0.11–0.478 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.27 | 0.000 | -3.1% | +12.2% | 48% | 6% | -0.222–-0.0837 | 0.36–0.62 |
| ma50_uzaklik | 644 | 644 |  | +0.27 | 0.000 | -12.9% | +2.2% | 60% | 27% | -0.551–-0.113 | 0.129–0.4 |
| mom_12_1 | 442 | 436 |  | -0.32 | 0.000 | +3.8% | -11.7% | 30% | 57% | -0.499–-0.128 | 0.246–0.473 |
| min_gunluk_20g | 673 | 69 |  | +0.26 | 0.000 | -6.8% | +5.7% | 49% | 22% | -0.103–-0.0742 | -0.0313–-0.016 |
| rsi_14 | 679 | 644 |  | +0.25 | 0.000 | -9.8% | +1.6% | 54% | 32% | 9.85–36.5 | 63.2–81.5 |
| endekse_gore_20g | 674 | 673 |  | +0.23 | 0.000 | -9.6% | +0.5% | 47% | 34% | -0.406–-0.133 | 0.0966–0.486 |
| ma20_uzaklik | 674 | 674 |  | +0.21 | 0.000 | -9.2% | +0.6% | 50% | 36% | -0.41–-0.0631 | 0.0666–0.27 |
| atr_20g_oran | 673 | 661 |  | -0.20 | 0.000 | +3.1% | -6.5% | 41% | 46% | 0.023–0.0306 | 0.0463–0.118 |
| dolar_getiri_60g | 634 | 634 |  | +0.20 | 0.000 | -11.5% | +1.9% | 48% | 26% | -0.686–-0.209 | 0.211–0.705 |
| getiri_60g | 634 | 626 |  | +0.19 | 0.000 | -11.1% | +0.5% | 49% | 32% | -0.671–-0.174 | 0.259–0.794 |
| snak_verimi | 644 | 531 |  | -0.18 | 0.000 | +7.1% | -4.4% | 24% | 49% | 0.000433–0.00915 | 0.0992–0.135 |
| xu100_getiri_20g | 674 | 672 |  | +0.17 | 0.000 | -1.6% | +2.2% | 44% | 19% | -0.166–-0.0409 | 0.0783–0.222 |
| oynaklik_20g | 673 | 671 |  | -0.15 | 0.005 | +6.4% | -3.6% | 21% | 39% | 0.186–0.313 | 0.531–0.839 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.8% | -0.5% | -0.3% | -5.3% | 27% |
| siyasi | hayır | 17 | -0.5% | +1.3% | +1.7% | +1.3% | 41% |
| derecelendirme | hayır | 15 | -1.1% | +0.1% | -3.3% | -7.0% | 20% |
| jeopolitik | hayır | 10 | -1.4% | -0.2% | +2.0% | -2.5% | 30% |
| enflasyon | hayır | 9 | +1.7% | +0.4% | +0.4% | +2.0% | 33% |
| regulasyon | hayır | 6 | -1.1% | -0.4% | -3.7% | -0.4% | 50% |
| haber | hayır | 5 | -1.9% | -0.1% | +2.2% | -5.6% | 20% |
| kuresel_faiz | hayır | 5 | -1.4% | -2.3% | -0.9% | -14.3% | 0% |
| sok | hayır | 5 | -5.6% | -4.0% | -22.1% | -22.1% | 20% |
| tarife | hayır | 5 | +0.6% | +0.4% | +2.4% | +12.1% | 80% |
| kur | hayır | 4 | +0.7% | -0.5% | -0.8% | -5.5% | 25% |
| dusus | hayır | 3 | -2.2% | -2.8% | -2.4% | +1.7% | 33% |
| yukselis | hayır | 3 | +0.2% | -1.1% | -2.2% | +2.3% | 33% |
| butce_vergi | hayır | 2 | +0.2% | -3.2% | -5.4% | -3.5% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 230 deneme. Al-tut Sharpe: eğitim 0.48, test -1.35.
Eğitimde seçilen kural: **pd_dd > 1.453 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.55 → test Sharpe -1.08; testte nakitte kalma oranı 5%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.7%, test -2.5%.
Deflated Sharpe (deneme sayısı 230): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.2% | -0.7 |
| haftanin_gunu | 1.0 | 143 | -0.4% | -1.5 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.3 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.4 |
| haftanin_gunu | 4.0 | 143 | +0.0% | 0.1 |
| ay_donusu | 0.0 | 522 | -0.0% | -0.3 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.6 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -0.5 |
| bayram_oncesi | 1.0 | 6 | -0.2% | -0.4 |
| bayram_sonrasi | 0.0 | 708 | -0.1% | -0.7 |
| bayram_sonrasi | 1.0 | 6 | +1.7% | 0.8 |
| bilanco_sezonu | 0.0 | 423 | -0.2% | -1.1 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.00529, getiri_5g=0.301, getiri_20g=-0.0777, getiri_60g=-0.597, getiri_120g=-0.691, mom_12_1=-0.584, zirve_52h_yakinlik=0.276, zirveden_dusus=-0.724, oynaklik_20g=0.748, oynaklik_60g=0.722, atr_20g_oran=0.0619, rsi_14=47.5, ma20_uzaklik=0.1, ma50_uzaklik=-0.235, ma200_uzaklik=-0.609, hacim_z_20=0.129, amihud_20g=0.167, devir_hizi_20g=0.046, gece_ort_20g=-0.00361, gunici_ort_20g=0.00386, aof_1g_sapma=-0.00264, max_gunluk_20g=0.0949, min_gunluk_20g=-0.0757, ivol_60g=0.65, endekse_gore_1g=-0.0144, endekse_gore_20g=-0.0318, endekse_gore_60g=-0.424, beta_60g=1.07, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.616, piyasa_degeri_mn=1.06e+04, halka_aciklik=0.612, kazanc_verimi=-0.00357, pd_dd=0.439, fd_favok=9.93, snak_verimi=0.12, temettu_verimi=0, roe_ttm=-0.00156, net_kar_marji=-0.0206, satis_buyume_yillik=-0.155, net_borc_ozkaynak=0.213, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0