"""Sunucunun okuduğu biçim (server/src/services/embeddings/PROTOKOL.md, models.ts → zModelManifest).

content/models/mediafm-mini/
  manifest.json      {"format":"tvplus-embedding/1","id":"mediafm-mini","version",…,"dims","builtAt","files":["vectors.jsonl"]}
  vectors.jsonl      1. satır {"kind":"model","id","version","dims"} (manifestle aynı) · sonra yaprak başına
                     {"kind":"video","videoId","titleId","shots":[[…]…],"pooled":[…]}
  model.safetensors  eğitilmiş kaynaştırma ağırlıkları · config.json model ve etiket düzeni
"""

from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
import torch

from .context import TagLayout
from .model import MediaFMMini, ModelConfig

PROTOCOL = "tvplus-embedding/1"
ID_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
DIGITS = 6


def fmt_vec(v: np.ndarray, digits: int = DIGITS) -> str:
    """Sabit ondalıklı, belirlenimci JSON dizisi (−0 → 0)."""
    r = np.round(np.asarray(v, dtype=np.float64), digits) + 0.0
    return "[" + ",".join(repr(float(x)) if x != int(x) else str(int(x)) for x in r) + "]"


def model_line(model_id: str, version: str, dims: int) -> str:
    return json.dumps({"kind": "model", "id": model_id, "version": version, "dims": dims}, separators=(",", ":"))


def video_line(video_id: int, title_id: int, shots: np.ndarray, pooled: np.ndarray) -> str:
    rows = ",".join(fmt_vec(r) for r in shots)
    return (f'{{"kind":"video","videoId":{int(video_id)},"titleId":{int(title_id)},"shots":[{rows}],'
            f'"pooled":{fmt_vec(pooled)}}}')


def manifest(model_id: str, version: str, dims: int, built_at: str, description: str,
             files: list[str]) -> dict:
    if not ID_RE.match(model_id):
        raise ValueError(f"model kimliği geçersiz: {model_id}")
    if not (2 <= dims <= 4096):
        raise ValueError("dims 2–4096 olmalı")
    if not (1 <= len(version) <= 64):
        raise ValueError("version 1–64 karakter olmalı")
    return {"format": PROTOCOL, "id": model_id, "version": version, "dims": dims, "builtAt": built_at,
            "modalities": ["VISUAL", "AUDIO", "TEXT", "CONTEXT"], "files": files, "description": description[:2000]}


def check_vectors_file(path: Path, expected_counts: dict[int, int] | None = None) -> dict:
    """Sunucunun denetimlerinin Python karşılığı: model satırı, boyut, sonlu sayılar, çekim sayıları."""
    lines = path.read_text("utf-8").splitlines()
    head = json.loads(lines[0])
    assert head["kind"] == "model", "ilk satır model satırı olmalı"
    dims = head["dims"]
    seen: dict[int, int] = {}
    for ln in lines[1:]:
        if not ln.strip():
            continue
        row = json.loads(ln)
        assert row["kind"] == "video"
        shots = np.array(row["shots"], dtype=np.float64)
        assert shots.ndim == 2 and shots.shape[1] == dims and np.isfinite(shots).all()
        p = np.array(row["pooled"], dtype=np.float64)
        assert p.shape == (dims,) and np.isfinite(p).all()
        seen[row["videoId"]] = shots.shape[0]
    if expected_counts:
        bad = {v: (seen.get(v), n) for v, n in expected_counts.items() if seen.get(v) != n}
        assert not bad, f"çekim sayısı uyuşmuyor: {bad}"
    return {"model": head, "videos": len(seen), "shots": sum(seen.values())}


def save_weights(out: Path, model: MediaFMMini, layout: TagLayout, extra: dict) -> None:
    from safetensors.torch import save_file

    state = {k: v.detach().contiguous() for k, v in model.state_dict().items()}
    save_file(state, str(out / "model.safetensors"), metadata={"format": "pt"})
    (out / "config.json").write_text(json.dumps({"model": model.cfg.to_dict(), "layout": layout.to_json(), **extra},
                                                ensure_ascii=False, indent=1) + "\n")


def load_shipped(model_dir: Path) -> tuple[MediaFMMini, TagLayout, dict]:
    """Dönen manifest sözlüğüne `outCenter` (np.ndarray | None) eklenir."""
    from safetensors.torch import load_file

    cfg = json.loads((model_dir / "config.json").read_text("utf-8"))
    man = json.loads((model_dir / "manifest.json").read_text("utf-8"))
    model = MediaFMMini(ModelConfig(**cfg["model"]))
    model.load_state_dict(load_file(str(model_dir / "model.safetensors")))
    model.eval()
    man["outCenter"] = np.array(cfg["outCenter"], dtype=np.float32) if cfg.get("outCenter") else None
    return model, TagLayout.from_json(cfg["layout"]), man
