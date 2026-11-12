---
name: rapor
description: KPI report (günlük / haftalık / aylık özet) for the KPIs in yerel/ayarlar.json with period-over-period change, trend and flags.
argument-hint: '[gun|hafta|ay]'
---

# /rapor $ARGUMENTS

1. `python3 kit/mp.py kpi --donem <gun|hafta|ay, default hafta> --rapor`
   (Mixpanel source `mcp`: ask `veri-cekici` for each KPI's last 9 periods at that granularity, then render the
   same table yourself; skip the file unless asked.)
2. Use only the printed table. In the report file fill `## Yorum` with ≤ 5 bullets:
   biggest moves with numbers · flagged rows (⚠) · matching lines from `yerel/notlar.md` ·
   one follow-up command (e.g. `/neden "<olay>" hafta`).
3. Reply in 3 lines: headline move, the main flag (or "olağan dışı yok"), report path.

Rules: a ⚠ needs both |Δ%| ≥ threshold and |z| ≥ threshold (set in ayarlar `esikler`); otherwise call it normal
variation. The last period is complete by construction; do not compare against a partial period.
