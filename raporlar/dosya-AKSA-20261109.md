# Hisse dosyası analizi — AKSA

Satır: 3980 (gün sonu satırı 714) · 2024-01-02 18:00:00 → 2026-11-09 14:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 162 (26 bağımsız bölüm); ≥%10 yükseliş 204 gün (31 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
714 günde gece (kapanış→açılış) toplam +262.5% (t=3.9), gün içi (açılış→kapanış) toplam -66.3% (t=-1.8).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | 0.227 | 0.0165 | +1.39 |
| ma200_uzaklik | 0.125 | -0.0142 | +1.25 |
| piyasa_degeri_mn | 4.68e+04 | 4.15e+04 | +1.13 |
| fd_favok | 8.44 | 7.31 | +1.01 |
| zirve_52h_yakinlik | 0.903 | 0.802 | +0.95 |
| zirveden_dusus | -0.0971 | -0.198 | +0.94 |
| mom_12_1 | 0.287 | 0.0546 | +0.82 |
| endekse_gore_60g | 0.0703 | -0.032 | +0.76 |
| usdtry_getiri_20g | 0.0166 | 0.013 | +0.71 |
| beta_60g | 0.682 | 0.787 | -0.68 |
| temettu_verimi | 0.0375 | 0.0472 | -0.66 |
| atr_20g_oran | 0.0363 | 0.0322 | +0.64 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| getiri_120g | -0.0464 | 0.0752 | -0.72 |
| piyasa_degeri_mn | 4.05e+04 | 4.34e+04 | -0.71 |
| halka_aciklik | 0.332 | 0.326 | +0.57 |
| max_gunluk_20g | 0.0395 | 0.0522 | -0.50 |
| zirve_52h_yakinlik | 0.788 | 0.829 | -0.47 |
| zirveden_dusus | -0.212 | -0.171 | -0.47 |
| aof_1g_sapma | 0.101 | 0.0609 | +0.42 |
| ma200_uzaklik | -0.0194 | 0.0331 | -0.41 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| zirve_52h_yakinlik | 574 | 441 |  | -0.40 | 0.000 | +6.8% | -7.2% | 2% | 57% | 0.651–0.735 | 0.918–1.03 |
| zirveden_dusus | 574 | 425 |  | -0.40 | 0.000 | +6.8% | -7.2% | 2% | 57% | -0.349–-0.265 | -0.0823–0 |
| getiri_120g | 574 | 572 |  | -0.61 | 0.000 | +8.8% | -9.3% | 1% | 72% | -0.273–-0.0981 | 0.185–0.7 |
| ma200_uzaklik | 494 | 494 |  | -0.41 | 0.000 | +6.2% | -4.8% | 2% | 53% | -0.157–-0.0472 | 0.121–0.313 |
| piyasa_degeri_mn | 693 | 685 | seviye | -0.50 | 0.000 | +9.6% | -6.4% | 4% | 57% | 3.22e+04–3.82e+04 | 4.7e+04–5.71e+04 |
| beta_60g | 633 | 633 |  | +0.30 | 0.000 | -4.4% | +4.0% | 45% | 9% | 0.242–0.574 | 0.897–1.1 |
| fd_favok | 644 | 624 |  | -0.30 | 0.000 | +2.1% | -7.3% | 11% | 64% | 5.42–6.19 | 8.33–10.2 |
| ivol_60g | 574 | 572 |  | -0.29 | 0.000 | +4.7% | -6.0% | 11% | 43% | 0.195–0.252 | 0.365–0.44 |
| mom_12_1 | 442 | 440 |  | -0.32 | 0.000 | +3.4% | -2.6% | 12% | 44% | -0.298–-0.0927 | 0.322–0.767 |
| temettu_verimi | 694 | 459 |  | +0.25 | 0.000 | -2.1% | +3.9% | 52% | 1% | 0–0.0358 | 0.0504–0.104 |
| endekse_gore_60g | 634 | 634 |  | -0.25 | 0.000 | +3.9% | -4.8% | 12% | 52% | -0.386–-0.129 | 0.143–0.4 |
| max_gunluk_20g | 673 | 63 |  | -0.24 | 0.000 | +2.1% | -0.5% | 16% | 15% | 0.0158–0.0331 | 0.0644–0.0993 |
| amihud_20g | 653 | 650 |  | +0.23 | 0.000 | -3.9% | +6.4% | 45% | 11% | 0.0459–0.0802 | 0.145–0.264 |
| halka_aciklik | 693 | 60 | seviye | +0.20 | 0.000 | -0.4% | +6.8% | 14% | 17% | 0.303–0.317 | 0.332–0.348 |
| oynaklik_20g | 673 | 673 |  | -0.20 | 0.000 | +5.7% | -0.2% | 7% | 38% | 0.152–0.287 | 0.449–0.617 |
| xu100_getiri_20g | 674 | 672 |  | +0.19 | 0.000 | -1.9% | +3.3% | 32% | 14% | -0.166–-0.0409 | 0.0783–0.222 |
| usdtry_getiri_20g | 673 | 665 |  | -0.18 | 0.000 | +5.3% | -0.0% | 15% | 40% | -0.013–0.00945 | 0.019–0.0482 |
| min_gunluk_20g | 673 | 64 |  | +0.17 | 0.000 | +1.6% | +5.6% | 24% | 11% | -0.103–-0.0521 | -0.0292–-0.0112 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| faiz | hayır | 41 | +0.6% | +0.2% | -0.2% | +1.3% | 51% |
| siyasi | hayır | 17 | -0.3% | -0.5% | -0.1% | +3.8% | 65% |
| derecelendirme | hayır | 15 | +0.5% | -0.3% | +0.3% | -1.3% | 53% |
| jeopolitik | hayır | 10 | +0.6% | +0.4% | -0.5% | +0.9% | 50% |
| enflasyon | hayır | 9 | +0.1% | -0.7% | -0.7% | +1.0% | 33% |
| regulasyon | hayır | 6 | +0.2% | +0.2% | -0.3% | +2.2% | 67% |
| haber | hayır | 5 | +0.2% | +1.3% | -0.1% | +6.3% | 60% |
| kuresel_faiz | hayır | 5 | +0.1% | -0.8% | +1.7% | +3.7% | 60% |
| sok | hayır | 5 | -3.8% | +1.7% | +2.7% | +3.6% | 80% |
| tarife | hayır | 5 | +3.3% | -1.3% | -1.5% | -4.3% | 40% |
| kur | hayır | 4 | +1.1% | +0.5% | +0.3% | +3.6% | 75% |
| dusus | hayır | 3 | -2.0% | +0.3% | +0.9% | +0.4% | 33% |
| yukselis | hayır | 3 | +1.7% | -0.1% | +0.7% | +0.5% | 33% |
| butce_vergi | hayır | 2 | -0.5% | -1.6% | +1.8% | -12.6% | 0% |

## Kural taraması (ileriye yürüyen)

Eğitim 428 gün, test 286 gün, 201 deneme. Al-tut Sharpe: eğitim 0.63, test 0.05.
Eğitimde seçilen kural: **oynaklik_20g > 0.3215 ise nakde geç** (kantil 0.3). Eğitim Sharpe 1.79 → test Sharpe 0.4; testte nakitte kalma oranı 71%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -0.0%, test -1.0%.
Deflated Sharpe (deneme sayısı 201): 0.10 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | -0.1% | -0.3 |
| haftanin_gunu | 1.0 | 143 | +0.1% | 0.7 |
| haftanin_gunu | 2.0 | 141 | -0.4% | -2.0 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.7 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.8 |
| ay_donusu | 0.0 | 522 | +0.1% | 0.5 |
| ay_donusu | 1.0 | 192 | +0.1% | 0.4 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.7 |
| bayram_oncesi | 1.0 | 6 | +0.0% | 0.1 |
| bayram_sonrasi | 0.0 | 708 | +0.1% | 0.7 |
| bayram_sonrasi | 1.0 | 6 | -0.1% | -0.2 |
| bilanco_sezonu | 0.0 | 423 | +0.1% | 1.2 |
| bilanco_sezonu | 1.0 | 291 | -0.1% | -0.4 |

## Son durum (en yeni satır)

getiri_1g=0.0312, getiri_5g=0.0343, getiri_20g=-0.0303, getiri_60g=-0.126, getiri_120g=-0.0741, mom_12_1=-0.0792, zirve_52h_yakinlik=0.799, zirveden_dusus=-0.201, oynaklik_20g=0.418, oynaklik_60g=0.35, atr_20g_oran=0.0339, rsi_14=43.5, ma20_uzaklik=0.00397, ma50_uzaklik=-0.0293, ma200_uzaklik=-0.0669, hacim_z_20=0.35, amihud_20g=0.209, devir_hizi_20g=0.01, gece_ort_20g=-0.00645, gunici_ort_20g=0.00423, aof_1g_sapma=0.00536, max_gunluk_20g=0.0537, min_gunluk_20g=-0.0517, ivol_60g=0.299, endekse_gore_1g=0.0115, endekse_gore_20g=0.0156, endekse_gore_60g=0.0473, beta_60g=0.668, xu100_getiri_20g=-0.0458, xu100_ma200_uzaklik=-0.138, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.166, piyasa_degeri_mn=3.98e+04, halka_aciklik=0.294, fk=5.89, kazanc_verimi=0.17, pd_dd=1.09, fd_favok=5.46, snak_verimi=-0.0803, temettu_verimi=0.0566, roe_ttm=0.185, net_kar_marji=0.115, satis_buyume_yillik=0.218, net_borc_ozkaynak=0.631, bilancodan_gun=81.8, olay_sayi_5g=2, olay_yon_5g=0