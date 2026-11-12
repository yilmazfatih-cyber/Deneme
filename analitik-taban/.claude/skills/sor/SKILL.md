---
name: sor
description: Answer an ad-hoc Mixpanel question (kaç kişi, ne kadar, hangi segment, trend) with one compact query; also reads saved Mixpanel reports by ID and exported CSVs.
argument-hint: '<soru>'
---

# /sor $ARGUMENTS

Pick the single cheapest command (names: `python3 kit/mp.py ara <terim>` first if unsure):

- events over time: `python3 kit/mp.py seri "<olay>" ["<olay>" ...] --tip <unique|general> --birim <day|week|month> --aralik 28g`
- breakdown: `python3 kit/mp.py kirilim "<olay>" --on <özellik> --aralik 28g [--limit 10]`
- values of a property: `python3 kit/mp.py degerler "<olay>" <özellik>`
- a saved report (ID in its URL): `python3 kit/mp.py kayitli <id>`
- a CSV the user exported: `python3 kit/ozet.py yerel/girdi/<dosya>`

Filters on `seri` / `kirilim` / `neden`: `--filtre '$os=Android' --filtre 'plan!=free'` (operators `= != > < >= <=`,
`~` = contains). Raw Mixpanel expressions: `--where '<expr>'`.
Mixpanel source `mcp`: send the same spec to `veri-cekici`.

Answer in ≤ 6 lines: the number(s), the date range, the definition used (unique/total, filters).
