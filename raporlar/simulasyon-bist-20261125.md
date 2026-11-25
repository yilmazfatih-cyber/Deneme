# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-25

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,140,856 (+14.1%) | 953,107 (-4.7%) | **998,515 (-0.1%)** | -26.5% | 3,099 |
| gece | 537,826 (-46.2%) | 887,047 (-11.3%) | **749,314 (-25.1%)** | -29.6% | 749,038 |
| gunduz | 98,965 (-90.1%) | 570,401 (-43.0%) | **280,621 (-71.9%)** | -71.9% | 462,648 |
| gece_momentum | 671,962 (-32.8%) | 948,818 (-5.1%) | **903,229 (-9.7%)** | -20.4% | 787,124 |
| trend_50 | 948,055 (-5.2%) | 868,316 (-13.2%) | **1,020,525 (+2.1%)** | -30.5% | 141,688 |
| haftalik_momentum | 944,019 (-5.6%) | 841,401 (-15.9%) | **952,538 (-4.7%)** | -33.2% | 117,146 |
| model ridge eşik 0.00% | 1,286,775 (+28.7%) | 1,101,849 (+10.2%) | **812,221 (-18.8%)** | -39.2% | 172,179 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 396,492 (-60.4%) | 702,432 (-29.8%) | **523,577 (-47.6%)** | -53.1% | 607,392 |
| model mlp eşik 0.25% | 677,163 (-32.3%) | 655,542 (-34.4%) | **532,239 (-46.8%)** | -48.3% | 458,605 |
| model mlp eşik 0.50% | 1,427,927 (+42.8%) | 869,133 (-13.1%) | **1,058,697 (+5.9%)** | -29.5% | 494,739 |
| model mlp eşik 0.75% | 1,185,281 (+18.5%) | 959,872 (-4.0%) | **763,980 (-23.6%)** | -37.2% | 209,085 |
| model mlp eşik 1.00% | 1,200,582 (+20.1%) | 927,794 (-7.2%) | **946,837 (-5.3%)** | -27.6% | 121,488 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **812,221 (-18.8%)**, maks düşüş -39.2%, maliyet 172,179. Dışarı korelasyon 0.041.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
