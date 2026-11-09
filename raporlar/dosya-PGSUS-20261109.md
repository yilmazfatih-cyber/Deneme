# Hisse dosyası analizi — PGSUS

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 155 (26 bağımsız bölüm); ≥%10 yükseliş 148 gün (28 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +318.5% (t=4.4), gün içi (açılış→kapanış) toplam -74.3% (t=-2.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.142 | 0.176 | -0.84 |
| kar_buyume_yillik | -0.488 | 0.284 | -0.79 |
| roe_ttm | 0.177 | 0.227 | -0.65 |
| net_kar_marji | -0.105 | 0.15 | -0.57 |
| halka_aciklik | 0.463 | 0.463 | +0.55 |
| fk | 7.05 | 5.68 | +0.54 |
| rsi_14 | 51.2 | 46.7 | +0.42 |
| pd_dd | 1.2 | 1.48 | -0.40 |
| devir_hizi_20g | 0.0386 | 0.0401 | -0.39 |
| ma50_uzaklik | 0.00926 | -0.0226 | +0.36 |
| gece_ort_20g | 0.00283 | 0.00195 | +0.36 |
| endekse_gore_20g | 0.00207 | -0.0242 | +0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| roe_ttm | 0.326 | 0.2 | +0.82 |
| snak_verimi | 0.215 | 0.323 | -0.80 |
| halka_aciklik | 0.425 | 0.463 | -0.75 |
| mom_12_1 | 0.236 | -0.0787 | +0.69 |
| fd_favok | 8.58 | 7.14 | +0.69 |
| kazanc_verimi | 0.186 | 0.167 | +0.68 |
| net_borc_ozkaynak | 1.85 | 1.57 | +0.64 |
| getiri_60g | 0.0802 | -0.0302 | +0.62 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fk | 644 | 590 |  | -0.45 | 0.000 | +6.5% | -5.9% | 2% | 52% | 3.79–5.18 | 7.14–68.6 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.37 | 0.000 | -4.2% | +4.7% | 35% | 6% | 0.0101–0.118 | 0.336–0.382 |
| kazanc_verimi | 644 | 577 |  | +0.45 | 0.000 | -5.9% | +6.5% | 52% | 2% | 0.0146–0.14 | 0.193–0.264 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.27 | 0.000 | -0.4% | +8.9% | 28% | 0% | -0.237–-0.112 | 0.275–0.639 |
| pd_dd | 693 | 623 |  | +0.24 | 0.000 | -3.9% | +0.7% | 33% | 13% | 0.596–0.779 | 1.95–2.47 |
| halka_aciklik | 693 | 15 | seviye | -0.23 | 0.000 | +3.0% | -0.5% | 10% | 9% | 0.422–0.425 | 0.463–0.467 |
| snak_verimi | 644 | 577 |  | -0.23 | 0.000 | +4.1% | -1.3% | 14% | 17% | 0.0864–0.198 | 0.413–0.504 |
| xu100_ma200_uzaklik | 494 | 494 |  | -0.24 | 0.000 | -0.7% | -5.1% | 41% | 43% | -0.118–-0.0168 | 0.144–0.312 |
| kar_buyume_yillik | 402 | 7 | çeyreklik adım | +0.27 | 0.000 | -3.9% | -0.5% | 44% | 9% | -1.93–-0.488 | 1.08–1.08 |
| gece_ort_20g | 673 | 641 |  | -0.21 | 0.000 | +0.8% | -4.0% | 13% | 36% | -0.00594–0.000254 | 0.0046–0.00816 |
| mom_12_1 | 442 | 442 |  | +0.25 | 0.000 | -6.1% | +2.0% | 43% | 28% | -0.419–-0.283 | 0.237–0.684 |
| olay_sayi_5g | 694 | 5 |  | -0.20 | 0.000 | +0.2% | -3.2% | 21% | 22% | 0–1 | 2–4 |
| xu100_getiri_20g | 674 | 672 |  | -0.20 | 0.000 | +0.4% | -2.3% | 24% | 26% | -0.166–-0.0409 | 0.0783–0.222 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | +0.17 | 0.001 | +0.7% | +8.9% | 15% | 0% | 1.46–1.5 | 1.89–2.11 |
| piyasa_degeri_mn | 693 | 653 | seviye | -0.16 | 0.001 | +2.0% | -3.8% | 21% | 52% | 6.64e+04–8.56e+04 | 1.2e+05–1.42e+05 |
| fd_favok | 644 | 580 |  | +0.16 | 0.002 | +0.0% | +2.7% | 17% | 14% | 5.99–6.47 | 8.9–10.9 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.14 | 0.035 | -3.8% | +1.0% | 33% | 29% | 0.0766–0.307 | 0.978–2.36 |
| getiri_20g | 674 | 669 |  | -0.13 | 0.043 | +1.2% | +0.2% | 12% | 24% | -0.212–-0.0679 | 0.0721–0.306 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.2% | +0.1% | +0.1% | -1.6% | 22% |
| siyasi | hayır | 9 | -0.3% | -0.2% | -0.2% | -4.6% | 22% |
| enflasyon | hayır | 6 | +2.0% | -0.3% | -2.2% | -9.4% | 0% |
| jeopolitik | hayır | 5 | -3.8% | +0.7% | -2.6% | -1.7% | 20% |
| sok | hayır | 5 | -5.1% | +1.7% | +3.7% | -0.6% | 60% |
| tarife | hayır | 5 | +0.7% | -0.2% | -1.5% | -5.1% | 20% |
| derecelendirme | hayır | 4 | +0.5% | -0.3% | -3.5% | -8.2% | 0% |
| dusus | hayır | 3 | -0.0% | +1.3% | +1.1% | +1.1% | 67% |
| yukselis | hayır | 3 | +5.0% | -1.2% | -1.2% | -4.2% | 0% |
| butce_vergi | hayır | 2 | -1.3% | -1.3% | -5.4% | -8.3% | 0% |
| kur | hayır | 2 | -0.1% | -0.1% | -2.6% | -4.9% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 140 deneme. Al-tut Sharpe: eğitim 1.02, test -1.19.
Eğitimde seçilen kural: **gunici_ort_20g > -0.002603 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.01 → test Sharpe -0.34; testte nakitte kalma oranı 29%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.8%, test -5.2%.
Deflated Sharpe (deneme sayısı 140): 0.02 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.7 |
| haftanin_gunu | 1.0 | 143 | -0.2% | -1.0 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.7 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.8 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 1.2 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.8 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.5 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.4 |
| bayram_oncesi | 1.0 | 6 | -0.1% | -0.3 |
| bayram_sonrasi | 0.0 | 708 | +0.0% | 0.4 |
| bayram_sonrasi | 1.0 | 6 | -0.4% | -0.4 |
| bilanco_sezonu | 0.0 | 423 | +0.0% | 0.2 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.4 |

## Son durum (en yeni satır)

getiri_1g=0.012, getiri_5g=0.172, getiri_20g=0.064, getiri_60g=-0.0561, getiri_120g=-0.191, mom_12_1=-0.369, zirve_52h_yakinlik=0.637, zirveden_dusus=-0.363, oynaklik_20g=0.447, oynaklik_60g=0.367, atr_20g_oran=0.0317, rsi_14=60.8, ma20_uzaklik=0.111, ma50_uzaklik=0.0234, ma200_uzaklik=-0.154, hacim_z_20=0.567, amihud_20g=0.0294, devir_hizi_20g=0.024, gece_ort_20g=-0.00222, gunici_ort_20g=0.00473, aof_1g_sapma=0.0109, max_gunluk_20g=0.0545, min_gunluk_20g=-0.0477, ivol_60g=0.254, endekse_gore_1g=-0.00414, endekse_gore_20g=0.113, endekse_gore_60g=0.12, beta_60g=0.941, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0989, piyasa_degeri_mn=7.15e+04, halka_aciklik=0.463, fk=62.6, kazanc_verimi=0.016, pd_dd=0.635, fd_favok=7.71, snak_verimi=0.348, temettu_verimi=0, roe_ttm=0.0101, net_kar_marji=-0.105, kar_buyume_yillik=-1.93, satis_buyume_yillik=0.19, net_borc_ozkaynak=1.73, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1