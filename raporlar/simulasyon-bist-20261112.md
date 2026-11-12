# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-12

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,251,508 (+25.2%) | 996,210 (-0.4%) | **1,095,361 (+9.5%)** | -26.5% | 3,244 |
| gece | 559,137 (-44.1%) | 906,347 (-9.4%) | **779,007 (-22.1%)** | -28.6% | 728,298 |
| gunduz | 110,224 (-89.0%) | 597,686 (-40.2%) | **312,547 (-68.7%)** | -70.1% | 454,579 |
| gece_momentum | 687,971 (-31.2%) | 958,811 (-4.1%) | **924,747 (-7.5%)** | -20.4% | 762,285 |
| trend_50 | 1,048,778 (+4.9%) | 918,185 (-8.2%) | **1,128,946 (+12.9%)** | -30.5% | 135,535 |
| haftalik_momentum | 1,010,570 (+1.1%) | 869,462 (-13.1%) | **1,019,689 (+2.0%)** | -33.2% | 114,226 |
| model ridge eşik 0.00% | 1,189,775 (+19.0%) | 962,597 (-3.7%) | **750,994 (-24.9%)** | -39.2% | 164,566 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 510,289 (-49.0%) | 777,900 (-22.2%) | **673,849 (-32.6%)** | -47.4% | 593,877 |
| model mlp eşik 0.25% | 828,678 (-17.1%) | 722,876 (-27.7%) | **651,328 (-34.9%)** | -48.3% | 449,610 |
| model mlp eşik 0.50% | 1,690,967 (+69.1%) | 926,562 (-7.3%) | **1,253,721 (+25.4%)** | -29.5% | 484,006 |
| model mlp eşik 0.75% | 1,398,553 (+39.9%) | 1,019,600 (+2.0%) | **901,445 (-9.9%)** | -37.2% | 201,337 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **750,994 (-24.9%)**, maks düşüş -39.2%, maliyet 164,566. Dışarı korelasyon 0.044.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
