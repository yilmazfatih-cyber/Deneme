# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-17

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,249,500 (+24.9%) | 985,994 (-1.4%) | **1,093,604 (+9.4%)** | -26.5% | 3,241 |
| gece | 555,318 (-44.5%) | 897,032 (-10.3%) | **773,685 (-22.6%)** | -28.6% | 735,246 |
| gunduz | 108,826 (-89.1%) | 590,564 (-40.9%) | **308,583 (-69.1%)** | -70.1% | 457,385 |
| gece_momentum | 686,789 (-31.3%) | 953,410 (-4.7%) | **923,159 (-7.7%)** | -20.4% | 770,811 |
| trend_50 | 1,032,251 (+3.2%) | 894,357 (-10.6%) | **1,111,156 (+11.1%)** | -30.5% | 137,120 |
| haftalik_momentum | 1,018,454 (+1.8%) | 866,322 (-13.4%) | **1,027,645 (+2.8%)** | -33.2% | 114,855 |
| model ridge eşik 0.00% | 1,292,666 (+29.3%) | 1,036,913 (+3.7%) | **815,940 (-18.4%)** | -39.3% | 167,062 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 491,830 (-50.8%) | 757,568 (-24.2%) | **649,472 (-35.1%)** | -47.8% | 598,246 |
| model mlp eşik 0.25% | 802,729 (-19.7%) | 697,515 (-30.2%) | **630,932 (-36.9%)** | -48.1% | 453,108 |
| model mlp eşik 0.50% | 1,676,522 (+67.7%) | 916,558 (-8.3%) | **1,243,011 (+24.3%)** | -29.3% | 488,479 |
| model mlp eşik 0.75% | 1,389,449 (+38.9%) | 1,011,637 (+1.2%) | **895,577 (-10.4%)** | -37.1% | 204,158 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **815,940 (-18.4%)**, maks düşüş -39.3%, maliyet 167,062. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
