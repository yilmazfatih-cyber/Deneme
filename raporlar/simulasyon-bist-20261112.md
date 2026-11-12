# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-12

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,251,527 (+25.2%) | 996,318 (-0.4%) | **1,095,378 (+9.5%)** | -26.5% | 3,244 |
| gece | 559,101 (-44.1%) | 906,096 (-9.4%) | **778,956 (-22.1%)** | -28.6% | 728,270 |
| gunduz | 110,233 (-89.0%) | 597,916 (-40.2%) | **312,572 (-68.7%)** | -70.1% | 454,591 |
| gece_momentum | 688,418 (-31.2%) | 958,890 (-4.1%) | **925,349 (-7.5%)** | -20.4% | 762,510 |
| trend_50 | 1,048,920 (+4.9%) | 918,287 (-8.2%) | **1,129,099 (+12.9%)** | -30.5% | 135,540 |
| haftalik_momentum | 1,010,863 (+1.1%) | 869,724 (-13.0%) | **1,019,985 (+2.0%)** | -33.2% | 114,232 |
| model ridge eşik 0.00% | 1,188,738 (+18.9%) | 962,597 (-3.7%) | **750,340 (-25.0%)** | -39.3% | 164,537 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 507,056 (-49.3%) | 777,201 (-22.3%) | **669,579 (-33.0%)** | -47.8% | 592,987 |
| model mlp eşik 0.25% | 831,059 (-16.9%) | 722,816 (-27.7%) | **653,199 (-34.7%)** | -48.1% | 449,263 |
| model mlp eşik 0.50% | 1,696,126 (+69.6%) | 927,275 (-7.3%) | **1,257,546 (+25.8%)** | -29.3% | 484,737 |
| model mlp eşik 0.75% | 1,400,618 (+40.1%) | 1,019,769 (+2.0%) | **902,777 (-9.7%)** | -37.1% | 201,458 |
| model mlp eşik 1.00% | 1,257,542 (+25.8%) | 936,258 (-6.4%) | **991,758 (-0.8%)** | -27.6% | 118,578 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **750,340 (-25.0%)**, maks düşüş -39.3%, maliyet 164,537. Dışarı korelasyon 0.044.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
