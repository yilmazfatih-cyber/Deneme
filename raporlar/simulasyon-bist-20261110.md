# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-10

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,246,408 (+24.6%) | 983,314 (-1.7%) | **1,090,897 (+9.1%)** | -26.5% | 3,237 |
| gece | 555,218 (-44.5%) | 894,373 (-10.6%) | **773,546 (-22.6%)** | -28.6% | 723,660 |
| gunduz | 111,885 (-88.8%) | 601,448 (-39.9%) | **317,258 (-68.3%)** | -70.1% | 452,689 |
| gece_momentum | 689,637 (-31.0%) | 948,123 (-5.2%) | **926,987 (-7.3%)** | -20.4% | 756,760 |
| trend_50 | 1,056,599 (+5.7%) | 912,183 (-8.8%) | **1,137,365 (+13.7%)** | -30.5% | 134,032 |
| haftalik_momentum | 1,014,047 (+1.4%) | 858,414 (-14.2%) | **1,023,198 (+2.3%)** | -33.2% | 113,314 |
| model ridge eşik 0.00% | 1,177,364 (+17.7%) | 948,470 (-5.2%) | **743,160 (-25.7%)** | -39.2% | 162,332 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 514,707 (-48.5%) | 788,159 (-21.2%) | **679,683 (-32.0%)** | -47.4% | 589,838 |
| model mlp eşik 0.25% | 817,160 (-18.3%) | 715,412 (-28.5%) | **642,275 (-35.8%)** | -48.3% | 447,661 |
| model mlp eşik 0.50% | 1,662,981 (+66.3%) | 914,529 (-8.5%) | **1,232,972 (+23.3%)** | -29.5% | 480,260 |
| model mlp eşik 0.75% | 1,396,062 (+39.6%) | 1,019,600 (+2.0%) | **899,840 (-10.0%)** | -37.2% | 201,335 |
| model mlp eşik 1.00% | 1,238,319 (+23.8%) | 936,258 (-6.4%) | **976,597 (-2.3%)** | -27.6% | 118,555 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **743,160 (-25.7%)**, maks düşüş -39.2%, maliyet 162,332. Dışarı korelasyon 0.046.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
