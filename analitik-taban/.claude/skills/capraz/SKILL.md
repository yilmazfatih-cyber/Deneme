---
name: capraz
description: Cross-check a Mixpanel finding with Hotjar (çapraz analiz) — turns a drop or weak funnel step into a recordings/heatmap filter recipe, survey evidence and testable hypotheses.
argument-hint: '<bulgu, ör. "ödeme adımında Android kaybı arttı">'
---

# /capraz $ARGUMENTS

1. Pin the finding with numbers (from `/neden` or `/huni` in this session; else run the one relevant command).
2. Platform check first: Hotjar records the website only. If the finding is in the native app (Android/iOS
   `$os` with `$app_version_string`), say Hotjar cannot show it and propose app-side evidence instead (Mixpanel
   Session Replay if enabled, crash/ANR logs for that version, store reviews), then continue only with web parts.
3. Pages involved: `python3 kit/mp.py degerler "<olay>" '$current_url'`; keep the top 3.
4. Survey/feedback evidence if a Hotjar CSV exists in `yerel/girdi/`:
   `python3 kit/hj.py tema <dosya> --kurallar yerel/temalar.json --filtre "Sayfa URL~<yol>"`.
5. Copy `kit/sablonlar/capraz.md` to `yerel/raporlar/<YYYY-AA-GG>-capraz-<konu>.md` and fill it: finding,
   recordings filter recipe (page URL, date range, device, rage clicks, u-turns, errors; Mixpanel events only if the
   Hotjar–Mixpanel integration sends them), heatmaps to open, survey evidence, 2–4 hypotheses with "nasıl doğrulanır".
6. Reply in ≤ 6 lines: the 3 most promising checks + path. Recordings and heatmaps are not in any API: the user
   watches them and reports counts back ("15 kayıttan 9'unda …"); record those in the file.

Note: accounts moved from Hotjar to Contentsquare keep surveys but not old recordings/heatmaps; if the user is on
Contentsquare, the same recipe applies there (segments, replays, zoning).
