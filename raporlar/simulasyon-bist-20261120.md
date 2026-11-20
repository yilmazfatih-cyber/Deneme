# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-20

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,168,257 (+16.8%) | 971,821 (-2.8%) | **1,022,498 (+2.2%)** | -26.5% | 3,135 |
| gece | 540,812 (-45.9%) | 896,702 (-10.3%) | **753,475 (-24.7%)** | -29.2% | 742,219 |
| gunduz | 102,614 (-89.7%) | 578,804 (-42.1%) | **290,969 (-70.9%)** | -70.9% | 460,066 |
| gece_momentum | 675,412 (-32.5%) | 958,326 (-4.2%) | **907,867 (-9.2%)** | -20.4% | 778,912 |
| trend_50 | 979,015 (-2.1%) | 889,571 (-11.0%) | **1,053,851 (+5.4%)** | -30.5% | 139,171 |
| haftalik_momentum | 966,564 (-3.3%) | 861,659 (-13.8%) | **975,287 (-2.5%)** | -33.2% | 116,301 |
| model ridge eşik 0.00% | 1,250,889 (+25.1%) | 1,101,849 (+10.2%) | **789,569 (-21.0%)** | -39.2% | 172,145 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 442,385 (-55.8%) | 738,279 (-26.2%) | **584,180 (-41.6%)** | -47.6% | 604,132 |
| model mlp eşik 0.25% | 764,174 (-23.6%) | 691,266 (-30.9%) | **600,628 (-39.9%)** | -48.3% | 455,290 |
| model mlp eşik 0.50% | 1,595,716 (+59.6%) | 907,573 (-9.2%) | **1,183,099 (+18.3%)** | -29.5% | 491,374 |
| model mlp eşik 0.75% | 1,324,558 (+32.5%) | 1,002,325 (+0.2%) | **853,752 (-14.6%)** | -37.2% | 206,657 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **789,569 (-21.0%)**, maks düşüş -39.2%, maliyet 172,145. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
