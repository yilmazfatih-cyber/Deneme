"""Sonuç kayıtları: `sonuclar/<etiket>.jsonl`, her satır bir puanlama.

Etiket modeli (ve isterseniz aracı) adlandırır: `qwen3-coder-30b`, `qwen2.5:7b+aider`. Dosya adında
güvenli olmayan karakterler `-` olur; asıl etiket kaydın içinde durur.
Genişletme: kayda yeni alan eklerseniz `to_entry`'ye yazın; rapor eski kayıtlarda yoksa varsayılan kullanır.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from exam.grade import GradeResult
from exam.paths import results_dir

SCHEMA_VERSION = 1


def label_file(label: str) -> Path:
    if not label.strip():
        raise ValueError("Etiket boş olamaz: --etiket <model-adı> verin.")
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", label.strip()).strip("-.") or "etiket"
    return results_dir() / f"{safe}.jsonl"


def read_entries(path: Path) -> list[dict[str, Any]]:
    entries = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            entries.append(json.loads(line))
        except json.JSONDecodeError as error:
            raise ValueError(f"{path.name}:{number} okunamadı ({error}).") from error
    return entries


def all_entries() -> list[dict[str, Any]]:
    """Bütün sonuç dosyalarının kayıtları (örnek dosya hariç)."""
    folder = results_dir()
    if not folder.is_dir():
        return []
    entries: list[dict[str, Any]] = []
    for path in sorted(folder.glob("*.jsonl")):
        if path.name != "ornek.jsonl":
            entries += read_entries(path)
    return entries


def next_attempt(label: str, task_id: str) -> int:
    path = label_file(label)
    if not path.exists():
        return 1
    done = [e for e in read_entries(path) if e.get("etiket") == label and e.get("gorev") == task_id]
    return len(done) + 1


def to_entry(
    result: GradeResult,
    label: str,
    *,
    tool: str = "",
    attempt: int = 1,
    minutes: float | None = None,
    note: str = "",
) -> dict[str, Any]:
    task = result.task
    return {
        "surum": SCHEMA_VERSION,
        "etiket": label,
        "arac": tool,
        "gorev": task.id,
        "temel": task.foundation,
        "zorluk": task.difficulty,
        "tur": task.kind,
        "deneme": attempt,
        "sonuc": result.verdict,
        "kalan": result.failed,
        "asamalar": [
            {"ad": s.name, "durum": s.status, "sure_sn": round(s.seconds, 1)} for s in result.stages
        ],
        "ihlaller": [finding.as_dict() for finding in result.integrity.violations],
        "uyarilar": [finding.as_dict() for finding in result.integrity.warnings],
        "sure_dk": minutes if minutes is not None else result.minutes,
        "sure_kaynagi": "girilen" if minutes is not None else "hazirla-puanla arasi",
        "degisiklik": result.diff.as_dict() | {"dosyalar": result.diff.dosyalar[:50]},
        "kosu": result.record.run_id,
        "istem_ozeti": result.record.prompt_digest,
        "gorev_ozeti": result.record.task_digest,
        "temel_ozeti": result.record.foundation_digest,
        "hazirlandi": result.record.prepared_at,
        "puanlandi": result.graded_at,
        "notlar": result.notes,
        "not": note,
    }


def append(entry: dict[str, Any]) -> Path:
    path = label_file(str(entry["etiket"]))
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return path
