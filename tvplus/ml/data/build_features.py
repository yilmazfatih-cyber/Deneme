"""Tüm katalog yaprakları için tek kipli öznitelikleri hesaplar (önbellekte olanı yeniden hesaplamaz).

    python -m data.build_features [--offline] [--threads 2]

Girdi: ml/.cache/inputs.json (npx tsx ml/tools/dump-inputs.ts). Çıktı: ml/.cache/features/<videoId>.npz,
ml/.cache/features/synopsis.npz ve ml/.cache/features/stats.json (kip kapsamı).
"""

from __future__ import annotations

import argparse
import json
import time

from mediafm_mini.corpus import load_inputs
from mediafm_mini.features import Extractor, SynopsisCache, context_text
from mediafm_mini.paths import FEATURE_DIR
from mediafm_mini import stills


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="eksik kareleri indirme")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--only", type=int, nargs="*", default=None, help="yalnız bu videoId'ler")
    args = ap.parse_args()
    inputs = load_inputs()
    ex = Extractor(args.threads, args.offline)
    syn = SynopsisCache()
    t0 = time.monotonic()
    stats: dict[str, dict] = {}
    for k, inp in enumerate(inputs):
        if args.only and inp["videoId"] not in args.only:
            continue
        t1 = time.monotonic()
        f = ex.compute(inp)
        syn.get(context_text(inp["context"]), ex)
        stats[str(inp["videoId"])] = {
            "method": inp["method"], "shots": f.n, "visual": int(f.visual_ok.sum()),
            "audio": int(f.audio_ok.sum()), "text": int(f.text_ok.sum()),
        }
        dt = time.monotonic() - t1
        if dt > 1:
            print(f"[{k + 1}/{len(inputs)}] {inp['videoId']} {inp['context']['title']}: {stats[str(inp['videoId'])]} "
                  f"{dt:.1f} sn", flush=True)
    syn.save()
    (FEATURE_DIR / "stats.json").write_text(json.dumps(stats, indent=1))
    print(f"bitti: {len(stats)} yaprak, {time.monotonic() - t0:.0f} sn, i.ytimg.com isteği: {stills.REQUESTS[0]}")


if __name__ == "__main__":
    main()
