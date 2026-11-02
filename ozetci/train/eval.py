"""Değerlendirme: ROUGE-L (harici bağımlılık yok) + biçim uyumu + uydurma rakam denetimi.

Örnek::

    python train/eval.py --data data/eval.jsonl --model models/ozetci-qwen3-0.6b --limit 200
    python train/eval.py --data data/eval.jsonl --model models/ozetci-qwen3-0.6b/model-Q8_0.gguf
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from common import ROOT, read_jsonl

sys.path.insert(0, str(ROOT))
from ozetci.summarize.output_parse import parse_summary, unverified_numbers  # noqa: E402
from ozetci.textutil import tr_lower  # noqa: E402

_TOKEN_RE = re.compile(r"\w+", re.U)
_NUM_RE = re.compile(r"\d[\d.,]*")


def tokens(text: str) -> list[str]:
    return _TOKEN_RE.findall(tr_lower(text))


def rouge_l(pred: str, ref: str) -> float:
    a, b = tokens(pred), tokens(ref)
    if not a or not b:
        return 0.0
    prev = [0] * (len(b) + 1)
    for x in a:
        cur = [0]
        for j, y in enumerate(b, 1):
            cur.append(prev[j - 1] + 1 if x == y else max(prev[j], cur[j - 1]))
        prev = cur
    lcs = prev[-1]
    p, r = lcs / len(a), lcs / len(b)
    return 0.0 if p + r == 0 else 2 * p * r / (p + r)


def number_hallucination(pred: str, source: str) -> float:
    """Tahmindeki rakamların kaynakta geçmeyen oranı (0 iyi); çalışma zamanındaki denetimle aynı kural."""
    nums = _NUM_RE.findall(pred)
    if not nums:
        return 0.0
    return len(unverified_numbers(pred, source)) / len(nums)


def source_text(user_message: str) -> str:
    for marker in ("METİN:\n", "TEXT:\n"):
        if marker in user_message:
            return user_message.split(marker, 1)[1]
    return user_message


def build_generator(model: str):
    if model.endswith(".gguf"):
        from ozetci.summarize.gguf_backend import LlamaCppGenerator

        return LlamaCppGenerator(model)
    from ozetci.summarize.hf_backend import HFGenerator

    return HFGenerator(model)


def main(argv=None) -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--data", default=str(ROOT / "data" / "eval.jsonl"))
    p.add_argument("--model", required=True)
    p.add_argument("--limit", type=int, default=100)
    p.add_argument("--out", default=None, help="tahminleri jsonl'e yaz")
    args = p.parse_args(argv)

    rows = read_jsonl(Path(args.data))[: args.limit]
    gen = build_generator(args.model)
    scores, fmt_ok, halluc, preds = [], 0, [], []
    for r in rows:
        pred = gen.generate(r["prompt"], max_new_tokens=350)
        ref = r["completion"][0]["content"]
        source = source_text(r["prompt"][-1]["content"])
        parsed = parse_summary(pred, r.get("lang", "tr"))
        fmt_ok += 0 if parsed.notes else 1
        scores.append(rouge_l(parsed.text + " " + " ".join(parsed.bullets), parse_summary(ref).text + " " + " ".join(parse_summary(ref).bullets)))
        halluc.append(number_hallucination(pred, source))
        preds.append({"pred": pred, "ref": ref})
    n = max(len(rows), 1)
    print(json.dumps({"n": len(rows), "rouge_l": sum(scores) / n, "format_ok": fmt_ok / n, "number_hallucination": sum(halluc) / n}, ensure_ascii=False, indent=2))
    if args.out:
        Path(args.out).write_text("\n".join(json.dumps(x, ensure_ascii=False) for x in preds), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
