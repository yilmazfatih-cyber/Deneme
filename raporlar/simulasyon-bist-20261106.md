# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-06

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,201,014 (+20.1%) | 980,071 (-2.0%) | **1,051,167 (+5.1%)** | -26.5% | 3,178 |
| gece | 555,712 (-44.4%) | 891,423 (-10.9%) | **774,235 (-22.6%)** | -28.8% | 718,273 |
| gunduz | 109,016 (-89.1%) | 601,448 (-39.9%) | **309,121 (-69.1%)** | -70.0% | 451,098 |
| gece_momentum | 691,266 (-30.9%) | 944,349 (-5.6%) | **929,177 (-7.1%)** | -20.8% | 750,215 |
| trend_50 | 1,010,594 (+1.1%) | 907,280 (-9.3%) | **1,087,844 (+8.8%)** | -30.5% | 132,640 |
| haftalik_momentum | 966,408 (-3.4%) | 853,743 (-14.6%) | **975,129 (-2.5%)** | -33.1% | 112,986 |
| model ridge eşik 0.00% | 1,151,516 (+15.2%) | 948,470 (-5.2%) | **726,844 (-27.3%)** | -39.2% | 160,057 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 496,798 (-50.3%) | 783,405 (-21.7%) | **656,034 (-34.4%)** | -48.3% | 582,981 |
| model mlp eşik 0.25% | 792,652 (-20.7%) | 711,525 (-28.8%) | **623,012 (-37.7%)** | -48.3% | 443,783 |
| model mlp eşik 0.50% | 1,650,404 (+65.0%) | 911,362 (-8.9%) | **1,223,646 (+22.4%)** | -29.5% | 476,512 |
| model mlp eşik 0.75% | 1,392,000 (+39.2%) | 1,016,070 (+1.6%) | **897,222 (-10.3%)** | -37.2% | 198,604 |
| model mlp eşik 1.00% | 1,230,014 (+23.0%) | 936,258 (-6.4%) | **970,048 (-3.0%)** | -27.6% | 115,597 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **726,844 (-27.3%)**, maks düşüş -39.2%, maliyet 160,057. Dışarı korelasyon 0.049.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
