"""Genel bağlamın etiket kısmı → sabit düzenli öznitelik vektörü ([GLOBAL] belirtecinin bir yarısı).

Düzen (eğitimde kurulur, model dosyasına yazılır; sunucu sonradan yeni anahtar eklerse onlar yok sayılır):
  ölçekler      her ölçek için (değer / 5, var mı) — 0–5 ölçek, boş ölçek "yok" sayılır, 0 sayılmaz
  niteleyiciler çoklu-sıcak (sözlükteki tüm niteleyici anahtarları)
  yüzler        çoklu-sıcak ("yüz:değer")
  türler        çoklu-sıcak (shared/taxonomy GENRES)
  ruh hâlleri   çoklu-sıcak (shared/taxonomy MOODS)
  dayanak       tek-sıcak (CONSENSUS / SAMPLE / MODEL / NONE) — etiketin ne kadar güvenilir olduğu
  tür           tek-sıcak (MOVIE / SHOW)
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from .paths import CONTENT_DIR, ROOT

BASES = ("CONSENSUS", "SAMPLE", "MODEL", "NONE")
TYPES = ("MOVIE", "SHOW")


def _taxonomy_keys(block: str) -> list[str]:
    src = (ROOT / "shared" / "taxonomy.ts").read_text("utf-8")
    m = re.search(r"export const " + block + r" = \{(.*?)\n\} as const", src, flags=re.S)
    if not m:
        raise ValueError(f"shared/taxonomy.ts içinde {block} bulunamadı")
    return re.findall(r"^\s*'?([\w-]+)'?\s*:\s*\{", m.group(1), flags=re.M)


@dataclass
class TagLayout:
    scales: list[str]
    descriptors: list[str]
    facets: list[str]  # "yüz:değer"
    genres: list[str]
    moods: list[str]
    names: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.names = (
            [f"scale:{s}" for s in self.scales] + [f"scale?:{s}" for s in self.scales]
            + [f"desc:{d}" for d in self.descriptors] + [f"facet:{f}" for f in self.facets]
            + [f"genre:{g}" for g in self.genres] + [f"mood:{m}" for m in self.moods]
            + [f"basis:{b}" for b in BASES] + [f"type:{t}" for t in TYPES]
        )
        self._index = {n: i for i, n in enumerate(self.names)}

    @property
    def dim(self) -> int:
        return len(self.names)

    @classmethod
    def from_repo(cls) -> "TagLayout":
        voc = json.loads((CONTENT_DIR / "tagging" / "vocabulary.json").read_text("utf-8"))
        scales = [s["key"] for s in voc["scales"]]
        descs = sorted({d["key"] for s in voc["scales"] for d in s.get("descriptors") or []})
        facets = [f"{f['key']}:{v['key']}" for f in voc["facets"] for v in f["values"]]
        return cls(scales, descs, facets, _taxonomy_keys("GENRES"), _taxonomy_keys("MOODS"))

    def to_json(self) -> dict[str, list[str]]:
        return {"scales": self.scales, "descriptors": self.descriptors, "facets": self.facets,
                "genres": self.genres, "moods": self.moods}

    @classmethod
    def from_json(cls, d: dict[str, list[str]]) -> "TagLayout":
        return cls(d["scales"], d["descriptors"], d["facets"], d["genres"], d["moods"])

    def vector(self, ctx: dict[str, Any]) -> np.ndarray:
        """Sunucunun GlobalContext'inden öznitelik vektörü (bilinmeyen anahtarlar sessizce atlanır)."""
        v = np.zeros(self.dim, np.float32)
        ix = self._index
        tags = ctx.get("tags") or {}

        def put(name: str, val: float = 1.0) -> None:
            if name in ix:
                v[ix[name]] = val

        for k, val in (tags.get("scales") or {}).items():
            if isinstance(val, (int, float)):
                put(f"scale:{k}", float(np.clip(val, 0, 5)) / 5.0)
                put(f"scale?:{k}")
        for d in tags.get("descriptors") or []:
            put(f"desc:{d}")
        for f, vals in (tags.get("facets") or {}).items():
            for x in vals:
                put(f"facet:{f}:{x}")
        for g in ctx.get("genres") or []:
            put(f"genre:{g}")
        for m in ctx.get("moods") or []:
            put(f"mood:{m}")
        put(f"basis:{tags.get('basis', 'NONE')}")
        put(f"type:{ctx.get('type', 'MOVIE')}")
        return v
