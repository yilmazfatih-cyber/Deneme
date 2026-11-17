# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-16

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,238,560 (+23.9%) | 985,904 (-1.4%) | **1,084,029 (+8.4%)** | -26.5% | 3,227 |
| gece | 553,544 (-44.6%) | 897,280 (-10.3%) | **771,214 (-22.9%)** | -28.6% | 732,956 |
| gunduz | 108,870 (-89.1%) | 590,347 (-41.0%) | **308,709 (-69.1%)** | -70.1% | 456,446 |
| gece_momentum | 684,039 (-31.6%) | 953,332 (-4.7%) | **919,463 (-8.1%)** | -20.4% | 767,815 |
| trend_50 | 1,021,519 (+2.2%) | 894,321 (-10.6%) | **1,099,604 (+10.0%)** | -30.5% | 136,842 |
| haftalik_momentum | 1,006,680 (+0.7%) | 866,116 (-13.4%) | **1,015,765 (+1.6%)** | -33.2% | 114,830 |
| model ridge eşik 0.00% | 1,281,630 (+28.2%) | 1,036,913 (+3.7%) | **808,973 (-19.1%)** | -39.2% | 164,653 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 497,399 (-50.3%) | 758,250 (-24.2%) | **656,827 (-34.3%)** | -47.4% | 597,862 |
| model mlp eşik 0.25% | 799,671 (-20.0%) | 697,573 (-30.2%) | **628,528 (-37.1%)** | -48.3% | 453,443 |
| model mlp eşik 0.50% | 1,671,422 (+67.1%) | 915,853 (-8.4%) | **1,239,230 (+23.9%)** | -29.5% | 487,738 |
| model mlp eşik 0.75% | 1,387,400 (+38.7%) | 1,011,469 (+1.1%) | **894,257 (-10.6%)** | -37.2% | 204,033 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **808,973 (-19.1%)**, maks düşüş -39.2%, maliyet 164,653. Dışarı korelasyon 0.042.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
