# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-17

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,249,501 (+25.0%) | 985,904 (-1.4%) | **1,093,605 (+9.4%)** | -26.5% | 3,241 |
| gece | 555,354 (-44.5%) | 897,280 (-10.3%) | **773,736 (-22.6%)** | -28.6% | 735,275 |
| gunduz | 108,819 (-89.1%) | 590,347 (-41.0%) | **308,563 (-69.1%)** | -70.1% | 457,372 |
| gece_momentum | 686,342 (-31.4%) | 953,332 (-4.7%) | **922,558 (-7.7%)** | -20.4% | 770,580 |
| trend_50 | 1,032,184 (+3.2%) | 894,321 (-10.6%) | **1,111,084 (+11.1%)** | -30.5% | 137,114 |
| haftalik_momentum | 1,018,224 (+1.8%) | 866,116 (-13.4%) | **1,027,412 (+2.7%)** | -33.2% | 114,848 |
| model ridge eşik 0.00% | 1,293,793 (+29.4%) | 1,036,913 (+3.7%) | **816,651 (-18.3%)** | -39.2% | 167,093 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 494,966 (-50.5%) | 758,250 (-24.2%) | **653,614 (-34.6%)** | -47.4% | 599,170 |
| model mlp eşik 0.25% | 800,429 (-20.0%) | 697,573 (-30.2%) | **629,124 (-37.1%)** | -48.3% | 453,444 |
| model mlp eşik 0.50% | 1,671,422 (+67.1%) | 915,853 (-8.4%) | **1,239,230 (+23.9%)** | -29.5% | 487,738 |
| model mlp eşik 0.75% | 1,387,400 (+38.7%) | 1,011,469 (+1.1%) | **894,257 (-10.6%)** | -37.2% | 204,033 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **816,651 (-18.3%)**, maks düşüş -39.2%, maliyet 167,093. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
