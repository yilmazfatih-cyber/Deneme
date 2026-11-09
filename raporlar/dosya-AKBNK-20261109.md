# Hisse dosyası analizi — AKBNK

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 201 (31 bağımsız bölüm); ≥%10 yükseliş 239 gün (32 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +418.4% (t=4.5), gün içi (açılış→kapanış) toplam -62.9% (t=-1.3).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 3.71e+05 | 3.32e+05 | +0.94 |
| xu100_ma200_uzaklik | 0.14 | 0.0375 | +0.93 |
| getiri_120g | 0.195 | 0.0185 | +0.87 |
| ma200_uzaklik | 0.0898 | -0.00574 | +0.73 |
| zirveden_dusus | -0.13 | -0.202 | +0.61 |
| zirve_52h_yakinlik | 0.87 | 0.798 | +0.61 |
| max_gunluk_20g | 0.0634 | 0.0579 | +0.46 |
| usdtry_getiri_20g | 0.0124 | 0.015 | -0.43 |
| mom_12_1 | 0.206 | 0.114 | +0.40 |
| oynaklik_20g | 0.463 | 0.398 | +0.35 |
| gunici_ort_20g | -0.0006 | -0.00229 | +0.32 |
| aof_1g_sapma | 0.035 | 0.0361 | -0.28 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| piyasa_degeri_mn | 3.2e+05 | 3.59e+05 | -0.71 |
| zirveden_dusus | -0.225 | -0.138 | -0.63 |
| zirve_52h_yakinlik | 0.775 | 0.862 | -0.63 |
| getiri_120g | -0.00781 | 0.0888 | -0.61 |
| ma200_uzaklik | -0.0173 | 0.0862 | -0.57 |
| max_gunluk_20g | 0.0556 | 0.0598 | -0.51 |
| amihud_20g | 0.00437 | 0.00369 | +0.46 |
| xu100_ma200_uzaklik | 0.026 | 0.084 | -0.45 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 573 | 465 |  | -0.40 | 0.000 | +10.2% | -5.3% | 2% | 43% | 0.646–0.749 | 0.926–1.08 |
| zirveden_dusus | 573 | 455 |  | -0.40 | 0.000 | +10.2% | -5.3% | 2% | 43% | -0.354–-0.251 | -0.0745–0 |
| getiri_120g | 573 | 572 |  | -0.42 | 0.000 | +9.1% | -9.4% | 12% | 62% | -0.324–-0.0671 | 0.249–0.828 |
| ma200_uzaklik | 493 | 492 |  | -0.40 | 0.000 | +9.2% | -5.5% | 4% | 42% | -0.192–-0.0644 | 0.138–0.445 |
| max_gunluk_20g | 672 | 57 |  | -0.31 | 0.000 | +4.8% | -10.7% | 18% | 57% | 0.0235–0.0392 | 0.0762–0.101 |
| piyasa_degeri_mn | 692 | 688 | seviye | -0.49 | 0.000 | +12.0% | -6.4% | 4% | 63% | 2.02e+05–2.96e+05 | 3.75e+05–4.93e+05 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.32 | 0.000 | +7.4% | -4.4% | 12% | 69% | -0.118–-0.0163 | 0.144–0.312 |
| getiri_60g | 633 | 632 |  | -0.25 | 0.000 | +8.0% | -0.4% | 18% | 30% | -0.304–-0.143 | 0.313–0.675 |
| dolar_getiri_60g | 633 | 633 |  | -0.24 | 0.000 | +8.1% | -0.1% | 18% | 29% | -0.342–-0.177 | 0.255–0.633 |
| mom_12_1 | 441 | 441 |  | -0.29 | 0.000 | +7.1% | -2.2% | 11% | 33% | -0.304–-0.0182 | 0.472–0.872 |
| oynaklik_20g | 672 | 671 |  | -0.17 | 0.000 | +5.5% | -0.6% | 19% | 41% | 0.161–0.317 | 0.52–0.788 |
| xu100_getiri_20g | 673 | 671 |  | -0.17 | 0.000 | +4.1% | -2.1% | 21% | 37% | -0.166–-0.0409 | 0.0783–0.222 |
| gunici_ort_20g | 673 | 660 |  | -0.16 | 0.001 | +6.4% | -2.2% | 11% | 33% | -0.0141–-0.0053 | 0.0023–0.0192 |
| amihud_20g | 672 | 633 |  | +0.16 | 0.001 | +1.2% | +5.3% | 31% | 24% | 0.00128–0.00266 | 0.0053–0.00878 |
| endekse_gore_60g | 633 | 632 |  | -0.16 | 0.002 | +5.7% | +1.9% | 24% | 17% | -0.304–-0.119 | 0.151–0.532 |
| halka_aciklik | 692 | 34 | seviye | -0.15 | 0.004 | +10.0% | -0.7% | 15% | 56% | 0.526–0.529 | 0.537–0.541 |
| rsi_14 | 678 | 665 |  | -0.14 | 0.006 | +6.3% | +1.3% | 12% | 25% | 23.9–40 | 63.9–85.5 |
| getiri_20g | 673 | 669 |  | -0.14 | 0.016 | +5.8% | -1.6% | 19% | 33% | -0.33–-0.0767 | 0.135–0.557 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | -0.0% | +0.1% | +0.4% | -1.7% | 37% |
| siyasi | hayır | 17 | -0.1% | -0.9% | +0.5% | -0.2% | 41% |
| derecelendirme | hayır | 15 | -0.0% | -0.2% | +0.3% | +2.9% | 60% |
| haber | hayır | 10 | +0.2% | -0.4% | +0.6% | +1.7% | 50% |
| jeopolitik | hayır | 10 | -1.4% | +0.3% | -1.5% | -4.9% | 30% |
| enflasyon | hayır | 9 | +1.0% | +0.1% | +1.1% | +6.2% | 56% |
| regulasyon | hayır | 6 | -2.0% | +0.5% | -1.4% | -4.0% | 33% |
| kuresel_faiz | hayır | 5 | +1.7% | +0.1% | +2.5% | -2.0% | 20% |
| sok | hayır | 5 | -6.2% | +0.6% | +4.9% | +4.5% | 80% |
| tarife | hayır | 5 | +1.5% | +0.1% | +2.0% | -0.1% | 60% |
| kur | hayır | 4 | +0.6% | -0.9% | -3.5% | -4.2% | 25% |
| dusus | hayır | 3 | -1.4% | -3.1% | -2.7% | -1.4% | 33% |
| yukselis | hayır | 3 | +4.8% | -2.3% | -2.8% | -9.4% | 0% |
| butce_vergi | hayır | 2 | -0.1% | +0.4% | +2.7% | +4.7% | 50% |
| YÖN: olumlu | evet | 1 | - | -4.4% | -3.7% | +0.7% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 200 deneme. Al-tut Sharpe: eğitim 1.01, test 0.35.
Eğitimde seçilen kural: **getiri_1g < -0.01905 ise nakde geç** (kantil 0.2). Eğitim Sharpe 2.11 → test Sharpe 0.3; testte nakitte kalma oranı 19%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim +3.0%, test +1.7%.
Deflated Sharpe (deneme sayısı 200): 0.09 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.5% | 2.0 |
| haftanin_gunu | 1.0 | 142 | +0.1% | 0.5 |
| haftanin_gunu | 2.0 | 141 | -0.1% | -0.5 |
| haftanin_gunu | 3.0 | 143 | +0.2% | 0.9 |
| haftanin_gunu | 4.0 | 143 | -0.0% | -0.1 |
| ay_donusu | 0.0 | 521 | +0.2% | 2.0 |
| ay_donusu | 1.0 | 192 | -0.2% | -0.8 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 1.4 |
| bayram_oncesi | 1.0 | 5 | -1.3% | -2.4 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.1 |
| bayram_sonrasi | 1.0 | 6 | +2.5% | 1.9 |
| bilanco_sezonu | 0.0 | 422 | +0.2% | 1.3 |
| bilanco_sezonu | 1.0 | 291 | +0.1% | 0.5 |

## Son durum (en yeni satır)

getiri_1g=0.035, getiri_5g=0.119, getiri_20g=0.045, getiri_60g=0.029, getiri_120g=0.00567, mom_12_1=0.0895, zirve_52h_yakinlik=0.772, zirveden_dusus=-0.228, oynaklik_20g=0.398, oynaklik_60g=0.41, atr_20g_oran=0.0328, rsi_14=55.4, ma20_uzaklik=0.0753, ma50_uzaklik=0.0297, ma200_uzaklik=-0.0317, hacim_z_20=-0.0748, amihud_20g=0.00283, devir_hizi_20g=0.0408, gece_ort_20g=-0.00451, gunici_ort_20g=0.00509, aof_1g_sapma=0.0156, max_gunluk_20g=0.0685, min_gunluk_20g=-0.0364, ivol_60g=0.266, endekse_gore_1g=0.0123, endekse_gore_20g=0.0879, endekse_gore_60g=0.2, beta_60g=1.1, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.0176, piyasa_degeri_mn=3.69e+05, halka_aciklik=0.529, temettu_verimi=0.0311, olay_sayi_5g=2, olay_yon_5g=0