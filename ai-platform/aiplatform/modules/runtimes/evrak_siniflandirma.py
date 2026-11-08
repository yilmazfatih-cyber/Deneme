"""N28 Evrak Sınıflandırma — belge metninin gömmesini sınıf merkezleriyle (centroid) karşılaştırır.

Sınıflar `data_dir/evrak_siniflar.json`: {"<etiket>": {"centroid": [...], "count": n, "embedder": "..."}}.
`train` örneklerden merkezleri hesaplar (var olan sınıfları günceller); `classify` dosyayı pdf-ayristirma ile
metne çevirir (veya gövdedeki `text`'i kullanır).
"""

from __future__ import annotations

import asyncio
import json

import numpy as np

from ...runtimes.embeddings import default_embedder, embed
from ..base import RunContext, get_runtime, register
from ._common import BaseRuntime, ModuleError, get_settings, note, require

MAX_WORDS = 600  # sınıflandırma için belgenin başı yeterli


def _store_path():
    return get_settings().data_dir / "evrak_siniflar.json"


def load_classes() -> dict:
    p = _store_path()
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def save_classes(data: dict) -> None:
    p = _store_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    tmp.replace(p)


def _head(text: str) -> str:
    return " ".join(text.split()[:MAX_WORDS])


@register("evrak-siniflandirma")
class EvrakSiniflandirma(BaseRuntime):
    requires = ("sentence_transformers",)

    async def _text(self, payload: dict, ctx: RunContext) -> str:
        if payload.get("text"):
            return str(payload["text"])
        parsed = await get_runtime("pdf-ayristirma").run(
            "parse", {k: v for k, v in payload.items() if k == "file"}, ctx
        )
        text = parsed.get("markdown", "")
        if not text.strip():
            raise ModuleError("Belgeden metin çıkarılamadı (taranmış olabilir; önce OCR uygulayın)")
        return text

    async def do_classify(self, payload: dict, ctx: RunContext) -> dict:
        classes = load_classes()
        if not classes:
            raise ModuleError("Tanımlı evrak sınıfı yok; önce 'train' ile örnek belgeler verin")
        text = await self._text(payload, ctx)
        embedder = next(iter(classes.values()))["embedder"]
        v = (await embed([_head(text)], embedder, kind="passage"))[0]
        scores = {}
        for label, c in classes.items():
            cen = np.asarray(c["centroid"], dtype=np.float32)
            scores[label] = float(v @ cen / ((np.linalg.norm(v) * np.linalg.norm(cen)) or 1.0))
        ranked = sorted(scores.items(), key=lambda kv: -kv[1])
        best, best_score = ranked[0]
        margin = best_score - (ranked[1][1] if len(ranked) > 1 else 0.0)
        note(ctx, model=embedder)
        return {
            "label": best,
            "score": round(best_score, 4),
            "margin": round(margin, 4),
            "uncertain": margin < 0.02,
            "scores": {k: round(s, 4) for k, s in ranked},
        }

    async def do_train(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "examples")
        ex = payload["examples"]
        if not isinstance(ex, list) or not all(
            isinstance(e, dict) and e.get("text") and e.get("label") for e in ex
        ):
            raise ModuleError("'examples' {text, label} nesnelerinden oluşan bir liste olmalı")
        classes = {} if payload.get("reset") else load_classes()
        embedder = (
            (next(iter(classes.values()))["embedder"] if classes else None)
            or payload.get("embedder")
            or default_embedder([c.model for c in self.spec.components if c.model])
        )
        vecs = await embed([_head(str(e["text"])) for e in ex], embedder, kind="passage")
        by_label: dict[str, list] = {}
        for e, v in zip(ex, vecs):
            by_label.setdefault(str(e["label"]), []).append(v)
        for label, vs in by_label.items():
            new_sum = np.sum(vs, axis=0)
            old = classes.get(label)
            if old:
                total = np.asarray(old["centroid"]) * old["count"] + new_sum
                count = old["count"] + len(vs)
            else:
                total, count = new_sum, len(vs)
            classes[label] = {"centroid": (total / count).tolist(), "count": int(count), "embedder": embedder}
        await asyncio.to_thread(save_classes, classes)
        note(ctx, model=embedder)
        return {"classes": {k: v["count"] for k, v in classes.items()}, "embedder": embedder}
