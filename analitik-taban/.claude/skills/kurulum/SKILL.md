---
name: kurulum
description: One-time setup of this analytics workspace on a machine (or demo mode with synthetic data).
argument-hint: '[demo]'
disable-model-invocation: true
---

# /kurulum $ARGUMENTS

Goal: a working `yerel/` folder and `CLAUDE.local.md` with as few tokens as possible. The user types secrets into
files themselves; never ask for them in chat and never read `yerel/.env`.

1. `python3 kit/kurulum.py durum`. If `python3` is missing: ask the user to install Python 3.9+ (Windows: try
   `py -3 kit/kurulum.py durum`; then use `py -3` instead of `python3` everywhere) and stop.
2. Demo requested: `python3 kit/kurulum.py baslat --demo`, then reply with 3 things to try:
   `/rapor hafta`, `/neden Purchase`, `/hotjar yerel/girdi/demo-anket.csv`. Stop.
3. Otherwise `python3 kit/kurulum.py baslat`. Ask the user in ONE message to:
   a. open `yerel/.env` in their editor and fill the Mixpanel service account (or API secret) and, only if they
   have Hotjar API access, the Hotjar keys;
   b. tell you: Mixpanel region (us / eu / in), project ID, project timezone (UTC offset), Hotjar site ID (optional),
   and whether Mixpanel access should be `api` (scripts, cheapest), `mcp` (Mixpanel MCP server) or `csv`.
   Write the non-secret answers into `yerel/ayarlar.json`.
4. `api`: `python3 kit/mp.py kontrol`. On error show the script's one-line fix and wait.
   Then `python3 kit/mp.py sozluk` (builds the local event dictionary once).
   `mcp`: ask the `veri-cekici` subagent to list the top 60 events of the last 30 days with volume and their top 10
   properties, saved as CSV `yerel/girdi/sozluk.csv` (columns: olay,hacim,ozellik); then
   `python3 kit/mp.py sozluk --ice-aktar yerel/girdi/sozluk.csv`.
   `csv`: ask for a Lexicon export (Data Management → Lexicon → Export) into `yerel/girdi/`, then the same import.
5. From the dictionary summary propose ≤ 6 KPIs, ≤ 4 breakdown dimensions and the saved funnel IDs the user names;
   after approval write `kpiler`, `boyutlar`, `huniler` into `yerel/ayarlar.json`.
6. `python3 kit/kurulum.py baglam`, then reply: "Kurulum tamam. Deneyin: /rapor hafta".
