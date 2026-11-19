# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-19

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,212,600 (+21.3%) | 971,821 (-2.8%) | **1,061,308 (+6.1%)** | -26.5% | 3,193 |
| gece | 557,217 (-44.3%) | 896,702 (-10.3%) | **776,331 (-22.4%)** | -28.6% | 739,923 |
| gunduz | 103,996 (-89.6%) | 578,804 (-42.1%) | **294,887 (-70.5%)** | -70.5% | 459,186 |
| gece_momentum | 693,745 (-30.6%) | 958,326 (-4.2%) | **932,509 (-6.7%)** | -20.4% | 776,149 |
| trend_50 | 1,016,413 (+1.6%) | 889,571 (-11.0%) | **1,094,107 (+9.4%)** | -30.5% | 138,825 |
| haftalik_momentum | 1,004,259 (+0.4%) | 861,659 (-13.8%) | **1,013,321 (+1.3%)** | -33.2% | 115,750 |
| model ridge eşik 0.00% | 1,414,052 (+41.4%) | 1,101,849 (+10.2%) | **892,559 (-10.7%)** | -39.2% | 169,620 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 472,813 (-52.7%) | 738,279 (-26.2%) | **624,360 (-37.6%)** | -47.4% | 602,374 |
| model mlp eşik 0.25% | 764,174 (-23.6%) | 691,266 (-30.9%) | **600,628 (-39.9%)** | -48.3% | 455,290 |
| model mlp eşik 0.50% | 1,595,716 (+59.6%) | 907,573 (-9.2%) | **1,183,099 (+18.3%)** | -29.5% | 491,374 |
| model mlp eşik 0.75% | 1,324,558 (+32.5%) | 1,002,325 (+0.2%) | **853,752 (-14.6%)** | -37.2% | 206,657 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **892,559 (-10.7%)**, maks düşüş -39.2%, maliyet 169,620. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
