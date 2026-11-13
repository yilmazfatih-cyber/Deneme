# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-13

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,249,023 (+24.9%) | 994,232 (-0.6%) | **1,093,186 (+9.3%)** | -26.5% | 3,241 |
| gece | 557,139 (-44.3%) | 903,108 (-9.7%) | **776,222 (-22.4%)** | -28.6% | 730,633 |
| gunduz | 109,739 (-89.0%) | 595,055 (-40.5%) | **311,171 (-68.9%)** | -70.1% | 455,515 |
| gece_momentum | 684,343 (-31.6%) | 953,756 (-4.6%) | **919,872 (-8.0%)** | -20.4% | 765,054 |
| trend_50 | 1,036,346 (+3.6%) | 907,301 (-9.3%) | **1,115,564 (+11.6%)** | -30.5% | 136,354 |
| haftalik_momentum | 1,003,868 (+0.4%) | 863,696 (-13.6%) | **1,012,927 (+1.3%)** | -33.2% | 114,522 |
| model ridge eşik 0.00% | 1,281,630 (+28.2%) | 1,036,913 (+3.7%) | **808,973 (-19.1%)** | -39.2% | 164,653 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 505,327 (-49.5%) | 770,336 (-23.0%) | **667,296 (-33.3%)** | -47.4% | 595,875 |
| model mlp eşik 0.25% | 818,891 (-18.1%) | 714,338 (-28.6%) | **643,635 (-35.6%)** | -48.3% | 451,537 |
| model mlp eşik 0.50% | 1,666,764 (+66.7%) | 913,300 (-8.7%) | **1,235,776 (+23.6%)** | -29.5% | 487,733 |
| model mlp eşik 0.75% | 1,383,533 (+38.4%) | 1,008,650 (+0.9%) | **891,764 (-10.8%)** | -37.2% | 204,029 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **808,973 (-19.1%)**, maks düşüş -39.2%, maliyet 164,653. Dışarı korelasyon 0.044.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
