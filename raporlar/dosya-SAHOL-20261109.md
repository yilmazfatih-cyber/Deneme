# Hisse dosyası analizi — SAHOL

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 159 (23 bağımsız bölüm); ≥%10 yükseliş 205 gün (19 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +175.8% (t=3.1), gün içi (açılış→kapanış) toplam -47.6% (t=-1.0).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirve_52h_yakinlik | 0.899 | 0.799 | +1.25 |
| zirveden_dusus | -0.101 | -0.201 | +1.25 |
| piyasa_degeri_mn | 2.13e+05 | 1.89e+05 | +1.22 |
| ma200_uzaklik | 0.0811 | -0.0218 | +1.10 |
| getiri_120g | 0.108 | -0.0254 | +1.04 |
| xu100_ma200_uzaklik | 0.133 | 0.047 | +0.95 |
| dolar_getiri_60g | 0.0482 | -0.0596 | +0.71 |
| getiri_60g | 0.0926 | -0.0215 | +0.70 |
| rsi_14 | 58.2 | 48.5 | +0.67 |
| ma50_uzaklik | 0.051 | -0.0199 | +0.63 |
| gunici_ort_20g | 0.00162 | -0.00116 | +0.62 |
| getiri_20g | 0.0742 | -0.00776 | +0.61 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1.89e+05 | 2e+05 | -0.73 |
| zirveden_dusus | -0.205 | -0.156 | -0.71 |
| zirve_52h_yakinlik | 0.795 | 0.844 | -0.71 |
| kar_buyume_yillik | -1.22 | -1.22 | -0.65 |
| getiri_120g | -0.0288 | 0.0314 | -0.55 |
| aof_1g_sapma | 0.0441 | 0.0207 | +0.52 |
| mom_12_1 | -0.114 | 0.0292 | -0.45 |
| fd_favok | 3.71 | 4.56 | -0.43 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirveden_dusus | 573 | 459 |  | -0.55 | 0.000 | +5.8% | -10.2% | 1% | 66% | -0.342–-0.242 | -0.103–0 |
| zirve_52h_yakinlik | 573 | 466 |  | -0.55 | 0.000 | +5.8% | -10.2% | 1% | 66% | 0.658–0.758 | 0.897–1.02 |
| mom_12_1 | 441 | 440 |  | -0.38 | 0.000 | +8.7% | -3.5% | 2% | 27% | -0.283–-0.14 | 0.223–0.713 |
| getiri_120g | 573 | 573 |  | -0.48 | 0.000 | +6.7% | -7.4% | 2% | 56% | -0.238–-0.0974 | 0.139–0.703 |
| ma200_uzaklik | 493 | 492 |  | -0.39 | 0.000 | +4.8% | -7.3% | 4% | 59% | -0.22–-0.0862 | 0.0765–0.282 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.52 | 0.000 | +7.4% | -8.4% | 1% | 58% | 1.31e+05–1.77e+05 | 2.13e+05–2.43e+05 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.27 | 0.000 | +4.2% | -2.7% | 9% | 48% | -0.118–-0.0163 | 0.144–0.312 |
| rsi_14 | 678 | 668 |  | -0.22 | 0.000 | +2.6% | -3.3% | 8% | 40% | 24–40.1 | 62.1–85.7 |
| getiri_60g | 633 | 631 |  | -0.22 | 0.000 | +4.3% | -1.5% | 8% | 44% | -0.28–-0.125 | 0.203–0.42 |
| dolar_getiri_60g | 633 | 631 |  | -0.22 | 0.000 | +4.5% | -1.4% | 9% | 44% | -0.33–-0.165 | 0.154–0.38 |
| fd_favok | 643 | 607 |  | -0.21 | 0.000 | +4.4% | -0.1% | 22% | 32% | 1.96–2.34 | 4.84–5.57 |
| max_gunluk_20g | 672 | 65 |  | -0.20 | 0.000 | +1.0% | -1.4% | 23% | 22% | 0.0129–0.0312 | 0.0719–0.0977 |
| getiri_20g | 673 | 672 |  | -0.20 | 0.000 | +3.4% | -1.6% | 4% | 33% | -0.296–-0.0808 | 0.107–0.29 |
| endekse_gore_20g | 673 | 673 |  | -0.20 | 0.000 | +3.2% | -1.8% | 7% | 32% | -0.174–-0.056 | 0.0488–0.154 |
| endekse_gore_60g | 633 | 631 |  | -0.20 | 0.000 | +2.5% | -3.2% | 13% | 39% | -0.194–-0.108 | 0.0688–0.204 |
| gunici_ort_20g | 673 | 660 |  | -0.19 | 0.000 | +3.4% | -1.5% | 5% | 39% | -0.0123–-0.00489 | 0.00296–0.00886 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.17 | 0.000 | +2.4% | +0.5% | 28% | 25% | 0.553–0.633 | 1.2–1.22 |
| ma50_uzaklik | 643 | 641 |  | -0.17 | 0.001 | +3.7% | -0.2% | 6% | 31% | -0.201–-0.0664 | 0.0863–0.237 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| birlesme_devralma | evet | 4 | +0.1% | +0.0% | -2.2% | -2.6% | 25% |
| geri_alim | evet | 2 | -0.2% | -0.1% | +1.3% | -1.5% | 0% |
| temettu | evet | 2 | -0.4% | +0.2% | +1.9% | -5.1% | 0% |
| faiz | hayır | 41 | +0.4% | -0.1% | -0.1% | -2.0% | 44% |
| siyasi | hayır | 17 | -0.2% | -0.6% | -1.4% | -3.4% | 29% |
| derecelendirme | hayır | 15 | +0.5% | +0.4% | +0.6% | -0.7% | 47% |
| haber | hayır | 10 | +0.0% | -0.8% | +0.5% | +1.3% | 50% |
| jeopolitik | hayır | 10 | -1.1% | +0.5% | -0.5% | -2.0% | 40% |
| enflasyon | hayır | 9 | +0.8% | -0.2% | -1.7% | +2.0% | 67% |
| regulasyon | hayır | 6 | +0.1% | +0.5% | -1.3% | -0.8% | 50% |
| kuresel_faiz | hayır | 5 | +1.0% | +0.8% | +0.7% | -1.7% | 20% |
| sok | hayır | 5 | -6.7% | +0.2% | +3.1% | +3.0% | 80% |
| tarife | hayır | 5 | +2.4% | -0.6% | -1.2% | -4.0% | 20% |
| kur | hayır | 4 | -0.5% | -0.1% | -0.1% | +0.7% | 25% |
| dusus | hayır | 3 | -2.4% | -1.8% | -1.6% | -3.2% | 33% |
| yukselis | hayır | 3 | +4.3% | -1.2% | -0.4% | -3.1% | 0% |
| butce_vergi | hayır | 2 | -0.6% | +2.3% | +1.2% | +2.9% | 100% |
| YÖN: notr | evet | 5 | - | -0.7% | -1.7% | -3.5% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 211 deneme. Al-tut Sharpe: eğitim 0.84, test 0.03.
Eğitimde seçilen kural: **zirveden_dusus > -0.2565 ise nakde geç** (kantil 0.2). Eğitim Sharpe 2.09 → test Sharpe 1.5; testte nakitte kalma oranı 90%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.5%, test -0.1%.
Deflated Sharpe (deneme sayısı 211): 0.37 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 1.1 |
| haftanin_gunu | 1.0 | 142 | -0.1% | -0.6 |
| haftanin_gunu | 2.0 | 141 | +0.0% | 0.1 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.8 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.4 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.2 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_oncesi | 1.0 | 5 | +0.2% | 0.3 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.0 |
| bayram_sonrasi | 1.0 | 6 | -0.7% | -0.5 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.1 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.00976, getiri_5g=0.0597, getiri_20g=0.054, getiri_60g=-0.0162, getiri_120g=-0.0553, mom_12_1=0.0688, zirve_52h_yakinlik=0.785, zirveden_dusus=-0.215, oynaklik_20g=0.394, oynaklik_60g=0.359, atr_20g_oran=0.0345, rsi_14=52.2, ma20_uzaklik=0.0304, ma50_uzaklik=-0.00639, ma200_uzaklik=-0.0622, hacim_z_20=-0.136, amihud_20g=0.00727, devir_hizi_20g=0.0289, gece_ort_20g=-0.00119, gunici_ort_20g=0.000682, aof_1g_sapma=0.0124, max_gunluk_20g=0.0491, min_gunluk_20g=-0.0576, ivol_60g=0.238, endekse_gore_1g=-0.013, endekse_gore_20g=0.0969, endekse_gore_60g=0.155, beta_60g=0.954, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0608, piyasa_degeri_mn=1.85e+05, halka_aciklik=0.512, fk=7.29, kazanc_verimi=0.137, pd_dd=0.417, fd_favok=4.76, snak_verimi=-0.722, temettu_verimi=0.0161, roe_ttm=0.0572, net_kar_marji=0.452, kar_buyume_yillik=5.5, satis_buyume_yillik=-0.866, net_borc_ozkaynak=1.15, bilancodan_gun=3.88, olay_sayi_5g=3, olay_yon_5g=0