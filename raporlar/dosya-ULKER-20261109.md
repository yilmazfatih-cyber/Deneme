# Hisse dosyası analizi — ULKER

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 213 (29 bağımsız bölüm); ≥%10 yükseliş 185 gün (28 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +177.0% (t=3.0), gün içi (açılış→kapanış) toplam -65.6% (t=-1.7).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| fd_favok | 3.82 | 3.56 | +0.63 |
| satis_buyume_yillik | 0.142 | 0.315 | -0.58 |
| beta_60g | 1 | 1.09 | -0.57 |
| getiri_120g | 0.0394 | -0.0686 | +0.55 |
| zirveden_dusus | -0.27 | -0.35 | +0.52 |
| zirve_52h_yakinlik | 0.73 | 0.65 | +0.52 |
| piyasa_degeri_mn | 4.93e+04 | 4.47e+04 | +0.45 |
| ma200_uzaklik | -0.0506 | -0.1 | +0.44 |
| xu100_ma200_uzaklik | 0.113 | 0.0575 | +0.40 |
| kazanc_verimi | 0.153 | 0.166 | -0.40 |
| net_borc_ozkaynak | 0.871 | 0.896 | -0.39 |
| ivol_60g | 0.253 | 0.239 | +0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | -0.103 | -0.015 | -0.52 |
| net_borc_ozkaynak | 1.01 | 0.871 | +0.51 |
| beta_60g | 1.1 | 1.07 | +0.47 |
| ivol_60g | 0.218 | 0.251 | -0.46 |
| min_gunluk_20g | -0.0356 | -0.0437 | +0.46 |
| ma200_uzaklik | -0.118 | -0.0668 | -0.44 |
| zirve_52h_yakinlik | 0.639 | 0.701 | -0.44 |
| zirveden_dusus | -0.361 | -0.299 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| beta_60g | 632 | 631 |  | +0.38 | 0.000 | -6.8% | +4.9% | 61% | 24% | 0.716–0.894 | 1.16–1.43 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | +0.34 | 0.000 | -4.3% | +13.1% | 44% | 7% | 0.694–0.838 | 1.05–2.12 |
| getiri_120g | 573 | 570 |  | -0.33 | 0.000 | +0.3% | -7.9% | 16% | 58% | -0.395–-0.226 | 0.146–1.27 |
| fd_favok | 643 | 606 |  | -0.31 | 0.000 | +5.4% | -0.7% | 5% | 44% | 3.12–3.41 | 4.02–5.01 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.32 | 0.000 | -4.5% | +2.3% | 49% | 11% | -0.108–0.0422 | 0.57–0.57 |
| zirveden_dusus | 573 | 469 |  | -0.33 | 0.000 | +2.5% | -6.8% | 10% | 51% | -0.467–-0.389 | -0.172–0 |
| zirve_52h_yakinlik | 573 | 474 |  | -0.33 | 0.000 | +2.5% | -6.8% | 10% | 51% | 0.533–0.611 | 0.828–1.03 |
| halka_aciklik | 692 | 17 | seviye | -0.28 | 0.000 | +5.4% | -5.6% | 25% | 55% | 0.384–0.391 | 0.41–0.445 |
| piyasa_degeri_mn | 692 | 685 | seviye | -0.26 | 0.000 | +2.5% | -5.0% | 31% | 58% | 3.08e+04–4.14e+04 | 5.2e+04–7.86e+04 |
| min_gunluk_20g | 672 | 63 |  | +0.23 | 0.000 | -3.0% | +6.4% | 39% | 15% | -0.102–-0.06 | -0.0265–-0.0153 |
| ivol_60g | 573 | 572 |  | -0.22 | 0.000 | +2.5% | -5.1% | 17% | 43% | 0.14–0.201 | 0.349–0.485 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.20 | 0.000 | -1.0% | -4.8% | 32% | 48% | -0.118–-0.0163 | 0.144–0.312 |
| ma200_uzaklik | 493 | 493 |  | -0.17 | 0.005 | +0.4% | -4.4% | 22% | 43% | -0.253–-0.163 | 0.0188–0.242 |
| aof_1g_sapma | 692 | 688 |  | +0.14 | 0.017 | -2.6% | +2.1% | 41% | 29% | -0.0153–0.0456 | 0.139–0.174 |
| fk | 643 | 621 |  | -0.14 | 0.021 | +4.8% | +3.3% | 5% | 37% | 3.93–4.62 | 8.73–14.4 |
| kazanc_verimi | 643 | 580 |  | +0.14 | 0.021 | +3.3% | +4.8% | 37% | 5% | 0.0695–0.115 | 0.217–0.254 |
| olay_sayi_5g | 693 | 7 |  | -0.13 | 0.027 | +1.1% | -2.8% | 29% | 36% | 0–1 | 2–7 |
| dolar_getiri_60g | 633 | 633 |  | +0.12 | 0.095 | -2.4% | +2.2% | 36% | 36% | -0.366–-0.186 | 0.121–0.703 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.0% | +0.0% | +0.5% | -1.0% | 46% |
| siyasi | hayır | 17 | -0.1% | -0.9% | -2.8% | -5.5% | 24% |
| derecelendirme | hayır | 15 | +0.0% | -0.0% | -1.7% | -2.6% | 40% |
| jeopolitik | hayır | 10 | -0.8% | -0.2% | -3.3% | -4.5% | 20% |
| enflasyon | hayır | 9 | +0.9% | +0.8% | -0.9% | -3.7% | 33% |
| regulasyon | hayır | 6 | +0.5% | -1.0% | -1.6% | -4.6% | 17% |
| haber | hayır | 5 | -0.7% | +1.2% | +2.1% | +0.7% | 40% |
| kuresel_faiz | hayır | 5 | +0.8% | +0.5% | -1.1% | -3.7% | 20% |
| sok | hayır | 5 | -5.7% | +1.3% | +2.6% | +2.4% | 80% |
| tarife | hayır | 5 | +2.2% | -0.4% | -1.5% | -2.2% | 40% |
| kur | hayır | 4 | +0.1% | +0.7% | -0.0% | -3.0% | 0% |
| dusus | hayır | 3 | -2.4% | -0.8% | -2.9% | -9.9% | 0% |
| yukselis | hayır | 3 | +2.2% | -0.1% | -0.4% | -3.7% | 0% |
| butce_vergi | hayır | 2 | -1.1% | +0.9% | +4.5% | +3.5% | 100% |
| YÖN: notr | evet | 1 | - | -0.3% | -8.1% | -16.1% | nan% |
| YÖN: olumlu | evet | 1 | - | -1.0% | -3.0% | -7.0% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 198 deneme. Al-tut Sharpe: eğitim 0.58, test -0.73.
Eğitimde seçilen kural: **endekse_gore_20g > -0.0455 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.00 → test Sharpe -0.88; testte nakitte kalma oranı 62%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +0.7%, test -2.1%.
Deflated Sharpe (deneme sayısı 198): 0.01 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.1 |
| haftanin_gunu | 1.0 | 142 | -0.0% | -0.2 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.0 |
| haftanin_gunu | 3.0 | 143 | +0.4% | 1.9 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.3 |
| ay_donusu | 0.0 | 521 | -0.0% | -0.0 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.6 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.2 |
| bayram_oncesi | 1.0 | 5 | +0.4% | 0.8 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.2 |
| bayram_sonrasi | 1.0 | 6 | +0.6% | 0.3 |
| bilanco_sezonu | 0.0 | 422 | +0.0% | 0.1 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.2 |

## Son durum (en yeni satır)

getiri_1g=-0.0409, getiri_5g=0.0295, getiri_20g=-0.105, getiri_60g=-0.132, getiri_120g=-0.367, mom_12_1=-0.249, zirve_52h_yakinlik=0.563, zirveden_dusus=-0.437, oynaklik_20g=0.339, oynaklik_60g=0.379, atr_20g_oran=0.0312, rsi_14=52.9, ma20_uzaklik=-0.0103, ma50_uzaklik=-0.0761, ma200_uzaklik=-0.259, hacim_z_20=-0.0102, amihud_20g=0.0814, devir_hizi_20g=0.0166, gece_ort_20g=-0.00507, gunici_ort_20g=0.00294, aof_1g_sapma=0.0183, max_gunluk_20g=0.0399, min_gunluk_20g=-0.043, ivol_60g=0.252, endekse_gore_1g=-0.0636, endekse_gore_20g=-0.0617, endekse_gore_60g=0.0391, beta_60g=1.01, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.171, piyasa_degeri_mn=2.9e+04, halka_aciklik=0.441, fk=10.3, kazanc_verimi=0.0968, pd_dd=0.543, fd_favok=4.5, snak_verimi=0.49, temettu_verimi=0.0729, roe_ttm=0.0525, net_kar_marji=-0.0115, kar_buyume_yillik=-1.23, satis_buyume_yillik=-0.117, net_borc_ozkaynak=0.833, bilancodan_gun=3.88, olay_sayi_5g=3, olay_yon_5g=-1