"""Eğitim betiklerinin ortak parçaları: istem biçimi (çalışma zamanıyla birebir aynı) ve yardımcılar."""

from __future__ import annotations

import json
import os
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ozetci.summarize.prompts import build_messages  # noqa: E402


def example_to_prompt_completion(text: str, summary: str, kind: str, lang: str, title: str | None = None) -> dict:
    """TRL "prompt-completion (conversational)" biçimi: loss yalnızca yanıt üzerinde."""
    return {
        "prompt": build_messages(text, kind, lang, title, stage="final"),
        "completion": [{"role": "assistant", "content": summary}],
        "kind": kind,
        "lang": lang,
    }


def format_target(summary: str, bullets: list[str] | None = None, actions: list[str] | None = None, lang: str = "tr") -> str:
    """Hedef yanıtı çalışma zamanının beklediği ÖZET/MADDELER/EYLEMLER biçimine koyar."""
    if lang == "en":
        head, pts, acts, none = "SUMMARY", "POINTS", "ACTIONS", "None"
    else:
        head, pts, acts, none = "ÖZET", "MADDELER", "EYLEMLER", "Yok"
    lines = [f"{head}: {summary.strip()}", f"{pts}:"]
    lines += [f"- {b.strip()}" for b in (bullets or []) if b.strip()] or [f"- {none}"]
    lines.append(f"{acts}:")
    lines += [f"- {a.strip()}" for a in (actions or []) if a.strip()] or [f"- {none}"]
    return "\n".join(lines)


def sentences_as_bullets(summary: str, max_items: int = 4) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", summary.strip())
    return [p for p in parts if len(p.split()) >= 3][:max_items]


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as fh:
        return [json.loads(ln) for ln in fh if ln.strip()]


def seeded(seed: int = 42) -> random.Random:
    return random.Random(seed)


def env_flag(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "evet")
