"""Ortak hazırlık: girdiler + önbellekteki özniteliklerden tüm dizileri kurar."""

from __future__ import annotations

from .context import TagLayout
from .corpus import Input, load_inputs
from .dataset import Sequence
from .features import SynopsisCache
from .training import build_sequence


def load_all(layout: TagLayout | None = None) -> tuple[list[Input], dict[int, Sequence], TagLayout]:
    inputs = load_inputs()
    layout = layout or TagLayout.from_repo()
    syn = SynopsisCache()
    seqs: dict[int, Sequence] = {}
    missing = []
    for inp in inputs:
        s = build_sequence(inp, layout, syn)
        if s is None:
            missing.append(inp["videoId"])
        else:
            seqs[inp["videoId"]] = s
    if missing:
        print(f"uyarı: {len(missing)} yaprağın özniteliği yok (python -m data.build_features): {missing[:8]}…")
    return inputs, seqs, layout
