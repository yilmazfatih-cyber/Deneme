"""Hibrit arama: FTS5 BM25 + (varsa) vektör benzerliği, Reciprocal Rank Fusion ile birleştirilir.

Belge çeşitliliği: aynı belgeden en fazla `per_doc` parça döner ki tek uzun kanun tüm sonuçları doldurmasın.
"""

from __future__ import annotations

from datetime import date

from legalai.db import Database
from legalai.embeddings import Embedder, cosine
from legalai.models import SearchHit, SourceId


class Retriever:
    def __init__(
        self, db: Database, embedder: Embedder | None = None, *, rrf_k: int = 60, per_doc: int = 3
    ) -> None:
        self.db = db
        self.embedder = embedder
        self.rrf_k = rrf_k
        self.per_doc = per_doc

    def search(
        self,
        query: str,
        *,
        sources: list[SourceId] | None = None,
        since: date | None = None,
        until: date | None = None,
        k: int = 10,
    ) -> list[SearchHit]:
        candidates = max(k * 5, 40)
        bm25 = self.db.fts_search(query, sources=sources, since=since, until=until, limit=candidates)
        bm25_rank = {cid: i + 1 for i, (cid, _) in enumerate(bm25)}

        vec_rank: dict[str, int] = {}
        if self.embedder is not None and self.db.embedding_count(self.embedder.model_name) > 0:
            qv = self.embedder.embed_query(query)
            scored = [
                (cid, cosine(qv, vec))
                for cid, vec in self.db.iter_embeddings(
                    self.embedder.model_name, sources=sources, since=since, until=until
                )
            ]
            scored.sort(key=lambda t: t[1], reverse=True)
            vec_rank = {cid: i + 1 for i, (cid, _) in enumerate(scored[:candidates])}

        fused: dict[str, float] = {}
        for cid, r in bm25_rank.items():
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (self.rrf_k + r)
        for cid, r in vec_rank.items():
            fused[cid] = fused.get(cid, 0.0) + 1.0 / (self.rrf_k + r)
        if not fused:
            return []

        ordered = sorted(fused.items(), key=lambda t: t[1], reverse=True)
        chunks = self.db.get_chunks([cid for cid, _ in ordered])
        docs = self.db.get_documents(c.doc_id for c in chunks.values())

        hits: list[SearchHit] = []
        per_doc_count: dict[str, int] = {}
        for cid, score in ordered:
            chunk = chunks.get(cid)
            if chunk is None:
                continue
            doc = docs.get(chunk.doc_id)
            if doc is None:
                continue
            n = per_doc_count.get(doc.doc_id, 0)
            if n >= self.per_doc:
                continue
            per_doc_count[doc.doc_id] = n + 1
            hits.append(
                SearchHit(
                    chunk=chunk,
                    document=doc,
                    score=score,
                    bm25_rank=bm25_rank.get(cid),
                    vector_rank=vec_rank.get(cid),
                )
            )
            if len(hits) >= k:
                break
        return hits
