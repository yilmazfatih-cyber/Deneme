# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-11

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,235,307 (+23.5%) | 983,314 (-1.7%) | **1,081,182 (+8.1%)** | -26.5% | 3,223 |
| gece | 551,750 (-44.8%) | 894,373 (-10.6%) | **768,714 (-23.1%)** | -28.6% | 725,975 |
| gunduz | 110,918 (-88.9%) | 601,448 (-39.9%) | **314,514 (-68.5%)** | -70.1% | 453,638 |
| gece_momentum | 680,302 (-32.0%) | 948,123 (-5.2%) | **914,439 (-8.6%)** | -20.4% | 759,524 |
| trend_50 | 1,039,036 (+3.9%) | 912,183 (-8.8%) | **1,118,460 (+11.8%)** | -30.5% | 134,489 |
| haftalik_momentum | 996,531 (-0.3%) | 858,414 (-14.2%) | **1,005,523 (+0.6%)** | -33.2% | 113,902 |
| model ridge eşik 0.00% | 1,172,314 (+17.2%) | 948,470 (-5.2%) | **739,973 (-26.0%)** | -39.2% | 162,328 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 515,468 (-48.5%) | 788,159 (-21.2%) | **680,687 (-31.9%)** | -47.4% | 591,889 |
| model mlp eşik 0.25% | 820,121 (-18.0%) | 715,412 (-28.5%) | **644,602 (-35.5%)** | -48.3% | 447,665 |
| model mlp eşik 0.50% | 1,669,006 (+66.9%) | 914,529 (-8.5%) | **1,237,438 (+23.7%)** | -29.5% | 480,267 |
| model mlp eşik 0.75% | 1,398,553 (+39.9%) | 1,019,600 (+2.0%) | **901,445 (-9.9%)** | -37.2% | 201,337 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **739,973 (-26.0%)**, maks düşüş -39.2%, maliyet 162,328. Dışarı korelasyon 0.045.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
