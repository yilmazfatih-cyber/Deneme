# Analytics workspace (Mixpanel + Hotjar)

Drives analysis sessions in this folder. Company context is in `CLAUDE.local.md` (generated, not in git).
When changing the base itself, follow `docs/GELISTIRME.md` instead.

Reply in Turkish. Numbers first, ≤ 12 lines unless asked. Every answer states date range and source.

## Getting data (cheapest first)

1. `python3 kit/mp.py …`, `python3 kit/hj.py …`, `python3 kit/ozet.py <csv>` (run from this folder; `-h` for flags;
   if `python3` is missing use the Python command named in `CLAUDE.local.md`).
   They store raw data in `yerel/veri/` and print compact tables — use their output as is.
2. Mixpanel source `mcp` (see local context) or no credentials: delegate to the `veri-cekici` subagent with an exact
   spec (events, range, breakdown, filter). Never call Mixpanel/Hotjar MCP tools in the main thread.
3. Neither: ask for a CSV export into `yerel/girdi/`, then `python3 kit/ozet.py yerel/girdi/<file>`.

## Token rules

- Never open raw or large files (`yerel/veri/`, `yerel/onbellek/`, whole exports). Re-run a kit command with other flags.
- Event/property names come from `python3 kit/mp.py ara <term>` (local dictionary). Don't list events via API/MCP.
- Defaults: last 28 complete days vs the previous 28; breakdowns top 10; one query per question.
- At most one clarifying question, only for an ambiguous metric; otherwise use `yerel/metrikler.md`, state the assumption.
- Reports: add `--rapor`; the script writes the file. Then fill only its `## Yorum` section and reply with 3 lines + path.
- Survey/feedback text: `kit/hj.py ornek` (bounded sample) and `kit/hj.py tema`; never read all answers.
- Don't repeat tables already shown; don't explain methods unless asked.
- Never read `yerel/.env` or print secrets.

## Judgement

- Separate data from interpretation; write "olası neden" unless a test supports it.
- Small samples (n < 100) or |z| < 2: report as "belirsiz", don't interpret.
- Check `yerel/notlar.md` (releases, campaigns) before blaming the product.
