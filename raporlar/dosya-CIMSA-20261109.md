# Hisse dosyası analizi — CIMSA

Satır: 3981 (gün sonu satırı 713) · 2024-01-02 18:00:00 → 2026-11-09 15:30:00. Sanal/araştırma amaçlıdır, yatırım tavsiyesi değildir.

Etiketler: 20 gün içinde ≥%10 düşüş görülen gün sayısı 171 (35 bağımsız bölüm); ≥%10 yükseliş 218 gün (25 bölüm). Bölüm sayısı azsa istatistikler zayıftır.

## Gece / gün içi ayrışması
713 günde gece (kapanış→açılış) toplam +220.4% (t=3.4), gün içi (açılış→kapanış) toplam -55.0% (t=-1.2).

## Sat sinyali öncesi görülen değerler (sinyal günleri vs diğer günler, medyan)

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| ma200_uzaklik | 0.158 | 0.0231 | +0.79 |
| getiri_120g | 0.173 | 0.0268 | +0.78 |
| ma50_uzaklik | 0.0481 | -0.0212 | +0.74 |
| zirveden_dusus | -0.0835 | -0.16 | +0.69 |
| zirve_52h_yakinlik | 0.917 | 0.84 | +0.68 |
| rsi_14 | 55.7 | 46.4 | +0.68 |
| getiri_20g | 0.0609 | -0.0278 | +0.65 |
| ma20_uzaklik | 0.0285 | -0.0176 | +0.59 |
| piyasa_degeri_mn | 4.76e+04 | 4.3e+04 | +0.59 |
| gunici_ort_20g | 0.00152 | -0.00206 | +0.54 |
| fd_favok | 6.79 | 6.32 | +0.54 |
| getiri_60g | 0.094 | -0.000417 | +0.54 |

## Al sinyali öncesi görülen değerler

| Özellik | Sinyal günleri | Diğer günler | Std. fark |
| --- | --- | --- | --- |
| kazanc_verimi | 0.119 | 0.0853 | +0.68 |
| kar_buyume_yillik | 0.267 | 0.267 | +0.67 |
| roe_ttm | 0.18 | 0.121 | +0.65 |
| net_borc_ozkaynak | 0.21 | 0.664 | -0.64 |
| piyasa_degeri_mn | 4.13e+04 | 4.46e+04 | -0.60 |
| xu100_ma200_uzaklik | 0.0102 | 0.09 | -0.55 |
| fk | 8.41 | 11.7 | -0.54 |
| fd_favok | 6.11 | 6.67 | -0.53 |

## Koşullu istatistik: özellik kovaları (en düşük %20 → en yüksek %20) ve 20 gün ileri getiri

Spearman korelasyonu özellik ile 20 gün ileri getiri arasında; p Bonferroni ile düzeltildi (çok sayıda özellik). P(sat) = kovada 20 gün içinde ≥%10 düşüş görülme oranı.

| Özellik | n | Benzersiz | Uyarı | Spearman | p (düz.) | K1 ort. ileri | K5 ort. ileri | K1 P(sat) | K5 P(sat) | K1 aralık | K5 aralık |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| piyasa_degeri_mn | 692 | 689 | seviye | -0.36 | 0.000 | +8.5% | -5.6% | 7% | 58% | 2.85e+04–3.34e+04 | 4.79e+04–5.58e+04 |
| fk | 643 | 634 |  | -0.29 | 0.000 | +10.9% | +0.5% | 4% | 18% | 6.45–8.48 | 16.2–20.5 |
| kazanc_verimi | 643 | 585 |  | +0.29 | 0.000 | +0.5% | +10.9% | 18% | 4% | 0.0488–0.0618 | 0.118–0.155 |
| fd_favok | 643 | 629 |  | -0.29 | 0.000 | +7.4% | -1.9% | 6% | 39% | 4.95–5.69 | 7.57–9.8 |
| getiri_20g | 673 | 673 |  | -0.28 | 0.000 | +5.3% | -2.1% | 6% | 41% | -0.2–-0.0775 | 0.111–0.328 |
| ma20_uzaklik | 673 | 672 |  | -0.26 | 0.000 | +5.1% | -1.8% | 6% | 33% | -0.134–-0.0503 | 0.0653–0.176 |
| amihud_20g | 672 | 668 |  | +0.25 | 0.000 | -1.7% | +5.3% | 26% | 13% | 0.0258–0.0374 | 0.0649–0.13 |
| xu100_ma200_uzaklik | 493 | 493 |  | -0.29 | 0.000 | +5.0% | -1.0% | 24% | 37% | -0.118–-0.0163 | 0.144–0.312 |
| xu100_getiri_20g | 673 | 671 |  | -0.24 | 0.000 | +5.0% | -2.4% | 11% | 33% | -0.166–-0.0409 | 0.0783–0.222 |
| rsi_14 | 678 | 673 |  | -0.24 | 0.000 | +4.8% | -0.4% | 4% | 34% | 17.8–40.2 | 60.8–82.5 |
| ivol_60g | 573 | 571 |  | +0.26 | 0.000 | -5.4% | +1.3% | 30% | 42% | 0.191–0.235 | 0.363–0.47 |
| net_borc_ozkaynak | 693 | 12 | çeyreklik adım | -0.23 | 0.000 | +3.8% | -0.9% | 21% | 22% | 0.126–0.184 | 0.716–0.727 |
| gunici_ort_20g | 673 | 661 |  | -0.22 | 0.000 | +3.7% | -2.4% | 16% | 47% | -0.0123–-0.00475 | 0.00281–0.0118 |
| ma50_uzaklik | 643 | 643 |  | -0.21 | 0.000 | +4.5% | -0.0% | 2% | 43% | -0.138–-0.0642 | 0.0773–0.271 |
| temettu_verimi | 693 | 519 |  | +0.20 | 0.000 | -0.7% | +4.6% | 35% | 19% | 0–0.0127 | 0.0294–0.0374 |
| gece_ort_20g | 672 | 638 |  | -0.19 | 0.000 | +3.9% | -2.4% | 15% | 39% | -0.00767–-0.000138 | 0.004–0.0125 |
| atr_20g_oran | 672 | 657 |  | +0.19 | 0.000 | -0.9% | +4.2% | 21% | 27% | 0.0195–0.0289 | 0.0391–0.0636 |
| usdtry_getiri_20g | 672 | 664 |  | -0.19 | 0.000 | +3.9% | -1.7% | 19% | 30% | -0.013–0.00947 | 0.019–0.0482 |

## Olay etkisi (XU100'e göre anormal ileri getiri; olaydan sonraki ilk gün sonu satırından)

| Tür | Hissenin kendi olayı mı | n | İlk gün tepki | 1g | 5g | 20g | 20g pozitif oranı |
| --- | --- | --- | --- | --- | --- | --- | --- |
| birlesme_devralma | evet | 2 | -0.6% | -2.0% | +1.8% | +5.3% | 100% |
| temettu | evet | 2 | +1.3% | +1.0% | +3.0% | +3.2% | 50% |
| faiz | hayır | 41 | +0.7% | +0.1% | -0.2% | +0.3% | 49% |
| siyasi | hayır | 17 | -0.2% | +0.2% | -0.8% | -1.4% | 41% |
| derecelendirme | hayır | 15 | +0.6% | +0.2% | +0.4% | -2.7% | 33% |
| jeopolitik | hayır | 10 | -1.6% | -0.3% | +0.0% | +1.9% | 80% |
| enflasyon | hayır | 9 | +1.0% | -0.2% | -3.6% | -2.1% | 22% |
| regulasyon | hayır | 6 | +0.5% | -0.6% | -0.6% | +1.3% | 67% |
| haber | hayır | 5 | -0.2% | +1.1% | +2.5% | -1.9% | 20% |
| kuresel_faiz | hayır | 5 | +0.2% | +0.5% | +0.6% | -3.4% | 20% |
| sok | hayır | 5 | -5.1% | +1.0% | +4.2% | +5.5% | 100% |
| tarife | hayır | 5 | +2.1% | +0.1% | +2.3% | -1.2% | 40% |
| kur | hayır | 4 | -1.0% | +0.4% | +2.6% | +1.0% | 50% |
| dusus | hayır | 3 | +0.0% | +1.5% | +1.5% | -2.3% | 33% |
| yukselis | hayır | 3 | +3.6% | +0.4% | +3.1% | -1.2% | 33% |
| butce_vergi | hayır | 2 | -0.4% | -0.4% | +0.4% | -2.0% | 50% |
| YÖN: notr | evet | 1 | - | +2.4% | +6.7% | -0.4% | nan% |
| YÖN: olumlu | evet | 3 | - | -1.4% | +1.0% | +5.8% | nan% |

## Kural taraması (ileriye yürüyen)

Eğitim 427 gün, test 286 gün, 197 deneme. Al-tut Sharpe: eğitim 0.81, test -0.03.
Eğitimde seçilen kural: **amihud_20g < 0.05677 ise nakde geç** (kantil 0.7). Eğitim Sharpe 2.03 → test Sharpe 0.21; testte nakitte kalma oranı 65%; nakde geçilen günlerin gerçekleşen 20g getirisi: eğitim -1.1%, test -0.8%.
Deflated Sharpe (deneme sayısı 197): 0.08 — 0,95 üstü anlamlı, 0,5 civarı şans.

Seçim yalnız eğitim Sharpe'ına göre; 'sonradan bakış' tablosu şans tavanını gösterir, strateji değildir.

## Takvim etkileri (gün sonu günlük getiri ortalaması)

| Takvim | Değer | n | Ort. günlük | t |
| --- | --- | --- | --- | --- |
| haftanin_gunu | 0.0 | 144 | +0.1% | 0.4 |
| haftanin_gunu | 1.0 | 142 | -0.0% | -0.1 |
| haftanin_gunu | 2.0 | 141 | -0.3% | -1.4 |
| haftanin_gunu | 3.0 | 143 | +0.5% | 2.7 |
| haftanin_gunu | 4.0 | 143 | +0.1% | 0.6 |
| ay_donusu | 0.0 | 521 | +0.2% | 2.1 |
| ay_donusu | 1.0 | 192 | -0.3% | -1.5 |
| bayram_oncesi | 0.0 | 708 | +0.1% | 0.8 |
| bayram_oncesi | 1.0 | 5 | +0.8% | 0.7 |
| bayram_sonrasi | 0.0 | 707 | +0.1% | 1.1 |
| bayram_sonrasi | 1.0 | 6 | -2.2% | -1.2 |
| bilanco_sezonu | 0.0 | 422 | +0.1% | 1.0 |
| bilanco_sezonu | 1.0 | 291 | +0.0% | 0.1 |

## Son durum (en yeni satır)

getiri_1g=0.00519, getiri_5g=0.0757, getiri_20g=0.0334, getiri_60g=-0.0624, getiri_120g=-0.207, mom_12_1=-0.0949, zirve_52h_yakinlik=0.722, zirveden_dusus=-0.278, oynaklik_20g=0.393, oynaklik_60g=0.338, atr_20g_oran=0.0318, rsi_14=59.2, ma20_uzaklik=0.0708, ma50_uzaklik=0.0197, ma200_uzaklik=-0.114, hacim_z_20=-0.828, amihud_20g=0.106, devir_hizi_20g=0.0137, gece_ort_20g=-0.00378, gunici_ort_20g=0.00552, aof_1g_sapma=0.0083, max_gunluk_20g=0.05, min_gunluk_20g=-0.0347, ivol_60g=0.231, endekse_gore_1g=-0.0175, endekse_gore_20g=0.0764, endekse_gore_60g=0.109, beta_60g=0.872, xu100_getiri_20g=-0.043, xu100_ma200_uzaklik=-0.135, usdtry_getiri_20g=0.0191, dolar_getiri_60g=-0.105, piyasa_degeri_mn=4.03e+04, halka_aciklik=0.361, fk=8.87, kazanc_verimi=0.113, pd_dd=1.08, fd_favok=6.03, snak_verimi=-0.0261, temettu_verimi=0.0174, roe_ttm=0.121, net_kar_marji=0.0995, kar_buyume_yillik=0.413, satis_buyume_yillik=-0.0917, net_borc_ozkaynak=0.702, bilancodan_gun=81.9, olay_sayi_5g=2, olay_yon_5g=0