---
name: huni
description: Funnel analysis (huni, dönüşüm, adım kaybı) — saved Mixpanel funnel by name/ID or ad-hoc steps from raw events; breakdown, period comparison, weakest step.
argument-hint: '<huni adı | ID | "adım1" "adım2" ...> [kırılım]'
---

# /huni $ARGUMENTS

1. Saved funnel (name from local context or numeric ID):
   `python3 kit/mp.py huni <ad|id> [--on <özellik>] [--aralik 28g] [--onceki]`
   Unknown name: `python3 kit/mp.py huni --liste`.
2. Ad-hoc steps (no saved funnel):
   `python3 kit/mp.py huni-yerel "<adım1>" "<adım2>" [...] [--pencere 1g] [--on <özellik>] [--aralik 7g]`
   It downloads only those events; keep the range ≤ 14 days on high-volume apps.
3. Mixpanel source `mcp`: ask `veri-cekici` for the funnel's step counts (and breakdown if asked), ≤ 15 rows.
4. Answer in ≤ 10 lines: overall conversion · weakest step (largest drop, its rate, median time) · segments clearly
   below average (z ≤ -3) · change vs previous period with `--onceki`. Suggest `/capraz` for the weakest step.
