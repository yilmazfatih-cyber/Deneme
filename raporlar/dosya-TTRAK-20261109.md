# Hisse dosyası analizi — TTRAK

Satır: 3978 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 122 (17 bağımsız bölüm); ≥%10 yükseliş 87 gün (16 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +33.0% (t=1.2), gün içi (açılış→kapanış) toplam -60.0% (t=-2.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | -0.0432 | -0.161 | +1.52 |
| ma200_uzaklik | -0.0616 | -0.138 | +1.41 |
| zirveden_dusus | -0.306 | -0.339 | +0.92 |
| zirve_52h_yakinlik | 0.694 | 0.661 | +0.92 |
| dolar_getiri_60g | -0.0254 | -0.121 | +0.75 |
| getiri_60g | 0.00635 | -0.0834 | +0.73 |
| atr_20g_oran | 0.0266 | 0.0225 | +0.66 |
| min_gunluk_20g | -0.032 | -0.0272 | -0.60 |
| snak_verimi | 0.0346 | 0.0698 | -0.57 |
| kar_buyume_yillik | 0.106 | -0.747 | +0.55 |
| oynaklik_20g | 0.265 | 0.239 | +0.50 |
| olay_yon_5g | 0 | 0 | -0.46 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| aof_1g_sapma | 0.101 | 0.00441 | +1.12 |
| pd_dd | 4.52 | 3.94 | +1.08 |
| net_borc_ozkaynak | -0.425 | 0.254 | -1.00 |
| net_kar_marji | 0.132 | 0.0297 | +0.95 |
| devir_hizi_20g | 0.00839 | 0.00805 | +0.94 |
| ivol_60g | 0.157 | 0.196 | -0.82 |
| zirveden_dusus | -0.384 | -0.327 | -0.81 |
| zirve_52h_yakinlik | 0.616 | 0.673 | -0.81 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 633 | 626 |  | -0.41 | 0.000 | +1.1% | -7.1% | 1% | 37% | -0.349–-0.152 | 0.0387–0.43 |
| zirveden_dusus | 573 | 468 |  | -0.48 | 0.000 | +2.3% | -10.1% | 7% | 43% | -0.484–-0.384 | -0.298–-0.13 |
| zirve_52h_yakinlik | 573 | 468 |  | -0.48 | 0.000 | +2.3% | -10.1% | 7% | 43% | 0.516–0.616 | 0.702–0.87 |
| getiri_120g | 573 | 572 |  | -0.39 | 0.000 | +0.9% | -7.9% | 0% | 50% | -0.341–-0.214 | -0.0689–0.335 |
| ma200_uzaklik | 493 | 493 |  | -0.56 | 0.000 | +3.3% | -10.5% | 2% | 49% | -0.216–-0.161 | -0.0891–0.145 |
| dolar_getiri_60g | 633 | 632 |  | -0.41 | 0.000 | +1.4% | -6.9% | 1% | 38% | -0.396–-0.185 | 0.00816–0.322 |
| snak_verimi | 643 | 555 |  | +0.35 | 0.000 | -3.6% | +3.3% | 20% | 2% | -0.0924–0.0165 | 0.0808–0.132 |
| mom_12_1 | 441 | 441 |  | -0.28 | 0.000 | +0.2% | -5.0% | 3% | 22% | -0.416–-0.303 | -0.159–0.133 |
| bilancodan_gun | 693 | 303 | seviye | +0.21 | 0.000 | -4.6% | +1.9% | 21% | 13% | 0.917–19 | 79–113 |
| fd_favok | 643 | 561 |  | -0.20 | 0.000 | +2.0% | -4.8% | 12% | 22% | 3.92–4.82 | 9.18–19.3 |
| ma50_uzaklik | 643 | 642 |  | -0.20 | 0.000 | -2.2% | -6.4% | 19% | 29% | -0.194–-0.0761 | 0.0323–0.237 |
| kar_buyume_yillik | 605 | 10 | çeyreklik adım | -0.21 | 0.000 | -0.3% | -9.0% | 3% | 55% | -5.12–-0.872 | 0.106–0.293 |
| aof_1g_sapma | 692 | 688 |  | +0.19 | 0.000 | -3.0% | +2.9% | 19% | 14% | -0.0202–-0.0028 | 0.0995–0.202 |
| kazanc_verimi | 643 | 555 |  | +0.16 | 0.003 | -3.4% | +3.1% | 16% | 2% | -0.0253–0.0125 | 0.159–0.178 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | -0.15 | 0.009 | -0.4% | -9.1% | 3% | 57% | -0.396–-0.274 | 0.182–0.182 |
| fk | 538 | 475 |  | -0.16 | 0.011 | +4.2% | -2.0% | 0% | 20% | 5.61–6.17 | 27.2–87.1 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.14 | 0.012 | +0.7% | -3.0% | 26% | 27% | -0.528–-0.425 | 0.654–0.654 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.13 | 0.025 | -0.3% | +8.1% | 3% | 2% | -0.127–0.0186 | 0.132–0.214 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.0% | -0.1% | -0.5% | -3.0% | 24% |
| siyasi | hayır | 17 | -0.4% | -0.4% | -0.9% | -3.7% | 24% |
| derecelendirme | hayır | 15 | +0.0% | -0.1% | -1.0% | -3.4% | 20% |
| jeopolitik | hayır | 10 | -1.6% | -1.0% | -2.5% | -4.1% | 10% |
| enflasyon | hayır | 9 | +2.1% | +0.0% | -2.6% | -5.8% | 11% |
| regulasyon | hayır | 6 | -0.5% | -0.8% | -3.0% | -6.6% | 17% |
| haber | hayır | 5 | +0.8% | +0.9% | +2.2% | +1.3% | 20% |
| kuresel_faiz | hayır | 5 | +0.1% | -0.2% | +0.2% | +1.3% | 40% |
| sok | hayır | 5 | -3.3% | +2.0% | +1.7% | -2.0% | 40% |
| tarife | hayır | 5 | +0.8% | -0.2% | -1.1% | -7.1% | 0% |
| kur | hayır | 4 | -0.1% | +0.7% | -4.1% | -5.2% | 0% |
| dusus | hayır | 3 | -1.6% | +0.7% | -0.3% | -8.9% | 0% |
| yukselis | hayır | 3 | +1.7% | -1.5% | -2.6% | -6.3% | 0% |
| butce_vergi | hayır | 2 | -0.3% | -0.6% | +1.7% | -4.6% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 188 deneme. Al-tut Sharpe: eğitim -0.18, test -1.56.
Eğitimde seçilen kural: **ivol_60g > 0.1885 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.67 → test Sharpe -0.91; testte nakitte kalma oranı 38%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.0%, test -2.7%.
Deflated Sharpe (deneme sayısı 188): 0.00 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.3% | -2.2 |
| haftanin_gunu | 1.0 | 142 | -0.2% | -1.6 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.4 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 3.7 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.6 |
| ay_donusu | 0.0 | 521 | -0.1% | -1.0 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.4 |
| bayram_oncesi | 0.0 | 708 | -0.1% | -1.1 |
| bayram_oncesi | 1.0 | 5 | -0.1% | -0.3 |
| bayram_sonrasi | 0.0 | 707 | -0.1% | -0.9 |
| bayram_sonrasi | 1.0 | 6 | -1.6% | -1.4 |
| bilanco_sezonu | 0.0 | 422 | -0.2% | -2.6 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 1.0 |

## Son durum (en yeni satır)

getiri_1g=0.0168, getiri_5g=0.112, getiri_20g=-0.0363, getiri_60g=-0.0864, getiri_120g=-0.199, mom_12_1=-0.306, zirve_52h_yakinlik=0.619, zirveden_dusus=-0.381, oynaklik_20g=0.283, oynaklik_60g=0.237, atr_20g_oran=0.0336, rsi_14=50.4, ma20_uzaklik=0.0413, ma50_uzaklik=-0.0435, ma200_uzaklik=-0.16, hacim_z_20=-1.32, amihud_20g=0.604, devir_hizi_20g=0.00372, gece_ort_20g=-0.0056, gunici_ort_20g=0.00332, aof_1g_sapma=0.00431, max_gunluk_20g=0.0452, min_gunluk_20g=-0.0254, ivol_60g=0.2, endekse_gore_1g=-0.00288, endekse_gore_20g=0.00953, endekse_gore_60g=0.0871, beta_60g=0.435, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.128, piyasa_degeri_mn=3.79e+04, halka_aciklik=0.241, kazanc_verimi=-0.0233, pd_dd=1.99, fd_favok=17.1, snak_verimi=0.0729, temettu_verimi=0, roe_ttm=-0.0465, net_kar_marji=0.0445, kar_buyume_yillik=0.293, satis_buyume_yillik=-0.229, net_borc_ozkaynak=0.519, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0