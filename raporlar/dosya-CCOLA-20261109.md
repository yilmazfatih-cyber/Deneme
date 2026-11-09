# Hisse dosyası analizi — CCOLA

Satır: 3979 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 155 (22 bağımsız bölüm); ≥%10 yükseliş 214 gün (29 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam -78.2% (t=0.0), gün içi (açılış→kapanış) toplam -35.0% (t=-0.6).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| oynaklik_60g | 0.409 | 0.357 | +1.07 |
| ivol_60g | 0.33 | 0.288 | +1.03 |
| beta_60g | 0.665 | 0.824 | -1.00 |
| ma50_uzaklik | 0.00966 | 0.00587 | -0.88 |
| roe_ttm | 0.676 | 0.265 | +0.79 |
| endekse_gore_60g | 0.0369 | 0.0139 | -0.76 |
| getiri_60g | -0.0072 | 0.0307 | -0.73 |
| dolar_getiri_60g | -0.0621 | -0.00555 | -0.72 |
| bilancodan_gun | 69 | 44 | +0.60 |
| kar_buyume_yillik | 0.264 | -0.0982 | +0.48 |
| olay_sayi_5g | 0 | 0 | -0.45 |
| oynaklik_20g | 0.37 | 0.34 | +0.42 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirveden_dusus | -0.131 | -0.636 | +0.49 |
| zirve_52h_yakinlik | 0.869 | 0.364 | +0.49 |
| satis_buyume_yillik | 0.295 | 0.258 | +0.48 |
| net_borc_ozkaynak | 0.357 | 0.482 | -0.47 |
| oynaklik_60g | 0.343 | 0.375 | -0.43 |
| aof_1g_sapma | 0.0256 | 0.025 | +0.42 |
| ivol_60g | 0.263 | 0.302 | -0.41 |
| dolar_getiri_60g | 0.0787 | -0.0437 | +0.40 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| oynaklik_60g | 633 | 633 |  | -0.34 | 0.000 | +6.8% | -5.7% | 10% | 46% | 0.26–0.309 | 0.412–1.9 |
| ivol_60g | 574 | 572 |  | -0.34 | 0.000 | +6.9% | -0.9% | 3% | 43% | 0.18–0.221 | 0.377–1.88 |
| fd_favok | 644 | 624 |  | -0.33 | 0.000 | +8.5% | -11.4% | 0% | 40% | 4.57–5.4 | 6.59–94.8 |
| bilancodan_gun | 694 | 303 | seviye | -0.22 | 0.000 | +3.1% | -3.7% | 12% | 40% | 0.917–19 | 79–113 |
| pd_dd | 693 | 670 |  | -0.21 | 0.000 | +6.4% | -5.8% | 1% | 27% | 1.99–2.33 | 29.1–58.7 |
| oynaklik_20g | 673 | 672 |  | -0.20 | 0.000 | +3.5% | -5.0% | 11% | 39% | 0.172–0.291 | 0.411–3.25 |
| max_gunluk_20g | 673 | 65 |  | -0.18 | 0.000 | +2.1% | -6.4% | 21% | 42% | 0.00512–0.0318 | 0.0683–0.0752 |
| usdtry_getiri_20g | 673 | 665 |  | -0.17 | 0.000 | -1.1% | -0.0% | 27% | 24% | -0.013–0.00945 | 0.019–0.0482 |
| atr_20g_oran | 673 | 665 |  | -0.17 | 0.001 | +4.5% | -3.3% | 12% | 43% | 0.0172–0.0263 | 0.0366–0.871 |
| dolar_getiri_60g | 634 | 634 |  | +0.15 | 0.007 | -0.4% | -8.7% | 40% | 28% | -0.949–-0.148 | 0.168–0.468 |
| getiri_60g | 634 | 631 |  | +0.15 | 0.010 | -0.1% | -6.8% | 40% | 27% | -0.947–-0.0956 | 0.226–0.477 |
| net_borc_ozkaynak | 694 | 12 | çeyreklik adım | -0.13 | 0.018 | +1.2% | +1.1% | 25% | 11% | 0.316–0.329 | 0.57–0.598 |
| roe_ttm | 644 | 11 | çeyreklik adım | -0.14 | 0.024 | +1.6% | -2.2% | 15% | 58% | 0.186–0.252 | 0.696–0.696 |
| snak_verimi | 644 | 575 |  | +0.13 | 0.035 | -9.3% | +1.9% | 24% | 17% | 0.00217–0.0177 | 0.0998–0.124 |
| net_kar_marji | 694 | 12 | çeyreklik adım | +0.12 | 0.075 | +1.1% | +9.7% | 10% | 19% | -0.0169–0.0353 | 0.245–0.303 |
| kazanc_verimi | 644 | 578 |  | -0.12 | 0.080 | -8.8% | -0.9% | 28% | 36% | 0.0115–0.0845 | 0.153–0.252 |
| fk | 644 | 629 |  | +0.12 | 0.080 | -0.9% | -8.8% | 36% | 28% | 3.97–6.54 | 11.8–86.9 |
| hacim_z_20 | 673 | 673 |  | -0.12 | 0.109 | +2.2% | -2.0% | 20% | 25% | -2.64–-0.778 | 0.754–36.3 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 23 | +0.6% | -0.2% | -0.4% | +2.2% | 48% |
| siyasi | hayır | 9 | -0.8% | +0.2% | -0.8% | +2.4% | 67% |
| enflasyon | hayır | 6 | +0.4% | +0.6% | -1.3% | +0.8% | 50% |
| jeopolitik | hayır | 5 | -0.6% | -1.4% | +0.6% | +5.2% | 80% |
| sok | hayır | 5 | -2.9% | +3.5% | +3.4% | +15.4% | 100% |
| tarife | hayır | 5 | +1.8% | +0.0% | +0.6% | +1.2% | 40% |
| derecelendirme | hayır | 4 | +0.3% | -0.2% | -6.7% | -1.3% | 25% |
| dusus | hayır | 3 | +1.2% | +1.7% | -0.9% | +0.7% | 33% |
| yukselis | hayır | 3 | +3.0% | +0.3% | +1.6% | -3.9% | 33% |
| butce_vergi | hayır | 2 | -0.5% | -0.5% | -1.6% | -0.3% | 50% |
| kur | hayır | 2 | -1.2% | +4.8% | +8.0% | +2.2% | 50% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 163 deneme. Al-tut Sharpe: eğitim -0.60, test 1.35.
Eğitimde seçilen kural: **fd_favok > 5.618 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.53 → test Sharpe 1.67; testte nakitte kalma oranı 50%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -7.9%, test +0.5%.
Deflated Sharpe (deneme sayısı 163): 0.50 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.7 |
| haftanin_gunu | 1.0 | 143 | -0.1% | -0.5 |
| haftanin_gunu | 2.0 | 141 | -0.2% | -1.3 |
| haftanin_gunu | 3.0 | 143 | -0.3% | -0.5 |
| haftanin_gunu | 4.0 | 143 | +0.3% | 1.7 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.9 |
| ay_donusu | 1.0 | 192 | -0.4% | -0.8 |
| bayram_oncesi | 0.0 | 708 | -0.0% | -0.3 |
| bayram_oncesi | 1.0 | 6 | +0.0% | 0.1 |
| bayram_sonrasi | 0.0 | 708 | -0.0% | -0.2 |
| bayram_sonrasi | 1.0 | 6 | -0.3% | -0.4 |
| bilanco_sezonu | 0.0 | 423 | +0.2% | 1.9 |
| bilanco_sezonu | 1.0 | 291 | -0.4% | -1.2 |

## Son durum (en yeni satır)

getiri_1g=0.0295, getiri_5g=0, getiri_20g=-0.0984, getiri_60g=-0.088, getiri_120g=-0.0907, mom_12_1=0.457, zirve_52h_yakinlik=0.813, zirveden_dusus=-0.187, oynaklik_20g=0.38, oynaklik_60g=0.337, atr_20g_oran=0.0397, rsi_14=42.2, ma20_uzaklik=-0.0157, ma50_uzaklik=-0.0348, ma200_uzaklik=-0.0394, hacim_z_20=1.12, amihud_20g=0.0758, devir_hizi_20g=0.00628, gece_ort_20g=-0.00588, gunici_ort_20g=0.00128, aof_1g_sapma=0.0302, max_gunluk_20g=0.0391, min_gunluk_20g=-0.0401, ivol_60g=0.306, endekse_gore_1g=0.0133, endekse_gore_20g=-0.0493, endekse_gore_60g=0.0883, beta_60g=0.489, xu100_getiri_20g=-0.0491, xu100_ma200_uzaklik=-0.141, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.129, piyasa_degeri_mn=2.1e+05, halka_aciklik=0.293, fk=9.17, kazanc_verimi=0.109, pd_dd=2.3, fd_favok=5.11, snak_verimi=0.112, temettu_verimi=0.019, roe_ttm=0.25, net_kar_marji=0.122, kar_buyume_yillik=0.275, satis_buyume_yillik=0.0594, net_borc_ozkaynak=0.328, bilancodan_gun=81.8, olay_sayi_5g=1, olay_yon_5g=-1