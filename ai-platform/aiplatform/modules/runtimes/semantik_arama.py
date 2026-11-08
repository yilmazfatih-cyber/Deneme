"""N09 Semantik Arama — belgeleri parçalayıp gömer (`index`) ve anlamsal arama yapar (`search`).

Gömme modeli sırası: bge-m3 (sunucu) → turkish-e5-large → multilingual-e5-small (istemci). Bir koleksiyon hangi
modelle dizinlendiyse sorgu da aynı modelle gömülür.
"""

from __future__ import annotations

from ...runtimes.embeddings import VectorStore, chunk_text, default_embedder, embed
from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, note, require


def _docs(raw) -> list[dict]:
    if not isinstance(raw, list) or not raw:
        raise ModuleError("'documents' boş olmayan bir liste olmalı")
    out = []
    for i, d in enumerate(raw):
        if isinstance(d, str):
            out.append({"id": str(i), "text": d, "meta": {}})
        elif isinstance(d, dict) and d.get("text"):
            out.append(
                {
                    "id": str(d.get("id", i)),
                    "text": str(d["text"]),
                    "meta": {k: v for k, v in d.items() if k not in ("id", "text")},
                }
            )
        else:
            raise ModuleError(f"documents[{i}]: metin ya da {{id, text}} nesnesi olmalı")
    return out


async def search_collection(
    collection: str, query: str, top_k: int, ctx: RunContext | None = None
) -> list[dict]:
    store = VectorStore()
    model_id = store.collection_model(collection)
    if model_id is None:
        return []
    qv = await embed([query], model_id, kind="query")
    if ctx is not None:
        note(ctx, embedder=model_id)
    return store.search(collection, qv[0], top_k)


@register("semantik-arama")
class SemantikArama(BaseRuntime):
    requires = ("sentence_transformers",)

    async def do_index(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "collection", "documents")
        collection = str(payload["collection"])
        docs = _docs(payload["documents"])
        store = VectorStore()
        model_id = (
            payload.get("model_id")
            or store.collection_model(collection)
            or default_embedder([c.model for c in self.spec.components if c.model])
        )
        max_tokens = int(payload.get("chunk_tokens", 400))
        items = []
        for d in docs:
            if payload.get("replace", True):
                store.delete_document(collection, d["id"])
            for ci, chunk in enumerate(chunk_text(d["text"], max_tokens, int(payload.get("overlap", 50)))):
                items.append({"doc_id": d["id"], "chunk_id": ci, "text": chunk, "meta": d["meta"]})
        if not items:
            raise ModuleError("Dizinlenecek metin bulunamadı")
        vecs = await embed([it["text"] for it in items], model_id, kind="passage")
        for it, v in zip(items, vecs):
            it["vector"] = v
        n = store.add(collection, items, model_id)
        note(ctx, model=model_id)
        return {"collection": collection, "documents": len(docs), "chunks": n, "model_id": model_id}

    async def do_search(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "collection", "query")
        hits = await search_collection(
            str(payload["collection"]), str(payload["query"]), int(payload.get("top_k") or 5), ctx
        )
        return {"hits": hits}
