# Hisse dosyası analizi — OTKAR

Satır: 3978 (gün sonu satırı 711) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 234 (32 bağımsız bölüm); ≥%10 yükseliş 195 gün (27 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
711 günde gece (kapanış→açılış) toplam +217.0% (t=3.0), gün içi (açılış→kapanış) toplam -77.2% (t=-2.5).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirve_52h_yakinlik | 0.747 | 0.647 | +0.83 |
| zirveden_dusus | -0.253 | -0.353 | +0.83 |
| ma200_uzaklik | -0.0607 | -0.158 | +0.71 |
| dolar_getiri_60g | -0.0291 | -0.128 | +0.66 |
| getiri_60g | 0.0196 | -0.0892 | +0.65 |
| getiri_120g | -0.0249 | -0.171 | +0.55 |
| endekse_gore_60g | 0.00039 | -0.115 | +0.50 |
| xu100_ma200_uzaklik | 0.0995 | 0.0494 | +0.49 |
| piyasa_degeri_mn | 5.76e+04 | 5.2e+04 | +0.48 |
| ma50_uzaklik | 0.0115 | -0.0468 | +0.47 |
| rsi_14 | 51.2 | 44.5 | +0.45 |
| mom_12_1 | -0.0469 | -0.0904 | +0.36 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| xu100_ma200_uzaklik | 0.0347 | 0.0946 | -0.66 |
| zirveden_dusus | -0.371 | -0.301 | -0.66 |
| zirve_52h_yakinlik | 0.629 | 0.699 | -0.66 |
| fk | 21.9 | 25.1 | -0.61 |
| mom_12_1 | -0.212 | -0.0346 | -0.61 |
| net_kar_marji | -0.0547 | -0.0852 | +0.49 |
| dolar_getiri_60g | -0.168 | -0.0711 | -0.46 |
| getiri_60g | -0.136 | -0.0343 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| getiri_60g | 631 | 628 |  | -0.33 | 0.000 | +4.2% | -5.4% | 10% | 53% | -0.367–-0.185 | 0.11–0.565 |
| zirveden_dusus | 571 | 500 |  | -0.45 | 0.000 | +6.8% | -9.1% | 23% | 69% | -0.523–-0.394 | -0.178–0 |
| zirve_52h_yakinlik | 571 | 500 |  | -0.45 | 0.000 | +6.8% | -9.1% | 23% | 69% | 0.477–0.606 | 0.822–1 |
| dolar_getiri_60g | 631 | 630 |  | -0.35 | 0.000 | +4.9% | -5.6% | 11% | 53% | -0.398–-0.216 | 0.06–0.487 |
| xu100_ma200_uzaklik | 491 | 491 |  | -0.34 | 0.000 | +3.3% | -6.3% | 28% | 45% | -0.118–-0.0157 | 0.144–0.312 |
| mom_12_1 | 439 | 439 |  | -0.34 | 0.000 | +8.2% | -7.0% | 22% | 50% | -0.481–-0.32 | 0.0976–0.349 |
| ma200_uzaklik | 491 | 491 |  | -0.31 | 0.000 | +5.4% | -4.1% | 16% | 53% | -0.328–-0.196 | 0.0317–0.312 |
| piyasa_degeri_mn | 690 | 532 | seviye | -0.24 | 0.000 | -0.4% | -6.7% | 29% | 57% | 3.29e+04–4.55e+04 | 6.14e+04–7.91e+04 |
| endekse_gore_60g | 631 | 630 |  | -0.25 | 0.000 | +0.5% | -7.8% | 20% | 61% | -0.47–-0.181 | 0.0671–0.386 |
| pd_dd | 690 | 630 |  | -0.22 | 0.000 | +2.8% | -3.3% | 25% | 45% | 4.04–5.21 | 7.47–26.3 |
| ma50_uzaklik | 641 | 640 |  | -0.20 | 0.000 | +2.2% | -2.7% | 19% | 45% | -0.229–-0.0997 | 0.0652–0.332 |
| rsi_14 | 676 | 666 |  | -0.18 | 0.000 | +2.2% | -1.7% | 18% | 42% | 20.5–36 | 58.9–85.4 |
| beta_60g | 630 | 630 |  | +0.18 | 0.000 | -5.2% | +3.6% | 44% | 35% | 0.249–0.662 | 1.03–1.19 |
| amihud_20g | 670 | 668 |  | +0.18 | 0.000 | -5.4% | +4.4% | 50% | 25% | 0.031–0.0831 | 0.163–0.897 |
| fd_favok | 641 | 582 |  | -0.17 | 0.001 | +3.5% | +0.2% | 19% | 45% | 13.6–15.7 | 44.5–122 |
| getiri_120g | 571 | 569 |  | -0.18 | 0.001 | -1.5% | -4.9% | 23% | 49% | -0.394–-0.238 | 0.134–0.561 |
| net_borc_ozkaynak | 691 | 12 | çeyreklik adım | -0.16 | 0.002 | +4.2% | -2.9% | 29% | 41% | 1.12–1.68 | 4.15–7.79 |
| satis_buyume_yillik | 603 | 10 | çeyreklik adım | +0.17 | 0.002 | -4.1% | +5.9% | 47% | 17% | -0.264–-0.0322 | 0.541–0.548 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.4% | -0.1% | +0.4% | -1.0% | 32% |
| siyasi | hayır | 17 | -0.0% | +0.7% | +0.3% | -1.2% | 35% |
| derecelendirme | hayır | 15 | -0.0% | +0.6% | +0.1% | -1.2% | 40% |
| jeopolitik | hayır | 10 | +0.0% | -0.7% | -1.7% | -0.8% | 50% |
| enflasyon | hayır | 9 | +1.0% | -1.2% | -0.1% | -8.8% | 22% |
| regulasyon | hayır | 6 | +0.4% | -0.7% | -1.7% | -6.2% | 33% |
| haber | hayır | 5 | +0.1% | -1.3% | -1.2% | +2.0% | 20% |
| kuresel_faiz | hayır | 5 | -0.6% | +0.6% | -0.3% | +2.4% | 40% |
| sok | hayır | 5 | -4.2% | +1.9% | +5.7% | +13.9% | 80% |
| tarife | hayır | 5 | -0.0% | -0.8% | -1.6% | -4.4% | 60% |
| kur | hayır | 4 | -1.8% | +0.9% | +5.4% | +3.0% | 50% |
| dusus | hayır | 3 | -1.9% | +0.7% | +1.5% | +2.7% | 33% |
| yukselis | hayır | 3 | +3.4% | +0.1% | -0.2% | +15.0% | 100% |
| butce_vergi | hayır | 2 | -0.2% | -1.4% | -0.2% | -20.7% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 426 gün, test 285 gün, 218 deneme. Al-tut Sharpe: eğitim 0.61, test -1.07.
Eğitimde seçilen kural: **zirve_52h_yakinlik > 0.6404 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.73 → test Sharpe 0.27; testte nakitte kalma oranı 61%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -5.7%, test -4.1%.
Deflated Sharpe (deneme sayısı 218): 0.02 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 143 | -0.4% | -1.7 |
| haftanin_gunu | 1.0 | 141 | +0.1% | 0.5 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -0.9 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.5 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.3 |
| ay_donusu | 0.0 | 519 | +0.0% | 0.2 |
| ay_donusu | 1.0 | 192 | -0.1% | -0.6 |
| bayram_oncesi | 0.0 | 706 | -0.0% | -0.2 |
| bayram_oncesi | 1.0 | 5 | +0.9% | 1.5 |
| bayram_sonrasi | 0.0 | 705 | -0.0% | -0.2 |
| bayram_sonrasi | 1.0 | 6 | +0.2% | 0.2 |
| bilanco_sezonu | 0.0 | 422 | -0.1% | -0.4 |
| bilanco_sezonu | 1.0 | 289 | +0.0% | 0.3 |

## Son durum (en yeni satır)

getiri_1g=-0.00163, getiri_5g=0.00987, getiri_20g=-0.113, getiri_60g=-0.0176, getiri_120g=-0.165, mom_12_1=-0.3, zirve_52h_yakinlik=0.579, zirveden_dusus=-0.421, oynaklik_20g=0.441, oynaklik_60g=0.477, atr_20g_oran=0.0384, rsi_14=48.2, ma20_uzaklik=-0.0161, ma50_uzaklik=-0.0222, ma200_uzaklik=-0.138, hacim_z_20=-0.795, amihud_20g=0.276, devir_hizi_20g=0.00994, gece_ort_20g=-0.00648, gunici_ort_20g=0.00107, aof_1g_sapma=0.00612, max_gunluk_20g=0.0567, min_gunluk_20g=-0.0458, ivol_60g=0.359, endekse_gore_1g=-0.0213, endekse_gore_20g=-0.0675, endekse_gore_60g=0.156, beta_60g=1.09, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0621, piyasa_degeri_mn=3.68e+04, halka_aciklik=0.26, kazanc_verimi=-0.168, pd_dd=6.69, fd_favok=116, snak_verimi=-0.444, temettu_verimi=0, roe_ttm=-1.13, net_kar_marji=-0.249, kar_buyume_yillik=-6.76, satis_buyume_yillik=-0.264, net_borc_ozkaynak=7.79, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0