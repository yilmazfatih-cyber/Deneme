# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-16

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,238,559 (+23.9%) | 985,994 (-1.4%) | **1,084,028 (+8.4%)** | -26.5% | 3,227 |
| gece | 553,508 (-44.6%) | 897,032 (-10.3%) | **771,163 (-22.9%)** | -28.6% | 732,927 |
| gunduz | 108,877 (-89.1%) | 590,564 (-40.9%) | **308,729 (-69.1%)** | -70.1% | 456,458 |
| gece_momentum | 684,484 (-31.6%) | 953,410 (-4.7%) | **920,061 (-8.0%)** | -20.4% | 768,044 |
| trend_50 | 1,021,586 (+2.2%) | 894,357 (-10.6%) | **1,099,675 (+10.0%)** | -30.5% | 136,847 |
| haftalik_momentum | 1,006,908 (+0.7%) | 866,322 (-13.4%) | **1,015,995 (+1.6%)** | -33.2% | 114,837 |
| model ridge eşik 0.00% | 1,280,513 (+28.1%) | 1,036,913 (+3.7%) | **808,269 (-19.2%)** | -39.3% | 164,624 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 494,247 (-50.6%) | 757,568 (-24.2%) | **652,665 (-34.7%)** | -47.8% | 596,947 |
| model mlp eşik 0.25% | 801,969 (-19.8%) | 697,515 (-30.2%) | **630,335 (-37.0%)** | -48.1% | 453,107 |
| model mlp eşik 0.50% | 1,676,522 (+67.7%) | 916,558 (-8.3%) | **1,243,011 (+24.3%)** | -29.3% | 488,479 |
| model mlp eşik 0.75% | 1,389,449 (+38.9%) | 1,011,637 (+1.2%) | **895,577 (-10.4%)** | -37.1% | 204,158 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **808,269 (-19.2%)**, maks düşüş -39.3%, maliyet 164,624. Dışarı korelasyon 0.042.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
