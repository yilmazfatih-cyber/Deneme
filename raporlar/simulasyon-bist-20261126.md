# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-26

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,132,544 (+13.3%) | 953,216 (-4.7%) | **991,241 (-0.9%)** | -26.8% | 3,088 |
| gece | 542,259 (-45.8%) | 886,822 (-11.3%) | **755,491 (-24.5%)** | -29.7% | 751,268 |
| gunduz | 96,857 (-90.3%) | 570,611 (-42.9%) | **274,645 (-72.5%)** | -72.5% | 463,494 |
| gece_momentum | 677,233 (-32.3%) | 948,895 (-5.1%) | **910,314 (-9.0%)** | -20.4% | 790,088 |
| trend_50 | 928,129 (-7.2%) | 868,351 (-13.2%) | **999,075 (-0.1%)** | -30.5% | 142,261 |
| haftalik_momentum | 934,984 (-6.5%) | 841,601 (-15.8%) | **943,421 (-5.7%)** | -33.2% | 117,426 |
| model ridge eşik 0.00% | 1,285,654 (+28.6%) | 1,101,849 (+10.2%) | **811,513 (-18.8%)** | -39.3% | 172,144 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 390,029 (-61.0%) | 701,925 (-29.8%) | **515,042 (-48.5%)** | -54.4% | 607,939 |
| model mlp eşik 0.25% | 668,206 (-33.2%) | 655,488 (-34.5%) | **525,199 (-47.5%)** | -48.6% | 459,831 |
| model mlp eşik 0.50% | 1,432,284 (+43.2%) | 869,802 (-13.0%) | **1,061,927 (+6.2%)** | -29.3% | 495,502 |
| model mlp eşik 0.75% | 1,187,032 (+18.7%) | 960,031 (-4.0%) | **765,108 (-23.5%)** | -37.1% | 209,217 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **811,513 (-18.8%)**, maks düşüş -39.3%, maliyet 172,144. Dışarı korelasyon 0.039.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
