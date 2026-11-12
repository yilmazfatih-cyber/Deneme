---
name: hotjar
description: Hotjar survey / feedback analysis (anket, NPS, geri bildirim, yorumlar) — score breakdowns, open-text themes with prevalence and quotes, from the Hotjar API or an exported CSV.
argument-hint: '<anket ID | yerel/girdi/dosya.csv> [soru]'
---

# /hotjar $ARGUMENTS

1. Get a file: survey ID and Hotjar API → `python3 kit/hj.py indir <id>` (writes `yerel/girdi/hotjar-anket-<id>.csv`;
   `python3 kit/hj.py anketler` lists IDs). Otherwise the user exports CSV into `yerel/girdi/`.
2. `python3 kit/hj.py ozet <dosya> [--grup <sütun>]` → NPS / score distribution, choices, text keywords.
3. Themes, only when open text matters:
   a. `python3 kit/hj.py ornek <dosya> --soru "<sütun>" --n 40 [--filtre "<puan sütunu><=6"]`
   b. From that sample define 5–8 themes as keyword rules in `yerel/temalar.json` (format and stem syntax:
   `kit/ornekler/temalar.json`, e.g. `ödem*`).
   c. `python3 kit/hj.py tema <dosya> --kurallar yerel/temalar.json [--soru "<sütun>"] [--grup <sütun>]` → share over
   ALL answers. If unmatched > %25, refine the rules once using the unmatched examples it prints.
4. Answer in ≤ 12 lines: NPS or mean score (n) · top 3 themes with share and one short quote each ·
   notable group differences. Quotes verbatim, ≤ 15 words, no personal data.
