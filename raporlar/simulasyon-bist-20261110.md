# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-10

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,246,411 (+24.6%) | 980,071 (-2.0%) | **1,090,900 (+9.1%)** | -26.5% | 3,237 |
| gece | 553,387 (-44.7%) | 891,423 (-10.9%) | **770,994 (-22.9%)** | -28.8% | 722,927 |
| gunduz | 112,256 (-88.8%) | 601,448 (-39.9%) | **318,309 (-68.2%)** | -70.0% | 452,986 |
| gece_momentum | 686,891 (-31.3%) | 944,349 (-5.6%) | **923,297 (-7.7%)** | -20.8% | 755,797 |
| trend_50 | 1,056,591 (+5.7%) | 907,280 (-9.3%) | **1,137,357 (+13.7%)** | -30.5% | 134,032 |
| haftalik_momentum | 1,015,115 (+1.5%) | 853,743 (-14.6%) | **1,024,275 (+2.4%)** | -33.1% | 113,352 |
| model ridge eşik 0.00% | 1,177,364 (+17.7%) | 948,470 (-5.2%) | **743,160 (-25.7%)** | -39.2% | 162,332 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 506,794 (-49.3%) | 783,405 (-21.7%) | **669,233 (-33.1%)** | -48.3% | 587,037 |
| model mlp eşik 0.25% | 817,179 (-18.3%) | 711,525 (-28.8%) | **642,290 (-35.8%)** | -48.3% | 447,665 |
| model mlp eşik 0.50% | 1,662,981 (+66.3%) | 911,362 (-8.9%) | **1,232,972 (+23.3%)** | -29.5% | 480,260 |
| model mlp eşik 0.75% | 1,396,062 (+39.6%) | 1,016,070 (+1.6%) | **899,840 (-10.0%)** | -37.2% | 201,335 |
| model mlp eşik 1.00% | 1,238,319 (+23.8%) | 936,258 (-6.4%) | **976,597 (-2.3%)** | -27.6% | 118,555 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **743,160 (-25.7%)**, maks düşüş -39.2%, maliyet 162,332. Dışarı korelasyon 0.046.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
