# Strateji simülasyonu — BIST — 2024-11-11 → 2026-11-09

Başlangıç 1,000,000 TRY; 39 hisse; tek yön maliyet 0.15%.
Ödül = log(W_T/W_0) − maks düşüş. Seçim penceresi ilk 12 ay (→ 2025-11-11); ileriye yürüyen ölçüm sonrası.

| Strateji | Tüm dönem (geriye bakışlı) | Yalnız test günleri | İleriye yürüyen | Maks düşüş (ileri) | Maliyet (ileri) |
|---|---|---|---|---|---|
| al_tut | 1,236,329 (+23.6%) | 980,071 (-2.0%) | **1,082,076 (+8.2%)** | -26.5% | 3,224 |
| gece | 558,002 (-44.2%) | 891,423 (-10.9%) | **777,424 (-22.3%)** | -28.8% | 720,603 |
| gunduz | 111,092 (-88.9%) | 601,448 (-39.9%) | **315,008 (-68.5%)** | -70.0% | 452,035 |
| gece_momentum | 694,086 (-30.6%) | 944,349 (-5.6%) | **932,968 (-6.7%)** | -20.8% | 753,011 |
| trend_50 | 1,043,025 (+4.3%) | 907,280 (-9.3%) | **1,122,754 (+12.3%)** | -30.5% | 133,027 |
| haftalik_momentum | 995,598 (-0.4%) | 853,743 (-14.6%) | **1,004,582 (+0.5%)** | -33.1% | 113,323 |
| model ridge eşik 0.00% | 1,187,677 (+18.8%) | 948,470 (-5.2%) | **749,669 (-25.0%)** | -39.2% | 160,091 |
| model ridge eşik 0.25% | 1,045,569 (+4.6%) | 1,000,000 (+0.0%) | **970,571 (-2.9%)** | -16.0% | 19,684 |
| model ridge eşik 0.50% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 0.75% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model ridge eşik 1.00% | 1,000,000 (+0.0%) | 1,000,000 (+0.0%) | **1,000,000 (+0.0%)** | 0.0% | 0 |
| model mlp eşik 0.00% | 506,725 (-49.3%) | 783,405 (-21.7%) | **669,141 (-33.1%)** | -48.3% | 585,008 |
| model mlp eşik 0.25% | 810,721 (-18.9%) | 711,525 (-28.8%) | **637,214 (-36.3%)** | -48.3% | 445,710 |
| model mlp eşik 0.50% | 1,677,757 (+67.8%) | 911,362 (-8.9%) | **1,243,927 (+24.4%)** | -29.5% | 476,542 |
| model mlp eşik 0.75% | 1,409,248 (+40.9%) | 1,016,070 (+1.6%) | **908,339 (-9.2%)** | -37.2% | 198,620 |
| model mlp eşik 1.00% | 1,245,256 (+24.5%) | 936,258 (-6.4%) | **982,068 (-1.8%)** | -27.6% | 115,615 |

Seçim penceresi ödülüne göre seçilen model: **ridge, eşik 0.00%** → ileriye yürüyen sonuç **749,669 (-25.0%)**, maks düşüş -39.2%, maliyet 160,091. Dışarı korelasyon 0.048.

Okuma kılavuzu: 'Tüm dönem' sütunu seçimin yapıldığı veriyi de kapsar, şişkindir. 'İleriye yürüyen' sütunu bugünkü paraya en yakın dürüst tahmindir. Hiçbir strateji al-tut'u ileriye yürüyen ölçümde anlamlı ve maliyet sonrası geçmiyorsa, cevap 'al-tut ya da nakit'tir.

Yatırım tavsiyesi değildir.
