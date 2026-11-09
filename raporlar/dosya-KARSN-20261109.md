# Hisse dosyası analizi — KARSN

Satır: 3980 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 244 (26 bağımsız bölüm); ≥%10 yükseliş 213 gün (33 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +577.1% (t=4.3), gün içi (açılış→kapanış) toplam -86.7% (t=-2.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| max_gunluk_20g | 0.0998 | 0.042 | +0.93 |
| oynaklik_20g | 0.575 | 0.342 | +0.90 |
| endekse_gore_60g | 0.0572 | -0.114 | +0.88 |
| devir_hizi_20g | 0.0758 | 0.04 | +0.81 |
| piyasa_degeri_mn | 1.11e+04 | 9.21e+03 | +0.80 |
| ivol_60g | 0.477 | 0.284 | +0.79 |
| endekse_gore_20g | 0.0273 | -0.0541 | +0.79 |
| atr_20g_oran | 0.0461 | 0.0334 | +0.79 |
| getiri_60g | 0.116 | -0.0766 | +0.74 |
| dolar_getiri_60g | 0.0764 | -0.112 | +0.73 |
| ma200_uzaklik | 0.0254 | -0.0914 | +0.73 |
| oynaklik_60g | 0.584 | 0.443 | +0.72 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.112 | 0.0535 | +0.59 |
| ivol_60g | 0.247 | 0.372 | -0.59 |
| fk | 25.2 | 28.8 | -0.55 |
| min_gunluk_20g | -0.0422 | -0.0455 | +0.52 |
| oynaklik_20g | 0.326 | 0.447 | -0.50 |
| piyasa_degeri_mn | 9.12e+03 | 1.01e+04 | -0.50 |
| max_gunluk_20g | 0.0438 | 0.064 | -0.45 |
| oynaklik_60g | 0.386 | 0.473 | -0.44 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oynaklik_20g | 672 | 671 |  | -0.34 | 0.000 | +5.4% | -7.3% | 5% | 60% | 0.123–0.274 | 0.645–1.26 |
| ivol_60g | 573 | 571 |  | -0.47 | 0.000 | +6.2% | -8.1% | 9% | 64% | 0.15–0.238 | 0.493–0.741 |
| max_gunluk_20g | 672 | 66 |  | -0.34 | 0.000 | +6.6% | -10.6% | 5% | 69% | 0.0111–0.0267 | 0.1–0.106 |
| piyasa_degeri_mn | 692 | 684 | seviye | -0.38 | 0.000 | +5.9% | -5.6% | 11% | 64% | 7.72e+03–8.76e+03 | 1.19e+04–1.66e+04 |
| endekse_gore_20g | 673 | 673 |  | -0.30 | 0.000 | +6.3% | -8.1% | 16% | 66% | -0.316–-0.106 | 0.0883–0.662 |
| min_gunluk_20g | 672 | 73 |  | +0.29 | 0.000 | -4.8% | +6.9% | 40% | 4% | -0.115–-0.0919 | -0.0269–-0.0114 |
| oynaklik_60g | 632 | 631 |  | -0.28 | 0.000 | +2.8% | -1.6% | 20% | 61% | 0.176–0.318 | 0.631–0.785 |
| devir_hizi_20g | 673 | 667 |  | -0.27 | 0.000 | +8.4% | +0.4% | 10% | 61% | 0.0124–0.0276 | 0.102–0.199 |
| endekse_gore_60g | 633 | 633 |  | -0.27 | 0.000 | +2.4% | -7.6% | 13% | 69% | -0.379–-0.197 | 0.13–0.624 |
| atr_20g_oran | 672 | 668 |  | -0.24 | 0.000 | +2.9% | -1.0% | 12% | 56% | 0.0156–0.0255 | 0.0528–0.129 |
| snak_verimi | 643 | 565 |  | +0.22 | 0.000 | -5.7% | +4.7% | 25% | 22% | -0.009–0.0535 | 0.229–0.344 |
| ma200_uzaklik | 493 | 493 |  | -0.25 | 0.000 | +0.7% | -10.7% | 19% | 72% | -0.309–-0.187 | 0.0594–0.564 |
| xu100_ma200_uzaklik | 493 | 493 |  | +0.24 | 0.000 | -6.5% | +1.9% | 39% | 33% | -0.118–-0.0163 | 0.144–0.312 |
| getiri_120g | 573 | 571 |  | -0.20 | 0.000 | -0.2% | -6.5% | 17% | 61% | -0.446–-0.209 | 0.317–0.916 |
| getiri_20g | 673 | 663 |  | -0.18 | 0.000 | +4.5% | -5.3% | 21% | 59% | -0.467–-0.11 | 0.111–0.68 |
| mom_12_1 | 441 | 439 |  | -0.22 | 0.000 | +1.1% | -8.2% | 29% | 53% | -0.487–-0.264 | 0.184–0.597 |
| gunici_ort_20g | 673 | 660 |  | -0.17 | 0.000 | +4.6% | -6.2% | 20% | 56% | -0.0159–-0.007 | 0.00168–0.0144 |
| gece_ort_20g | 672 | 643 |  | -0.17 | 0.001 | +2.5% | -6.2% | 21% | 58% | -0.0216–0.000729 | 0.00555–0.0155 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | -0.3% | -0.1% | -1.0% | -1.9% | 39% |
| siyasi | hayır | 9 | -1.0% | +1.9% | +0.1% | -4.8% | 44% |
| enflasyon | hayır | 6 | +0.8% | -0.4% | -1.3% | -5.7% | 33% |
| jeopolitik | hayır | 5 | -3.1% | +1.7% | +0.5% | -5.1% | 20% |
| sok | hayır | 5 | -9.7% | -6.8% | -13.8% | -16.2% | 0% |
| tarife | hayır | 5 | +0.4% | -0.8% | -2.1% | -0.1% | 20% |
| derecelendirme | hayır | 4 | +1.2% | +2.2% | -2.1% | +0.3% | 75% |
| dusus | hayır | 3 | -1.1% | +0.4% | -0.5% | -3.0% | 0% |
| yukselis | hayır | 3 | +1.1% | -0.4% | -0.0% | -1.6% | 33% |
| butce_vergi | hayır | 2 | -0.1% | -2.0% | -3.4% | -6.6% | 0% |
| kur | hayır | 2 | -1.9% | +1.1% | +3.2% | -6.2% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 222 deneme. Al-tut Sharpe: eğitim 0.59, test -0.46.
Eğitimde seçilen kural: **zirveden_dusus > -0.419 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.58 → test Sharpe -0.62; testte nakitte kalma oranı 88%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.6%, test -0.1%.
Deflated Sharpe (deneme sayısı 222): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.0 |
| haftanin_gunu | 1.0 | 142 | +0.0% | 0.0 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -0.9 |
| haftanin_gunu | 3.0 | 143 | +0.6% | 2.3 |
| haftanin_gunu | 4.0 | 143 | -0.3% | -1.0 |
| ay_donusu | 0.0 | 521 | +0.1% | 0.4 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.1 |
| bayram_oncesi | 0.0 | 708 | +0.0% | 0.3 |
| bayram_oncesi | 1.0 | 5 | -0.9% | -1.3 |
| bayram_sonrasi | 0.0 | 707 | +0.0% | 0.3 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.1 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.3 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.0 |

## Son durum (en yeni satır)

getiri_1g=-0.014, getiri_5g=0.191, getiri_20g=-0.151, getiri_60g=-0.236, getiri_120g=-0.435, mom_12_1=-0.136, zirve_52h_yakinlik=0.461, zirveden_dusus=-0.539, oynaklik_20g=0.6, oynaklik_60g=0.81, atr_20g_oran=0.0487, rsi_14=47.9, ma20_uzaklik=0.0221, ma50_uzaklik=-0.196, ma200_uzaklik=-0.274, hacim_z_20=1.96, amihud_20g=0.583, devir_hizi_20g=0.0224, gece_ort_20g=-0.0065, gunici_ort_20g=0.000605, aof_1g_sapma=0.0103, max_gunluk_20g=0.0738, min_gunluk_20g=-0.0589, ivol_60g=0.764, endekse_gore_1g=-0.0302, endekse_gore_20g=-0.102, endekse_gore_60g=-0.0596, beta_60g=0.939, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.271, piyasa_degeri_mn=6.97e+03, halka_aciklik=0.388, fk=19.1, kazanc_verimi=0.0522, pd_dd=0.849, fd_favok=3.92, snak_verimi=0.0852, temettu_verimi=0, roe_ttm=0.0443, net_kar_marji=-0.0603, satis_buyume_yillik=0.114, net_borc_ozkaynak=1.09, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1