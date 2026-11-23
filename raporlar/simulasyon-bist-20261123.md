# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-23

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,183,069 (+18.3%) | 971,910 (-2.8%) | **1,035,462 (+3.5%)** | -26.5% | 3,154 |
| gece | 547,212 (-45.3%) | 896,454 (-10.4%) | **762,392 (-23.8%)** | -29.3% | 744,466 |
| gunduz | 102,085 (-89.8%) | 579,017 (-42.1%) | **289,468 (-71.1%)** | -71.1% | 460,950 |
| gece_momentum | 683,047 (-31.7%) | 958,404 (-4.2%) | **918,129 (-8.2%)** | -20.4% | 781,890 |
| trend_50 | 996,125 (-0.4%) | 889,607 (-11.0%) | **1,072,268 (+7.2%)** | -30.5% | 139,999 |
| haftalik_momentum | 983,049 (-1.7%) | 861,863 (-13.8%) | **991,920 (-0.8%)** | -33.2% | 116,919 |
| model ridge eşik 0.00% | 1,285,654 (+28.6%) | 1,101,849 (+10.2%) | **811,513 (-18.8%)** | -39.3% | 172,144 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 443,144 (-55.7%) | 737,616 (-26.2%) | **585,182 (-41.5%)** | -48.0% | 603,184 |
| model mlp eşik 0.25% | 766,370 (-23.4%) | 691,209 (-30.9%) | **602,354 (-39.8%)** | -48.1% | 454,959 |
| model mlp eşik 0.50% | 1,600,585 (+60.1%) | 908,272 (-9.2%) | **1,186,709 (+18.7%)** | -29.3% | 492,127 |
| model mlp eşik 0.75% | 1,326,514 (+32.7%) | 1,002,491 (+0.2%) | **855,012 (-14.5%)** | -37.1% | 206,785 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **811,513 (-18.8%)**, maks düşüş -39.3%, maliyet 172,144. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
