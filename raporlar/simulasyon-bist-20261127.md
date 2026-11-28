# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-27

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,124,776 (+12.5%) | 953,216 (-4.7%) | **984,442 (-1.6%)** | -26.8% | 3,077 |
| gece | 536,008 (-46.4%) | 886,822 (-11.3%) | **746,782 (-25.3%)** | -29.8% | 753,523 |
| gunduz | 96,732 (-90.3%) | 570,611 (-42.9%) | **274,290 (-72.6%)** | -72.6% | 464,318 |
| gece_momentum | 662,505 (-33.7%) | 948,895 (-5.1%) | **890,517 (-10.9%)** | -20.4% | 792,792 |
| trend_50 | 916,214 (-8.4%) | 868,351 (-13.2%) | **986,249 (-1.4%)** | -30.5% | 142,241 |
| haftalik_momentum | 921,653 (-7.8%) | 841,601 (-15.8%) | **929,970 (-7.0%)** | -33.2% | 117,972 |
| model ridge eşik 0.00% | 1,285,654 (+28.6%) | 1,101,849 (+10.2%) | **811,513 (-18.8%)** | -39.3% | 172,144 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 371,931 (-62.8%) | 701,925 (-29.8%) | **491,144 (-50.9%)** | -56.0% | 609,085 |
| model mlp eşik 0.25% | 637,790 (-36.2%) | 655,488 (-34.5%) | **501,293 (-49.9%)** | -50.4% | 461,301 |
| model mlp eşik 0.50% | 1,413,990 (+41.4%) | 869,802 (-13.0%) | **1,048,364 (+4.8%)** | -29.3% | 498,670 |
| model mlp eşik 0.75% | 1,187,032 (+18.7%) | 960,031 (-4.0%) | **765,108 (-23.5%)** | -37.1% | 209,217 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **811,513 (-18.8%)**, maks düşüş -39.3%, maliyet 172,144. Dışarı korelasyon 0.040.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
