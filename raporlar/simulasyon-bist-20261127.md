# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-27

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,124,777 (+12.5%) | 953,107 (-4.7%) | **984,443 (-1.6%)** | -26.8% | 3,077 |
| gece | 536,023 (-46.4%) | 887,047 (-11.3%) | **746,802 (-25.3%)** | -29.8% | 753,553 |
| gunduz | 96,730 (-90.3%) | 570,401 (-43.0%) | **274,283 (-72.6%)** | -72.6% | 464,305 |
| gece_momentum | 662,074 (-33.8%) | 948,818 (-5.1%) | **889,938 (-11.0%)** | -20.4% | 792,547 |
| trend_50 | 916,155 (-8.4%) | 868,316 (-13.2%) | **986,186 (-1.4%)** | -30.5% | 142,236 |
| haftalik_momentum | 921,444 (-7.9%) | 841,401 (-15.9%) | **929,759 (-7.0%)** | -33.2% | 117,965 |
| model ridge eşik 0.00% | 1,286,775 (+28.7%) | 1,101,849 (+10.2%) | **812,221 (-18.8%)** | -39.2% | 172,179 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 374,304 (-62.6%) | 702,432 (-29.8%) | **494,277 (-50.6%)** | -55.7% | 610,077 |
| model mlp eşik 0.25% | 635,963 (-36.4%) | 655,542 (-34.4%) | **499,857 (-50.0%)** | -50.5% | 461,614 |
| model mlp eşik 0.50% | 1,409,689 (+41.0%) | 869,133 (-13.1%) | **1,045,175 (+4.5%)** | -29.5% | 497,897 |
| model mlp eşik 0.75% | 1,185,281 (+18.5%) | 959,872 (-4.0%) | **763,980 (-23.6%)** | -37.2% | 209,085 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **812,221 (-18.8%)**, maks düşüş -39.2%, maliyet 172,179. Dışarı korelasyon 0.040.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
