---
name: tutunma
description: Retention / cohort analysis (tutunma, retention, D1/D7/D30, kohort) from a start event to a return event, daily or weekly, with optional breakdown.
argument-hint: '<başlangıç olayı> [dönüş olayı] [gun|hafta] [kırılım]'
---

# /tutunma $ARGUMENTS

1. `python3 kit/mp.py tutunma "<başlangıç>" ["<dönüş>"] --birim <day|week> [--sayi 8] [--on <özellik>] [--aralik 56g]`
   (no return event = any return of the same event). Mixpanel source `mcp`: ask `veri-cekici` for the cohort table.
2. Answer in ≤ 8 lines: weighted curve at key points (D1/D7/D30 or H1/H4) · newest complete cohorts vs average ·
   segment gaps if `--on` · the newest cohorts are incomplete, say so instead of reading them as drops.
