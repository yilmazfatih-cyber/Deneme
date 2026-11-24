# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-24

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,163,255 (+16.3%) | 971,910 (-2.8%) | **1,018,120 (+1.8%)** | -26.5% | 3,128 |
| gece | 543,652 (-45.6%) | 896,454 (-10.4%) | **757,432 (-24.3%)** | -29.3% | 746,747 |
| gunduz | 100,428 (-90.0%) | 579,017 (-42.1%) | **284,769 (-71.5%)** | -71.5% | 461,812 |
| gece_momentum | 679,137 (-32.1%) | 958,404 (-4.2%) | **912,873 (-8.7%)** | -20.4% | 784,638 |
| trend_50 | 970,354 (-3.0%) | 889,607 (-11.0%) | **1,044,528 (+4.5%)** | -30.5% | 140,408 |
| haftalik_momentum | 966,386 (-3.4%) | 861,863 (-13.8%) | **975,107 (-2.5%)** | -33.2% | 116,894 |
| model ridge eşik 0.00% | 1,285,654 (+28.6%) | 1,101,849 (+10.2%) | **811,513 (-18.8%)** | -39.3% | 172,144 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 412,844 (-58.7%) | 737,616 (-26.2%) | **545,170 (-45.5%)** | -51.1% | 604,881 |
| model mlp eşik 0.25% | 713,969 (-28.6%) | 691,209 (-30.9%) | **561,168 (-43.9%)** | -48.1% | 456,705 |
| model mlp eşik 0.50% | 1,491,145 (+49.1%) | 908,272 (-9.2%) | **1,105,568 (+10.6%)** | -29.3% | 495,568 |
| model mlp eşik 0.75% | 1,235,814 (+23.6%) | 1,002,491 (+0.2%) | **796,551 (-20.3%)** | -37.1% | 209,265 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **811,513 (-18.8%)**, maks düşüş -39.3%, maliyet 172,144. Dışarı korelasyon 0.043.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
