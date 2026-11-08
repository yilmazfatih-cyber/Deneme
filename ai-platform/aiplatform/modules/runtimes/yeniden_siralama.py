"""N10 Yeniden Sıralama — CrossEncoder (bge-reranker-v2-m3) ile aday metinleri soruya göre sıralar."""

from __future__ import annotations

import asyncio

from ...runtimes import model_dir
from ...runtimes.lazy import LazyRegistry
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, model_not_installed, not_ready, note, require

RERANKER = "bge-reranker-v2-m3"
_MODELS = LazyRegistry()


def reranker_ready() -> bool:
    import importlib.util

    return importlib.util.find_spec("sentence_transformers") is not None and model_dir(RERANKER) is not None


def rerank_scores(query: str, texts: list[str]) -> list[float]:
    try:
        from sentence_transformers import CrossEncoder
    except ImportError as e:
        raise not_ready("sentence-transformers", "yeniden-siralama") from e
    path = model_dir(RERANKER)
    if path is None:
        raise model_not_installed(RERANKER, "yeniden-siralama")
    model = _MODELS.get(str(path), lambda: CrossEncoder(str(path), max_length=512))
    return [float(s) for s in model.predict([(query, t) for t in texts])]


@register("yeniden-siralama")
class YenidenSiralama(BaseRuntime):
    requires = ("sentence_transformers",)

    async def do_rerank(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "query", "candidates")
        cands = payload["candidates"]
        if not isinstance(cands, list):
            raise ModuleError("'candidates' liste olmalı")
        texts = [c if isinstance(c, str) else str((c or {}).get("text", "")) for c in cands]
        scores = await asyncio.to_thread(rerank_scores, str(payload["query"]), texts)
        order = sorted(range(len(cands)), key=lambda i: -scores[i])
        top_k = int(payload.get("top_k") or len(cands))
        note(ctx, model=RERANKER)
        return {
            "results": [
                {"index": i, "score": round(scores[i], 4), "candidate": cands[i]} for i in order[:top_k]
            ]
        }
