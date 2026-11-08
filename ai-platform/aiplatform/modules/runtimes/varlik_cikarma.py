"""N13 Varlık Çıkarma — GLiNER (multi v2.1) ile serbest etiketli varlık tanıma (kişi, kurum, ürün, tutar...)."""

from __future__ import annotations

import asyncio
import re

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import (
    BaseRuntime,
    ModuleError,
    RunContext,
    has_package,
    model_not_installed,
    not_ready,
    note,
    require,
)

NER_MODEL = "gliner-multi-v2.1"
WINDOW_WORDS = 250
_MODELS = LazyRegistry()


def windows(text: str, size: int = WINDOW_WORDS, overlap: int = 30) -> list[tuple[int, str]]:
    """(başlangıç_karakteri, parça) — GLiNER'ın ~384 belirteç sınırı için."""
    spans = [m.span() for m in re.finditer(r"\S+", text)]
    if not spans:
        return []
    out = []
    step = max(1, size - overlap)
    for i in range(0, len(spans), step):
        part = spans[i : i + size]
        out.append((part[0][0], text[part[0][0] : part[-1][1]]))
        if i + size >= len(spans):
            break
    return out


def gliner_extract(
    text: str, labels: list[str], threshold: float
) -> list[dict]:  # pragma: no cover - gliner yok
    from gliner import GLiNER

    path = model_dir(NER_MODEL)
    model = _MODELS.get(str(path), lambda: GLiNER.from_pretrained(str(path), local_files_only=True))
    seen, out = set(), []
    for offset, part in windows(text):
        for e in model.predict_entities(part, labels, threshold=threshold):
            start, end = offset + int(e["start"]), offset + int(e["end"])
            key = (start, end, e["label"])
            if key in seen:
                continue
            seen.add(key)
            out.append(
                {
                    "text": text[start:end],
                    "label": e["label"],
                    "start": start,
                    "end": end,
                    "score": round(float(e.get("score", 0.0)), 4),
                }
            )
    return sorted(out, key=lambda x: x["start"])


@register("varlik-cikarma")
class VarlikCikarma(BaseRuntime):
    requires = ("gliner",)

    async def do_extract(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "text", "labels")
        labels = [str(x) for x in payload["labels"]]
        if not labels or len(labels) > 30:
            raise ModuleError("1-30 arası etiket verin")
        if not has_package("gliner"):
            raise not_ready("gliner", "varlik-cikarma")
        if model_dir(NER_MODEL) is None:
            raise model_not_installed(NER_MODEL, "varlik-cikarma")
        ents = await asyncio.to_thread(
            gliner_extract, str(payload["text"]), labels, float(payload.get("threshold", 0.5))
        )
        note(ctx, model=NER_MODEL)
        return {"entities": ents}
