# Hisse dosyası analizi — MGROS

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 185 (17 bağımsız bölüm); ≥%10 yükseliş 217 gün (35 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +224.6% (t=3.7), gün içi (açılış→kapanış) toplam -56.3% (t=-1.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 1e+05 | 9.23e+04 | +0.62 |
| max_gunluk_20g | 0.0403 | 0.0448 | -0.60 |
| fk | 12.4 | 11.2 | +0.46 |
| bilancodan_gun | 68 | 45 | +0.43 |
| oynaklik_60g | 0.335 | 0.339 | -0.43 |
| halka_aciklik | 0.508 | 0.508 | -0.42 |
| kazanc_verimi | 0.0808 | 0.0892 | -0.42 |
| amihud_20g | 0.016 | 0.0194 | -0.41 |
| kar_buyume_yillik | -0.251 | -0.251 | -0.36 |
| beta_60g | 0.707 | 0.866 | -0.35 |
| satis_buyume_yillik | 0.409 | 0.419 | -0.34 |
| oynaklik_20g | 0.311 | 0.332 | -0.33 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 8.77e+04 | 9.71e+04 | -0.79 |
| kazanc_verimi | 0.0917 | 0.0845 | +0.58 |
| fk | 10.9 | 11.8 | -0.57 |
| net_borc_ozkaynak | -0.0326 | -0.00148 | -0.55 |
| net_kar_marji | 0.0237 | 0.0146 | +0.47 |
| zirve_52h_yakinlik | 0.825 | 0.873 | -0.41 |
| usdtry_getiri_20g | 0.0114 | 0.0151 | -0.41 |
| zirveden_dusus | -0.175 | -0.127 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fk | 643 | 606 |  | -0.33 | 0.000 | +5.2% | -2.8% | 12% | 38% | 6.09–8.77 | 13.6–16.4 |
| kazanc_verimi | 643 | 578 |  | +0.33 | 0.000 | -2.8% | +5.2% | 38% | 12% | 0.0611–0.0735 | 0.114–0.164 |
| piyasa_degeri_mn | 692 | 677 | seviye | -0.45 | 0.000 | +10.4% | -2.7% | 1% | 37% | 6.34e+04–8.6e+04 | 1.09e+05–1.31e+05 |
| usdtry_getiri_20g | 672 | 664 |  | -0.30 | 0.000 | +5.7% | -0.7% | 13% | 30% | -0.013–0.00947 | 0.019–0.0482 |
| max_gunluk_20g | 672 | 64 |  | +0.26 | 0.000 | -3.7% | +4.9% | 45% | 1% | 0.0147–0.0348 | 0.0612–0.0999 |
| zirveden_dusus | 573 | 453 |  | -0.24 | 0.000 | +2.8% | -3.8% | 20% | 42% | -0.316–-0.221 | -0.0596–0 |
| zirve_52h_yakinlik | 573 | 474 |  | -0.24 | 0.000 | +2.8% | -3.8% | 20% | 42% | 0.684–0.779 | 0.94–1.05 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.21 | 0.000 | +3.9% | -3.6% | 24% | 35% | -0.637–-0.0579 | 0.0864–0.0926 |
| amihud_20g | 672 | 658 |  | +0.20 | 0.000 | -1.8% | +4.6% | 40% | 16% | 0.00771–0.0132 | 0.0244–0.0397 |
| halka_aciklik | 692 | 14 | seviye | +0.19 | 0.000 | +0.3% | +19.0% | 28% | 0% | 0.491–0.508 | 0.51–0.519 |
| min_gunluk_20g | 672 | 65 |  | +0.19 | 0.000 | +1.5% | +4.5% | 22% | 13% | -0.0952–-0.0494 | -0.0262–-0.0094 |
| temettu_verimi | 693 | 488 |  | +0.18 | 0.000 | +2.4% | +6.6% | 29% | 2% | 0–0.0126 | 0.02–0.0343 |
| aof_1g_sapma | 692 | 692 |  | +0.17 | 0.000 | -1.4% | +4.5% | 33% | 23% | -0.03–0.00388 | 0.0379–0.0823 |
| net_kar_marji | 693 | 12 | çeyreklik adım | +0.16 | 0.001 | +0.5% | +3.6% | 25% | 25% | -0.00444–0.00822 | 0.0395–0.0729 |
| oynaklik_20g | 672 | 671 |  | +0.16 | 0.001 | -0.1% | +3.8% | 33% | 11% | 0.178–0.282 | 0.389–0.615 |
| ivol_60g | 573 | 572 |  | -0.16 | 0.005 | -2.8% | -4.8% | 41% | 45% | 0.17–0.221 | 0.288–0.378 |
| mom_12_1 | 441 | 438 |  | -0.17 | 0.020 | +2.5% | -1.0% | 13% | 22% | -0.211–-0.0183 | 0.294–0.541 |
| roe_ttm | 643 | 11 | çeyreklik adım | +0.14 | 0.021 | -3.6% | +2.4% | 38% | 20% | 0.0786–0.0946 | 0.245–0.279 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| temettu | evet | 3 | +0.7% | -1.1% | +1.4% | -2.1% | 0% |
| faiz | hayır | 41 | -0.1% | -0.5% | -0.5% | +0.9% | 59% |
| siyasi | hayır | 17 | +0.2% | +0.4% | -0.3% | +1.0% | 47% |
| derecelendirme | hayır | 15 | +0.2% | +0.1% | -0.0% | -3.2% | 40% |
| jeopolitik | hayır | 10 | +0.1% | -1.0% | -4.3% | -2.8% | 20% |
| enflasyon | hayır | 9 | +1.2% | +1.8% | +2.7% | +1.3% | 33% |
| regulasyon | hayır | 6 | +0.6% | +0.3% | -2.0% | +0.6% | 33% |
| haber | hayır | 5 | +1.8% | +1.6% | +2.5% | +3.8% | 40% |
| kuresel_faiz | hayır | 5 | +0.2% | +0.1% | +1.3% | +0.5% | 60% |
| sok | hayır | 5 | -5.2% | +1.9% | +7.9% | +7.2% | 100% |
| tarife | hayır | 5 | +0.2% | +0.7% | -1.1% | -0.7% | 40% |
| kur | hayır | 4 | -1.6% | -0.1% | -0.4% | -4.2% | 25% |
| dusus | hayır | 3 | -0.9% | -0.8% | +1.2% | +1.0% | 33% |
| yukselis | hayır | 3 | +3.7% | +0.4% | -3.3% | -1.2% | 33% |
| butce_vergi | hayır | 2 | -1.7% | +2.6% | +4.8% | +8.9% | 100% |
| YÖN: notr | evet | 1 | - | -0.7% | -0.7% | -4.3% | nan% |
| YÖN: olumlu | evet | 3 | - | -1.1% | +1.4% | -2.1% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 219 deneme. Al-tut Sharpe: eğitim 0.65, test 0.34.
Eğitimde seçilen kural: **max_gunluk_20g < 0.05381 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.17 → test Sharpe -0.58; testte nakitte kalma oranı 66%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.7%, test +0.7%.
Deflated Sharpe (deneme sayısı 219): 0.01 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.2% | 1.0 |
| haftanin_gunu | 1.0 | 142 | -0.0% | -0.3 |
| haftanin_gunu | 2.0 | 141 | -0.0% | -0.2 |
| haftanin_gunu | 3.0 | 143 | +0.1% | 0.8 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.8 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.0 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.0 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 5 | -1.2% | -2.3 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.2 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.9 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=0.0332, getiri_5g=0.129, getiri_20g=-0.0393, getiri_60g=-0.134, getiri_120g=-0.295, mom_12_1=0.0712, zirve_52h_yakinlik=0.667, zirveden_dusus=-0.333, oynaklik_20g=0.384, oynaklik_60g=0.339, atr_20g_oran=0.0293, rsi_14=50.2, ma20_uzaklik=0.0619, ma50_uzaklik=-0.0291, ma200_uzaklik=-0.201, hacim_z_20=1.65, amihud_20g=0.0236, devir_hizi_20g=0.0222, gece_ort_20g=-0.000845, gunici_ort_20g=-0.0024, aof_1g_sapma=0.00512, max_gunluk_20g=0.0454, min_gunluk_20g=-0.0388, ivol_60g=0.262, endekse_gore_1g=0.0105, endekse_gore_20g=0.00364, endekse_gore_60g=0.0368, beta_60g=0.845, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.173, piyasa_degeri_mn=8.73e+04, halka_aciklik=0.491, fk=12, kazanc_verimi=0.0837, pd_dd=0.94, fd_favok=9.67, snak_verimi=0.275, temettu_verimi=0.0169, roe_ttm=0.0786, net_kar_marji=-0.00444, kar_buyume_yillik=-2.27, satis_buyume_yillik=0.029, net_borc_ozkaynak=0.0697, bilancodan_gun=94.9, olay_sayi_5g=2, olay_yon_5g=0