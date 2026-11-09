# Hisse dosyası analizi — AGHOL

Satır: 3981 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 187 (24 bağımsız bölüm); ≥%10 yükseliş 239 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +233.0% (t=3.1), gün içi (açılış→kapanış) toplam -57.2% (t=-1.3).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 8.39e+04 | 7.41e+04 | +1.02 |
| endekse_gore_20g | 0.0341 | -0.0155 | +0.76 |
| zirveden_dusus | -0.193 | -0.298 | +0.72 |
| zirve_52h_yakinlik | 0.807 | 0.702 | +0.72 |
| getiri_120g | 0.052 | -0.0245 | +0.70 |
| ma200_uzaklik | 0.0204 | -0.0482 | +0.69 |
| fd_favok | 2.82 | 2.74 | +0.65 |
| ma50_uzaklik | 0.0424 | -0.0135 | +0.58 |
| endekse_gore_60g | 0.0255 | -0.0391 | +0.50 |
| getiri_20g | 0.0556 | -0.0058 | +0.45 |
| halka_aciklik | 0.379 | 0.379 | -0.45 |
| gece_ort_20g | 0.00316 | 0.00212 | +0.44 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 7.29e+04 | 7.97e+04 | -0.65 |
| mom_12_1 | -0.093 | 0.0823 | -0.63 |
| net_kar_marji | 0.0172 | 0.00998 | +0.52 |
| devir_hizi_20g | 0.00567 | 0.00568 | +0.46 |
| ivol_60g | 0.237 | 0.271 | -0.46 |
| kazanc_verimi | 0.0763 | 0.0644 | +0.46 |
| zirveden_dusus | -0.282 | -0.25 | -0.34 |
| zirve_52h_yakinlik | 0.718 | 0.75 | -0.34 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 693 | 693 | seviye | -0.46 | 0.000 | +8.1% | -6.5% | 0% | 62% | 5.37e+04–6.8e+04 | 8.49e+04–1.18e+05 |
| ivol_60g | 574 | 572 |  | -0.31 | 0.000 | +4.5% | -6.3% | 12% | 40% | 0.159–0.205 | 0.367–0.444 |
| getiri_120g | 574 | 573 |  | -0.30 | 0.000 | +3.4% | -8.4% | 10% | 59% | -0.347–-0.107 | 0.193–1.12 |
| zirve_52h_yakinlik | 574 | 487 |  | -0.29 | 0.000 | +3.7% | -7.7% | 9% | 55% | 0.523–0.65 | 0.91–1.05 |
| zirveden_dusus | 574 | 473 |  | -0.29 | 0.000 | +3.7% | -7.7% | 9% | 55% | -0.477–-0.35 | -0.0904–0 |
| fd_favok | 644 | 631 |  | -0.21 | 0.000 | +1.7% | -5.6% | 16% | 58% | 2.07–2.47 | 2.96–3.66 |
| ma200_uzaklik | 494 | 494 |  | -0.23 | 0.000 | +2.6% | -5.5% | 5% | 49% | -0.207–-0.106 | 0.1–0.284 |
| mom_12_1 | 442 | 442 |  | -0.23 | 0.000 | +3.9% | -1.8% | 18% | 17% | -0.474–-0.188 | 0.207–0.756 |
| gunici_ort_20g | 674 | 662 |  | -0.18 | 0.000 | +5.9% | -2.0% | 14% | 33% | -0.0134–-0.00419 | 0.00252–0.00958 |
| endekse_gore_60g | 634 | 632 |  | -0.18 | 0.000 | +6.4% | -1.6% | 13% | 47% | -0.233–-0.126 | 0.102–0.47 |
| endekse_gore_20g | 674 | 674 |  | -0.17 | 0.000 | +2.2% | -4.0% | 8% | 47% | -0.241–-0.0585 | 0.0683–0.302 |
| getiri_60g | 634 | 631 |  | -0.14 | 0.017 | +4.6% | +2.2% | 15% | 32% | -0.355–-0.0905 | 0.198–0.621 |
| oynaklik_60g | 633 | 632 |  | -0.14 | 0.029 | +0.2% | -1.5% | 29% | 22% | 0.245–0.318 | 0.431–0.539 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.13 | 0.043 | +1.9% | +11.5% | 17% | 3% | -0.0161–0.00264 | 0.0512–0.0747 |
| kazanc_verimi | 644 | 594 |  | +0.13 | 0.044 | +0.1% | +9.2% | 30% | 16% | 0.0323–0.0414 | 0.28–0.447 |
| fk | 644 | 639 |  | -0.13 | 0.044 | +9.2% | +0.1% | 16% | 30% | 2.24–3.58 | 24.2–31 |
| ma50_uzaklik | 644 | 643 |  | -0.13 | 0.055 | +2.9% | -3.9% | 12% | 47% | -0.187–-0.0853 | 0.103–0.301 |
| usdtry_getiri_20g | 673 | 665 |  | -0.12 | 0.102 | +5.6% | +3.0% | 21% | 16% | -0.013–0.00945 | 0.019–0.0482 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.7% | -0.3% | -0.4% | +0.7% | 39% |
| siyasi | hayır | 17 | -0.7% | +0.9% | +1.2% | -0.8% | 41% |
| derecelendirme | hayır | 15 | +1.1% | +0.1% | +0.1% | -0.3% | 40% |
| jeopolitik | hayır | 10 | -1.3% | +0.4% | -1.3% | -0.0% | 40% |
| enflasyon | hayır | 9 | +1.1% | +1.2% | +2.9% | +0.2% | 44% |
| regulasyon | hayır | 6 | +2.0% | +1.3% | +1.0% | +4.9% | 67% |
| haber | hayır | 5 | +0.9% | +1.5% | +4.4% | +1.4% | 40% |
| kuresel_faiz | hayır | 5 | +2.3% | +0.5% | +1.4% | -1.9% | 20% |
| sok | hayır | 5 | -4.1% | +2.7% | +4.8% | +5.8% | 80% |
| tarife | hayır | 5 | +2.7% | -0.7% | -2.0% | -6.0% | 40% |
| kur | hayır | 4 | -0.8% | +0.5% | -1.6% | -4.7% | 25% |
| dusus | hayır | 3 | -2.5% | +0.0% | -0.5% | -2.8% | 0% |
| yukselis | hayır | 3 | +2.2% | +0.5% | -0.9% | -3.5% | 33% |
| butce_vergi | hayır | 2 | -1.8% | -0.4% | -5.8% | -7.1% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 178 deneme. Al-tut Sharpe: eğitim 0.64, test 0.23.
Eğitimde seçilen kural: **ivol_60g > 0.237 ise nakde geç** (kantil 0.2). Eğitim Sharpe 1.80 → test Sharpe 0.9; testte nakitte kalma oranı 44%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.5%, test -2.8%.
Deflated Sharpe (deneme sayısı 178): 0.21 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.0% | 0.2 |
| haftanin_gunu | 1.0 | 143 | -0.1% | -0.6 |
| haftanin_gunu | 2.0 | 141 | +0.0% | 0.1 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 1.2 |
| haftanin_gunu | 4.0 | 143 | +0.2% | 1.1 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.7 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.8 |
| bayram_oncesi | 1.0 | 6 | -0.3% | -0.7 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.9 |
| bayram_sonrasi | 1.0 | 6 | -0.4% | -0.4 |
| bilanco_sezonu | 0.0 | 423 | +0.1% | 1.0 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.0154, getiri_5g=0.151, getiri_20g=-0.112, getiri_60g=-0.0693, getiri_120g=-0.184, mom_12_1=0.211, zirve_52h_yakinlik=0.785, zirveden_dusus=-0.215, oynaklik_20g=0.614, oynaklik_60g=0.445, atr_20g_oran=0.0452, rsi_14=45.9, ma20_uzaklik=-0.00484, ma50_uzaklik=-0.0829, ma200_uzaklik=-0.105, hacim_z_20=-0.646, amihud_20g=0.252, devir_hizi_20g=0.00683, gece_ort_20g=-0.00613, gunici_ort_20g=0.00095, aof_1g_sapma=0.0235, max_gunluk_20g=0.0857, min_gunluk_20g=-0.0749, ivol_60g=0.411, endekse_gore_1g=-0.00428, endekse_gore_20g=-0.0662, endekse_gore_60g=0.104, beta_60g=0.68, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.112, piyasa_degeri_mn=7.06e+04, halka_aciklik=0.295, fk=14.3, kazanc_verimi=0.0699, pd_dd=0.532, fd_favok=2.62, snak_verimi=0.631, temettu_verimi=0.0241, roe_ttm=0.0372, net_kar_marji=0.00564, kar_buyume_yillik=1.19, satis_buyume_yillik=0.0252, net_borc_ozkaynak=0.739, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0