# Hisse dosyası analizi — TRENJ

Satır: 2287 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 204 (36 bağımsız bölüm); ≥%10 yükseliş 310 gün (39 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +603.5% (t=5.0), gün içi (açılış→kapanış) toplam -66.0% (t=-1.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kar_buyume_yillik | -0.971 | -39.1 | +0.74 |
| snak_verimi | 0.195 | 0.381 | -0.58 |
| devir_hizi_20g | 0.0207 | 0.0216 | -0.54 |
| piyasa_degeri_mn | 1.79e+04 | 1.52e+04 | +0.50 |
| halka_aciklik | 0.335 | 0.336 | -0.47 |
| endekse_gore_60g | 0.185 | 0.0423 | +0.42 |
| ma200_uzaklik | 0.168 | 0.178 | +0.42 |
| fk | 41.2 | 36.3 | +0.41 |
| getiri_120g | 0.186 | 0.177 | +0.35 |
| zirve_52h_yakinlik | 0.875 | 0.87 | +0.30 |
| getiri_60g | 0.156 | 0.0734 | +0.29 |
| zirveden_dusus | -0.125 | -0.13 | +0.28 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| devir_hizi_20g | 0.0369 | 0.0211 | +0.95 |
| kar_buyume_yillik | -39.1 | -1.73 | -0.52 |
| ma200_uzaklik | 0.162 | 0.215 | -0.47 |
| satis_buyume_yillik | 0.294 | 0.26 | -0.39 |
| halka_aciklik | 0.336 | 0.336 | +0.35 |
| piyasa_degeri_mn | 1.47e+04 | 1.62e+04 | -0.35 |
| snak_verimi | 0.381 | 0.312 | +0.35 |
| endekse_gore_60g | 0.0394 | 0.132 | -0.32 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| snak_verimi | 643 | 597 |  | +0.30 | 0.000 | -8.3% | +9.4% | 64% | 15% | 0.0848–0.161 | 0.452–0.599 |
| piyasa_degeri_mn | 692 | 684 | seviye | -0.26 | 0.000 | +12.3% | -3.7% | 8% | 49% | 8.28e+03–1.07e+04 | 2.42e+04–3.16e+04 |
| ma200_uzaklik | 493 | 493 |  | -0.27 | 0.000 | +14.9% | -1.0% | 10% | 52% | -0.151–0.0271 | 0.322–0.728 |
| devir_hizi_20g | 219 | 216 |  | +0.37 | 0.000 | -4.8% | +15.7% | 39% | 0% | 0.0126–0.0171 | 0.0374–0.0891 |
| endekse_gore_60g | 633 | 633 |  | -0.22 | 0.000 | +8.6% | +0.5% | 20% | 43% | -0.413–-0.163 | 0.25–0.576 |
| mom_12_1 | 441 | 440 |  | -0.22 | 0.000 | +9.0% | +0.5% | 24% | 26% | 0.124–0.386 | 0.739–1.29 |
| getiri_60g | 633 | 629 |  | -0.19 | 0.000 | +11.0% | +2.7% | 23% | 29% | -0.282–-0.0659 | 0.279–0.704 |
| dolar_getiri_60g | 633 | 633 |  | -0.17 | 0.001 | +10.9% | +3.2% | 23% | 27% | -0.309–-0.109 | 0.235–0.643 |
| getiri_120g | 573 | 573 |  | -0.18 | 0.001 | +13.7% | +1.0% | 12% | 42% | -0.218–-0.0123 | 0.396–1.3 |
| zirve_52h_yakinlik | 573 | 527 |  | -0.16 | 0.003 | +11.1% | +1.6% | 14% | 37% | 0.636–0.769 | 0.969–1.08 |
| zirveden_dusus | 573 | 479 |  | -0.16 | 0.004 | +11.1% | +1.6% | 14% | 37% | -0.364–-0.231 | -0.0313–0 |
| ivol_60g | 573 | 572 |  | -0.15 | 0.011 | +9.1% | +7.8% | 24% | 12% | 0.272–0.38 | 0.478–0.552 |
| pd_dd | 692 | 646 |  | -0.14 | 0.013 | +10.3% | +2.5% | 18% | 33% | 0.947–1.4 | 1.86–3.49 |
| oynaklik_60g | 632 | 628 |  | -0.13 | 0.034 | +9.1% | +2.7% | 25% | 28% | 0.371–0.445 | 0.528–0.582 |
| roe_ttm | 643 | 11 | çeyreklik adım | -0.13 | 0.038 | +4.5% | -1.1% | 22% | 35% | -0.134–-0.123 | 0.0883–0.149 |
| net_kar_marji | 693 | 12 | çeyreklik adım | -0.12 | 0.073 | +4.6% | +4.0% | 20% | 31% | -0.487–-0.0918 | 0.358–0.403 |
| kazanc_verimi | 643 | 597 |  | -0.12 | 0.088 | +6.4% | +0.6% | 22% | 29% | -0.0982–-0.0727 | 0.0362–0.1 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.10 | 0.513 | +5.9% | +1.9% | 21% | 38% | -0.766–-0.639 | -0.116–-0.1 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.3% | -0.6% | -0.9% | +3.4% | 61% |
| siyasi | hayır | 17 | +0.1% | +0.5% | +4.2% | +12.1% | 76% |
| derecelendirme | hayır | 15 | -0.8% | -0.8% | -4.9% | +2.6% | 33% |
| jeopolitik | hayır | 10 | -0.2% | -0.9% | -2.3% | -5.8% | 30% |
| enflasyon | hayır | 9 | +2.1% | -0.9% | +0.9% | -0.3% | 33% |
| regulasyon | hayır | 6 | +0.1% | +0.7% | +5.6% | +11.1% | 83% |
| haber | hayır | 5 | +2.2% | +0.6% | +3.0% | +1.3% | 20% |
| kuresel_faiz | hayır | 5 | +0.7% | -0.1% | +2.0% | +1.5% | 40% |
| sok | hayır | 5 | -3.9% | +2.1% | +6.6% | +9.2% | 100% |
| tarife | hayır | 5 | -0.5% | +0.7% | +2.3% | +2.7% | 80% |
| kur | hayır | 4 | -2.5% | -0.3% | -1.1% | -9.9% | 25% |
| dusus | hayır | 3 | -0.2% | +0.1% | +1.5% | +4.2% | 33% |
| yukselis | hayır | 3 | +2.9% | -0.7% | -5.3% | -15.1% | 0% |
| butce_vergi | hayır | 2 | +1.0% | +3.1% | +4.6% | +14.4% | 100% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 235 deneme. Al-tut Sharpe: eğitim 1.14, test 0.48.
Eğitimde seçilen kural: **zirve_52h_yakinlik > 0.9697 ise nakde geç** (kantil 0.8). Eğitim Sharpe 1.97 → test Sharpe 0.32; testte nakitte kalma oranı 18%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -2.5%, test +6.7%.
Deflated Sharpe (deneme sayısı 235): 0.12 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.2% | -0.9 |
| haftanin_gunu | 1.0 | 142 | -0.0% | -0.2 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -0.8 |
| haftanin_gunu | 3.0 | 143 | +0.8% | 3.5 |
| haftanin_gunu | 4.0 | 143 | +0.5% | 1.8 |
| ay_donusu | 0.0 | 521 | +0.3% | 1.9 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.4 |
| bayram_oncesi | 0.0 | 708 | +0.2% | 1.4 |
| bayram_oncesi | 1.0 | 5 | +0.6% | 0.3 |
| bayram_sonrasi | 0.0 | 707 | +0.2% | 1.5 |
| bayram_sonrasi | 1.0 | 6 | -1.0% | -1.1 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.7 |
| bilanco_sezonu | 1.0 | 291 | +0.3% | 1.4 |

## Son durum (en yeni satır)

getiri_1g=0.0347, getiri_5g=0.114, getiri_20g=-0.213, getiri_60g=-0.186, getiri_120g=-0.165, mom_12_1=0.277, zirve_52h_yakinlik=0.636, zirveden_dusus=-0.364, oynaklik_20g=0.635, oynaklik_60g=0.537, atr_20g_oran=0.0558, rsi_14=37.3, ma20_uzaklik=-0.0512, ma50_uzaklik=-0.176, ma200_uzaklik=-0.201, hacim_z_20=0.508, amihud_20g=0.517, devir_hizi_20g=0.0109, gece_ort_20g=-0.00808, gunici_ort_20g=-0.00203, aof_1g_sapma=0.00861, max_gunluk_20g=0.0604, min_gunluk_20g=-0.091, ivol_60g=0.403, endekse_gore_1g=0.0151, endekse_gore_20g=-0.167, endekse_gore_60g=-0.0122, beta_60g=1.26, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.223, piyasa_degeri_mn=2.01e+04, halka_aciklik=0.33, fk=8.52, kazanc_verimi=0.117, pd_dd=1.27, fd_favok=1.36, snak_verimi=0.121, temettu_verimi=0, roe_ttm=0.149, net_kar_marji=0.176, satis_buyume_yillik=0.226, net_borc_ozkaynak=-0.471, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0