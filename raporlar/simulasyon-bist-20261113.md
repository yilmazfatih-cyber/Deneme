# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-13

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,249,021 (+24.9%) | 994,323 (-0.6%) | **1,093,185 (+9.3%)** | -26.5% | 3,241 |
| gece | 557,102 (-44.3%) | 902,858 (-9.7%) | **776,171 (-22.4%)** | -28.6% | 730,604 |
| gunduz | 109,746 (-89.0%) | 595,274 (-40.5%) | **311,191 (-68.9%)** | -70.1% | 455,528 |
| gece_momentum | 684,789 (-31.5%) | 953,834 (-4.6%) | **920,470 (-8.0%)** | -20.4% | 765,281 |
| trend_50 | 1,036,413 (+3.6%) | 907,338 (-9.3%) | **1,115,636 (+11.6%)** | -30.5% | 136,359 |
| haftalik_momentum | 1,004,095 (+0.4%) | 863,902 (-13.6%) | **1,013,156 (+1.3%)** | -33.2% | 114,529 |
| model ridge eşik 0.00% | 1,280,513 (+28.1%) | 1,036,913 (+3.7%) | **808,269 (-19.2%)** | -39.3% | 164,624 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 502,125 (-49.8%) | 769,643 (-23.0%) | **663,068 (-33.7%)** | -47.8% | 594,973 |
| model mlp eşik 0.25% | 821,244 (-17.9%) | 714,279 (-28.6%) | **645,484 (-35.5%)** | -48.1% | 451,195 |
| model mlp eşik 0.50% | 1,671,850 (+67.2%) | 914,003 (-8.6%) | **1,239,547 (+24.0%)** | -29.3% | 488,474 |
| model mlp eşik 0.75% | 1,385,576 (+38.6%) | 1,008,817 (+0.9%) | **893,081 (-10.7%)** | -37.1% | 204,154 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **808,269 (-19.2%)**, maks düşüş -39.3%, maliyet 164,624. Dışarı korelasyon 0.044.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
