# Hisse dosyası analizi — ISCTR

Satır: 3979 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 197 (25 bağımsız bölüm); ≥%10 yükseliş 226 gün (22 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +229.5% (t=3.6), gün içi (açılış→kapanış) toplam -56.3% (t=-1.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| zirve_52h_yakinlik | 0.838 | 0.759 | +0.89 |
| zirveden_dusus | -0.162 | -0.241 | +0.89 |
| ma200_uzaklik | 0.0512 | -0.0325 | +0.85 |
| getiri_120g | 0.114 | -0.0297 | +0.82 |
| piyasa_degeri_mn | 3.76e+05 | 3.43e+05 | +0.81 |
| xu100_ma200_uzaklik | 0.122 | 0.049 | +0.67 |
| mom_12_1 | 0.118 | -0.00354 | +0.58 |
| oynaklik_20g | 0.399 | 0.367 | +0.34 |
| amihud_20g | 0.00333 | 0.00372 | -0.33 |
| getiri_60g | 0.0846 | -0.0285 | +0.33 |
| dolar_getiri_60g | 0.0336 | -0.0581 | +0.32 |
| oynaklik_60g | 0.386 | 0.397 | -0.32 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 3.23e+05 | 3.62e+05 | -0.84 |
| getiri_120g | -0.0487 | 0.0464 | -0.73 |
| zirveden_dusus | -0.273 | -0.201 | -0.70 |
| zirve_52h_yakinlik | 0.727 | 0.799 | -0.70 |
| ma200_uzaklik | -0.0709 | 0.0273 | -0.67 |
| endekse_gore_60g | -0.0673 | -0.0152 | -0.49 |
| dolar_getiri_60g | -0.102 | -0.00604 | -0.45 |
| getiri_60g | -0.0674 | 0.0257 | -0.43 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 470 |  | -0.46 | 0.000 | +8.5% | -8.4% | 14% | 66% | 0.574–0.707 | 0.867–1.04 |
| zirveden_dusus | 573 | 464 |  | -0.46 | 0.000 | +8.5% | -8.4% | 14% | 66% | -0.426–-0.293 | -0.133–0 |
| getiri_120g | 573 | 571 |  | -0.47 | 0.000 | +8.4% | -9.4% | 2% | 52% | -0.335–-0.135 | 0.182–0.788 |
| ma200_uzaklik | 493 | 492 |  | -0.41 | 0.000 | +7.5% | -6.1% | 14% | 58% | -0.247–-0.0982 | 0.0927–0.342 |
| piyasa_degeri_mn | 692 | 691 | seviye | -0.48 | 0.000 | +10.6% | -9.5% | 10% | 60% | 2.44e+05–3.1e+05 | 3.84e+05–4.72e+05 |
| mom_12_1 | 441 | 441 |  | -0.29 | 0.000 | +8.0% | -2.1% | 4% | 39% | -0.387–-0.101 | 0.286–0.602 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.27 | 0.000 | +5.4% | -3.1% | 23% | 54% | -0.118–-0.0163 | 0.144–0.312 |
| getiri_60g | 633 | 631 |  | -0.23 | 0.000 | +6.6% | -1.9% | 17% | 37% | -0.324–-0.155 | 0.254–0.637 |
| dolar_getiri_60g | 633 | 633 |  | -0.22 | 0.000 | +5.6% | -2.5% | 21% | 39% | -0.37–-0.193 | 0.207–0.617 |
| endekse_gore_60g | 633 | 633 |  | -0.21 | 0.000 | +6.5% | -3.9% | 17% | 40% | -0.254–-0.126 | 0.102–0.462 |
| amihud_20g | 672 | 611 |  | +0.18 | 0.000 | +0.7% | +4.6% | 30% | 16% | 0.00145–0.00256 | 0.00448–0.00859 |
| oynaklik_20g | 672 | 671 |  | -0.14 | 0.014 | +4.4% | -1.1% | 17% | 36% | 0.183–0.294 | 0.461–0.74 |
| oynaklik_60g | 632 | 631 |  | +0.14 | 0.021 | -1.8% | +4.0% | 35% | 19% | 0.244–0.353 | 0.435–0.498 |
| rsi_14 | 678 | 669 |  | -0.12 | 0.072 | +2.6% | -1.7% | 21% | 31% | 22.6–38.3 | 63.1–81.9 |
| aof_1g_sapma | 692 | 689 |  | +0.11 | 0.135 | -1.8% | +3.9% | 33% | 24% | -0.0514–0.0252 | 0.0612–0.124 |
| olay_sayi_5g | 693 | 8 |  | -0.10 | 0.253 | +2.1% | -2.0% | 26% | 39% | 0–1 | 2–7 |
| gunici_ort_20g | 673 | 655 |  | -0.09 | 0.595 | +3.1% | -1.6% | 16% | 35% | -0.014–-0.00484 | 0.0023–0.0104 |
| halka_aciklik | 692 | 47 | seviye | +0.09 | 0.786 | +0.6% | +8.1% | 25% | 11% | 0.167–0.323 | 0.327–0.332 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.2% | -0.2% | -0.0% | -1.6% | 39% |
| siyasi | hayır | 17 | -0.7% | -0.3% | +0.4% | -2.0% | 59% |
| derecelendirme | hayır | 15 | -0.6% | -0.7% | -0.3% | +1.1% | 47% |
| haber | hayır | 10 | +1.2% | -0.5% | +0.6% | +1.6% | 50% |
| jeopolitik | hayır | 10 | -0.7% | -0.3% | -1.1% | -1.1% | 30% |
| enflasyon | hayır | 9 | +0.6% | -0.3% | -0.0% | +5.4% | 67% |
| regulasyon | hayır | 6 | -1.1% | +0.7% | -1.5% | -5.3% | 17% |
| kuresel_faiz | hayır | 5 | +0.9% | +1.3% | +3.2% | -2.0% | 40% |
| sok | hayır | 5 | -6.9% | -0.1% | +4.4% | +5.0% | 80% |
| tarife | hayır | 5 | +1.2% | +0.9% | -0.0% | -3.9% | 40% |
| kur | hayır | 4 | -0.3% | -1.2% | -3.9% | -6.3% | 25% |
| dusus | hayır | 3 | -2.4% | -2.4% | +1.4% | -0.7% | 67% |
| yukselis | hayır | 3 | +3.9% | -0.9% | +0.8% | -1.0% | 67% |
| butce_vergi | hayır | 2 | -0.9% | +0.7% | +0.7% | +1.9% | 50% |
| YÖN: olumlu | evet | 3 | - | -1.4% | -0.3% | -9.5% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 192 deneme. Al-tut Sharpe: eğitim 0.89, test -0.00.
Eğitimde seçilen kural: **getiri_120g > -0.1281 ise nakde geç** (kantil 0.3). Eğitim Sharpe 2.44 → test Sharpe 0.39; testte nakitte kalma oranı 86%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -4.7%, test -0.4%.
Deflated Sharpe (deneme sayısı 192): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.7 |
| haftanin_gunu | 1.0 | 142 | +0.2% | 0.8 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.3 |
| haftanin_gunu | 3.0 | 143 | +0.3% | 1.2 |
| haftanin_gunu | 4.0 | 143 | -0.1% | -0.4 |
| ay_donusu | 0.0 | 521 | +0.1% | 1.2 |
| ay_donusu | 1.0 | 192 | -0.0% | -0.2 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.0 |
| bayram_oncesi | 1.0 | 5 | -1.2% | -3.8 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 0.8 |
| bayram_sonrasi | 1.0 | 6 | +0.9% | 0.9 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 0.8 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.0354, getiri_5g=0.115, getiri_20g=0.0845, getiri_60g=0.0966, getiri_120g=-0.0115, mom_12_1=-0.0398, zirve_52h_yakinlik=0.759, zirveden_dusus=-0.241, oynaklik_20g=0.371, oynaklik_60g=0.468, atr_20g_oran=0.031, rsi_14=59, ma20_uzaklik=0.086, ma50_uzaklik=0.0622, ma200_uzaklik=-0.0174, hacim_z_20=0.691, amihud_20g=0.00373, devir_hizi_20g=0.0486, gece_ort_20g=-0.00339, gunici_ort_20g=0.00554, aof_1g_sapma=0.0131, max_gunluk_20g=0.0548, min_gunluk_20g=-0.0371, ivol_60g=0.316, endekse_gore_1g=0.0127, endekse_gore_20g=0.128, endekse_gore_60g=0.268, beta_60g=1.23, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=0.0469, piyasa_degeri_mn=3.43e+05, halka_aciklik=0.293, temettu_verimi=0.0393, olay_sayi_5g=2, olay_yon_5g=0