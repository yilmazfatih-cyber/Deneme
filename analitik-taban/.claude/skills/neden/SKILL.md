---
name: neden
description: Root-cause drill-down for a metric change (neden düştü / arttı): splits the change across platform, version, country, channel; finds segments that deviate; checks the release/campaign log.
argument-hint: '<olay | --pay olay --payda olay> [gun|hafta|28g]'
---

# /neden $ARGUMENTS

1. Unsure of the event name: `python3 kit/mp.py ara <terim>`.
2. Run one command:
   - count metric: `python3 kit/mp.py neden "<olay>" --donem <gun|hafta|28g> [--tip unique] [--filtre k=v]`
   - ratio metric (conversion): `python3 kit/mp.py neden --pay "<olay>" --payda "<olay>" --donem …`
   - dimensions default to `boyutlar` in ayarlar (`--boyutlar a,b` overrides); `gun` = yesterday vs the same
     weekday last week.
   - Mixpanel source `mcp`: give `veri-cekici` the A/B ranges and, per dimension, the top-10 breakdown for both
     ranges, saved as `yerel/girdi/neden.csv` (columns `boyut,segment,a,b` plus one `(toplam)` row per boyut with
     the true totals; ratio: `boyut,segment,pay_a,payda_a,pay_b,payda_b`). Then
     `python3 kit/mp.py neden --csv yerel/girdi/neden.csv`.
3. Answer in ≤ 10 lines: total change (Δ, Δ%, z) · where it concentrates (segment, share of the change, its own Δ%) ·
   which dimensions are flat (ruled out) · matching log lines · one next step (`/huni`, `/capraz`, or `neden` with
   `--filtre` on the culprit segment).

Rules: overall |z| < 2 → "değişim gürültü sınırında", stop. Prefer `sapma z` over raw Δ to localize (big segments
always dominate Δ). For app versions, judge with a ratio metric: users migrate between versions.
