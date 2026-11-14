"""Derlem: sunucunun gönderdiği girdiler (EmbeddingInput, ml/tools/dump-inputs.ts) + çekim dizini ayrıntıları.

Eğitim, değerlendirme, dışa aktarma ve model sunucusu aynı girdi biçimiyle çalışır; böylece eğitimdeki genel bağlam
(özet, geçerli etiketler, tür, ruh hâli) sunucunun canlı olarak gönderdiğiyle aynıdır.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .paths import INPUTS_FILE, SHOTS_DIR, TITLES_DIR

Input = dict[str, Any]

# Eğitimde kullanılabilecek lisanslar (katalogdaki `license.name` değerleri). Gerisi yalnız çıkarımda kullanılır.
OPEN_LICENCES = ("CC BY", "CC BY 2.5", "CC BY 3.0", "CC BY 4.0", "Kamu malı")


def load_inputs(path: Path = INPUTS_FILE) -> list[Input]:
    if not path.exists():
        raise FileNotFoundError(f"{path} yok — önce: npx tsx ml/tools/dump-inputs.ts --out {path}")
    return json.loads(path.read_text("utf-8"))["inputs"]


def keyframe_sources() -> dict[int, tuple[str | None, list[str | None]]]:
    """KEYFRAMES yaprakları: videoId → (youtubeId, çekim başına kare adı)."""
    f = SHOTS_DIR / "keyframes.json"
    if not f.exists():
        return {}
    kf = json.loads(f.read_text("utf-8"))
    return {v["videoId"]: (v.get("youtubeId"), [s.get("src") for s in v["shots"]]) for v in kf["videos"]}


@dataclass(frozen=True)
class TitleInfo:
    title_id: int
    title: str
    licence: str
    attribution: str
    url: str
    kind: str  # MOVIE | SHOW
    year: int | None


def load_titles() -> dict[int, TitleInfo]:
    out: dict[int, TitleInfo] = {}
    for f in sorted(TITLES_DIR.glob("*.json")):
        data = json.loads(f.read_text("utf-8"))
        for t in data if isinstance(data, list) else data.get("titles", []):
            lic = t.get("license") or {}
            out[t["videoId"]] = TitleInfo(
                t["videoId"], t["title"], lic.get("name", ""), lic.get("attribution", ""), lic.get("url", ""),
                t.get("type", "MOVIE"), t.get("year"),
            )
    return out


def is_open(licence: str) -> bool:
    return licence.strip() in OPEN_LICENCES
