---
name: deney
description: A/B test readout (deney, experiment, varyant) — conversion per variant, lift with 95% CI, p-value, sample-ratio check, minimum detectable effect, and a verdict.
argument-hint: '<deney adı> <dönüşüm olayı>'
---

# /deney $ARGUMENTS

1. `python3 kit/mp.py deney "<deney adı>" --donusum "<olay>" [--aralik <bas:bit>] [--kontrol <varyant>]`
   Exposure event and property names come from `deney` in ayarlar (Mixpanel default: `$experiment_started`,
   `Experiment name`, `Variant name`). With a saved exposure→conversion funnel use `--huni-id <id>` instead.
2. Verdict, in this order:
   - SRM p < 0,001 → "sonuç güvenilmez: varyant dağılımı beklenenden sapıyor" and stop.
   - p < 0,05 and the CI excludes 0 → "anlamlı" (state lift and CI).
   - else "henüz belirsiz" + the MDE line ("bu örneklemle ancak ±X puan fark görülebilir").
3. ≤ 8 lines. Mention a possible novelty effect if the test ran < 7 days. No claims beyond the tested metric.
