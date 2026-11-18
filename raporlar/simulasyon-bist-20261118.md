# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-18

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,231,651 (+23.2%) | 971,910 (-2.8%) | **1,077,982 (+7.8%)** | -26.5% | 3,218 |
| gece | 554,960 (-44.5%) | 896,454 (-10.4%) | **773,186 (-22.7%)** | -28.6% | 737,568 |
| gunduz | 106,698 (-89.3%) | 579,017 (-42.1%) | **302,549 (-69.7%)** | -70.1% | 458,302 |
| gece_momentum | 690,386 (-31.0%) | 958,404 (-4.2%) | **927,994 (-7.2%)** | -20.4% | 773,589 |
| trend_50 | 1,027,005 (+2.7%) | 889,607 (-11.0%) | **1,105,509 (+10.6%)** | -30.5% | 138,123 |
| haftalik_momentum | 1,013,213 (+1.3%) | 861,863 (-13.8%) | **1,022,356 (+2.2%)** | -33.2% | 115,156 |
| model ridge eşik 0.00% | 1,377,750 (+37.8%) | 1,101,849 (+10.2%) | **869,645 (-13.0%)** | -39.3% | 169,554 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 479,836 (-52.0%) | 737,616 (-26.2%) | **633,634 (-36.6%)** | -47.8% | 599,863 |
| model mlp eşik 0.25% | 795,472 (-20.5%) | 691,209 (-30.9%) | **625,229 (-37.5%)** | -48.1% | 454,993 |
| model mlp eşik 0.50% | 1,661,366 (+66.1%) | 908,272 (-9.2%) | **1,231,774 (+23.2%)** | -29.3% | 492,194 |
| model mlp eşik 0.75% | 1,376,888 (+37.7%) | 1,002,491 (+0.2%) | **887,481 (-11.3%)** | -37.1% | 206,834 |
| model mlp eşik 1.00% | 1,246,174 (+24.6%) | 927,794 (-7.2%) | **982,792 (-1.7%)** | -27.6% | 121,542 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **869,645 (-13.0%)**, maks düşüş -39.3%, maliyet 169,554. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
