# Hisse dosyası analizi — GRSEL

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 184 (26 bağımsız bölüm); ≥%10 yükseliş 307 gün (29 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +66.4% (t=1.4), gün içi (açılış→kapanış) toplam +148.0% (t=1.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| beta_60g | 0.498 | 0.635 | -0.84 |
| halka_aciklik | 0.216 | 0.216 | -0.49 |
| kar_buyume_yillik | 0.253 | 0.285 | -0.39 |
| bilancodan_gun | 56 | 46 | +0.37 |
| fd_favok | 6.87 | 6.41 | +0.31 |
| min_gunluk_20g | -0.0469 | -0.0463 | -0.29 |
| ivol_60g | 0.381 | 0.395 | +0.27 |
| usdtry_getiri_20g | 0.0153 | 0.0127 | +0.27 |
| roe_ttm | 0.32 | 0.335 | -0.25 |
| satis_buyume_yillik | 0.285 | 0.495 | -0.23 |
| oynaklik_20g | 0.459 | 0.421 | +0.20 |
| atr_20g_oran | 0.0413 | 0.0375 | +0.19 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 2.03e+04 | 3.14e+04 | -0.76 |
| fd_favok | 6.19 | 6.83 | -0.64 |
| mom_12_1 | 1.08 | 0.666 | +0.54 |
| kazanc_verimi | 0.111 | 0.101 | +0.51 |
| halka_aciklik | 0.216 | 0.225 | -0.48 |
| beta_60g | 0.7 | 0.566 | +0.47 |
| fk | 9.03 | 9.88 | -0.46 |
| xu100_ma200_uzaklik | 0.0402 | 0.0825 | -0.45 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fd_favok | 644 | 617 |  | -0.39 | 0.000 | +15.0% | -1.5% | 25% | 28% | 4.36–5.9 | 7.57–9.8 |
| piyasa_degeri_mn | 693 | 676 | seviye | -0.43 | 0.000 | +16.4% | -4.5% | 21% | 33% | 6.35e+03–1.38e+04 | 3.33e+04–4.08e+04 |
| kazanc_verimi | 644 | 578 |  | +0.30 | 0.000 | -1.0% | +14.4% | 24% | 18% | 0.0609–0.076 | 0.144–0.228 |
| fk | 644 | 619 |  | -0.30 | 0.000 | +14.4% | -1.0% | 18% | 24% | 4.38–6.97 | 13.2–16.4 |
| halka_aciklik | 693 | 16 | seviye | -0.27 | 0.000 | +8.7% | -6.9% | 29% | 0% | 0.21–0.216 | 0.295–0.295 |
| pd_dd | 693 | 652 |  | -0.26 | 0.000 | +13.0% | -2.7% | 25% | 38% | 1.52–2.58 | 4.24–5.26 |
| mom_12_1 | 442 | 440 |  | +0.29 | 0.000 | -3.8% | +9.1% | 49% | 29% | -0.166–0.134 | 1.48–2.79 |
| beta_60g | 633 | 633 |  | +0.23 | 0.000 | +3.6% | +12.7% | 46% | 3% | -0.26–0.423 | 0.837–1.21 |
| amihud_20g | 653 | 651 |  | +0.23 | 0.000 | -1.5% | +9.7% | 25% | 35% | 0.0612–0.103 | 0.187–0.579 |
| devir_hizi_20g | 674 | 670 |  | +0.22 | 0.000 | +1.8% | +12.3% | 25% | 34% | 0.00799–0.015 | 0.0507–0.0894 |
| oynaklik_60g | 633 | 631 |  | +0.21 | 0.000 | +1.4% | +10.6% | 31% | 24% | 0.315–0.371 | 0.582–0.722 |
| roe_ttm | 644 | 11 | çeyreklik adım | +0.18 | 0.000 | +1.2% | +0.9% | 30% | 9% | 0.263–0.276 | 0.51–0.51 |
| temettu_verimi | 694 | 474 |  | -0.17 | 0.000 | +13.5% | +0.8% | 25% | 32% | 0–0.00131 | 0.00291–0.00778 |
| xu100_ma200_uzaklik | 494 | 494 |  | -0.20 | 0.001 | +7.3% | -0.7% | 29% | 20% | -0.118–-0.0168 | 0.144–0.312 |
| atr_20g_oran | 673 | 663 |  | +0.16 | 0.001 | +3.5% | +15.5% | 24% | 30% | 0.0214–0.0304 | 0.0485–0.0925 |
| satis_buyume_yillik | 605 | 10 | çeyreklik adım | +0.13 | 0.058 | +0.1% | +7.1% | 24% | 29% | -0.631–0.00453 | 1.27–1.27 |
| ma200_uzaklik | 494 | 494 |  | +0.14 | 0.070 | +0.4% | +0.6% | 21% | 35% | -0.215–-0.0409 | 0.411–0.744 |
| aof_1g_sapma | 693 | 682 |  | +0.12 | 0.115 | +4.3% | +7.2% | 28% | 28% | -0.0505–-0.00258 | 0.016–0.063 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.2% | +0.0% | +1.7% | +6.8% | 54% |
| siyasi | hayır | 17 | +0.4% | +0.2% | +1.2% | +8.2% | 65% |
| derecelendirme | hayır | 15 | -0.6% | +1.2% | +1.6% | +4.2% | 40% |
| jeopolitik | hayır | 10 | -0.3% | +0.2% | -0.9% | -0.8% | 30% |
| enflasyon | hayır | 9 | +1.9% | +0.2% | +0.7% | +4.1% | 44% |
| regulasyon | hayır | 6 | +0.5% | +0.3% | +4.0% | +16.0% | 83% |
| haber | hayır | 5 | -0.2% | -0.8% | +2.4% | +4.2% | 40% |
| kuresel_faiz | hayır | 5 | -0.9% | -1.2% | +1.1% | +4.2% | 40% |
| sok | hayır | 5 | -3.1% | -1.5% | -0.7% | +16.4% | 100% |
| tarife | hayır | 5 | -1.4% | +1.5% | -0.3% | -1.0% | 40% |
| kur | hayır | 4 | +0.5% | +2.8% | +0.1% | -1.5% | 50% |
| dusus | hayır | 3 | +1.0% | +2.3% | +3.5% | +12.3% | 33% |
| yukselis | hayır | 3 | +3.0% | +4.2% | +4.9% | -2.9% | 0% |
| butce_vergi | hayır | 2 | +0.0% | -1.1% | -1.7% | +0.4% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 166 deneme. Al-tut Sharpe: eğitim 2.14, test -0.27.
Eğitimde seçilen kural: **amihud_20g < 0.1796 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.87 → test Sharpe -0.28; testte nakitte kalma oranı 83%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +5.0%, test -1.1%.
Deflated Sharpe (deneme sayısı 166): 0.05 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.0 |
| haftanin_gunu | 1.0 | 143 | +0.5% | 2.0 |
| haftanin_gunu | 2.0 | 141 | +0.1% | 0.3 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.2 |
| haftanin_gunu | 4.0 | 143 | +0.4% | 1.5 |
| ay_donusu | 0.0 | 522 | +0.3% | 1.9 |
| ay_donusu | 1.0 | 192 | +0.2% | 1.1 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 2.2 |
| bayram_oncesi | 1.0 | 6 | +0.4% | 0.4 |
| bayram_sonrasi | 0.0 | 708 | +0.2% | 2.1 |
| bayram_sonrasi | 1.0 | 6 | +1.8% | 1.2 |
| bilanco_sezonu | 0.0 | 423 | +0.3% | 1.9 |
| bilanco_sezonu | 1.0 | 291 | +0.2% | 1.2 |

## Son durum (en yeni satır)

getiri_1g=0.00447, getiri_5g=0.162, getiri_20g=0.00089, getiri_60g=-0.195, getiri_120g=-0.111, mom_12_1=-0.221, zirve_52h_yakinlik=0.705, zirveden_dusus=-0.295, oynaklik_20g=0.564, oynaklik_60g=0.447, atr_20g_oran=0.0409, rsi_14=56.6, ma20_uzaklik=0.0564, ma50_uzaklik=0.0141, ma200_uzaklik=-0.115, hacim_z_20=-1.25, amihud_20g=0.743, devir_hizi_20g=0.00637, gece_ort_20g=-0.00185, gunici_ort_20g=0.00387, aof_1g_sapma=0.00991, max_gunluk_20g=0.0961, min_gunluk_20g=-0.0589, ivol_60g=0.408, endekse_gore_1g=-0.0152, endekse_gore_20g=0.0467, endekse_gore_60g=-0.0214, beta_60g=0.669, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.231, piyasa_degeri_mn=2.87e+04, halka_aciklik=0.222, fk=7.84, kazanc_verimi=0.128, pd_dd=2.06, fd_favok=5.84, snak_verimi=0.0318, temettu_verimi=0.00523, roe_ttm=0.263, net_kar_marji=0.256, kar_buyume_yillik=0.245, satis_buyume_yillik=0.0105, net_borc_ozkaynak=-0.0943, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0