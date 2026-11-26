# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-26

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,132,545 (+13.3%) | 953,107 (-4.7%) | **991,242 (-0.9%)** | -26.8% | 3,088 |
| gece | 542,274 (-45.8%) | 887,047 (-11.3%) | **755,513 (-24.4%)** | -29.7% | 751,297 |
| gunduz | 96,855 (-90.3%) | 570,401 (-43.0%) | **274,637 (-72.5%)** | -72.5% | 463,481 |
| gece_momentum | 676,793 (-32.3%) | 948,818 (-5.1%) | **909,722 (-9.0%)** | -20.4% | 789,846 |
| trend_50 | 928,069 (-7.2%) | 868,316 (-13.2%) | **999,010 (-0.1%)** | -30.5% | 142,255 |
| haftalik_momentum | 934,772 (-6.5%) | 841,401 (-15.9%) | **943,207 (-5.7%)** | -33.2% | 117,418 |
| model ridge eşik 0.00% | 1,286,775 (+28.7%) | 1,101,849 (+10.2%) | **812,221 (-18.8%)** | -39.2% | 172,179 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 392,517 (-60.7%) | 702,432 (-29.8%) | **518,328 (-48.2%)** | -54.1% | 608,924 |
| model mlp eşik 0.25% | 666,292 (-33.4%) | 655,542 (-34.4%) | **523,694 (-47.6%)** | -48.7% | 460,148 |
| model mlp eşik 0.50% | 1,427,927 (+42.8%) | 869,133 (-13.1%) | **1,058,697 (+5.9%)** | -29.5% | 494,739 |
| model mlp eşik 0.75% | 1,185,281 (+18.5%) | 959,872 (-4.0%) | **763,980 (-23.6%)** | -37.2% | 209,085 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **812,221 (-18.8%)**, maks düşüş -39.2%, maliyet 172,179. Dışarı korelasyon 0.039.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
