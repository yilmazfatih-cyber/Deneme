# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-18

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,231,653 (+23.2%) | 971,821 (-2.8%) | **1,077,983 (+7.8%)** | -26.5% | 3,218 |
| gece | 554,996 (-44.5%) | 896,702 (-10.3%) | **773,237 (-22.7%)** | -28.6% | 737,597 |
| gunduz | 106,691 (-89.3%) | 578,804 (-42.1%) | **302,529 (-69.7%)** | -70.1% | 458,290 |
| gece_momentum | 689,937 (-31.0%) | 958,326 (-4.2%) | **927,391 (-7.3%)** | -20.4% | 773,357 |
| trend_50 | 1,026,939 (+2.7%) | 889,571 (-11.0%) | **1,105,438 (+10.5%)** | -30.5% | 138,118 |
| haftalik_momentum | 1,012,983 (+1.3%) | 861,659 (-13.8%) | **1,022,125 (+2.2%)** | -33.2% | 115,149 |
| model ridge eşik 0.00% | 1,378,951 (+37.9%) | 1,101,849 (+10.2%) | **870,403 (-13.0%)** | -39.2% | 169,587 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 482,896 (-51.7%) | 738,279 (-26.2%) | **637,675 (-36.2%)** | -47.4% | 600,796 |
| model mlp eşik 0.25% | 793,193 (-20.7%) | 691,266 (-30.9%) | **623,437 (-37.7%)** | -48.3% | 455,324 |
| model mlp eşik 0.50% | 1,656,312 (+65.6%) | 907,573 (-9.2%) | **1,228,027 (+22.8%)** | -29.5% | 491,442 |
| model mlp eşik 0.75% | 1,374,858 (+37.5%) | 1,002,325 (+0.2%) | **886,173 (-11.4%)** | -37.2% | 206,705 |
| model mlp eşik 1.00% | 1,246,174 (+24.6%) | 927,794 (-7.2%) | **982,792 (-1.7%)** | -27.6% | 121,542 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **870,403 (-13.0%)**, maks düşüş -39.2%, maliyet 169,587. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
