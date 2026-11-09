"""N23 Bilgi Asistanı (RAG) — vektör arama → (kuruluysa) yeniden sıralama → kaynaklı LLM yanıtı."""

from __future__ import annotations

import asyncio

from ..base import register
from ._common import BaseRuntime, RunContext, module_available, note, require
from .semantik_arama import search_collection
from .yeniden_siralama import RERANKER, rerank_scores, reranker_ready

NOT_FOUND = "Bu konuda kaynaklarda bilgi bulamadım"
MIN_SCORE = 0.25  # kosinüs benzerliği altı "ilgisiz" sayılır
SCHEMA = {
    "type": "object",
    "required": ["answer", "citations", "confidence"],
    "properties": {
        "answer": {"type": "string"},
        "citations": {"type": "array", "items": {"type": "integer"}},
        "confidence": {"type": "string", "enum": ["yüksek", "orta", "düşük"]},
    },
}


@register("bilgi-asistani")
class BilgiAsistani(BaseRuntime):
    uses_llm = True
    requires = ("sentence_transformers",)

    async def do_ask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "collection", "question")
        question = str(payload["question"])
        top_k = int(payload.get("top_k") or 5)
        use_rerank = reranker_ready() and module_available("yeniden-siralama", RERANKER)
        hits = await search_collection(
            str(payload["collection"]), question, top_k * 4 if use_rerank else top_k, ctx
        )
        hits = [h for h in hits if h["score"] >= MIN_SCORE]
        if use_rerank and hits:
            scores = await asyncio.to_thread(rerank_scores, question, [h["text"] for h in hits])
            for h, s in zip(hits, scores):
                h["rerank_score"] = round(s, 4)
            hits.sort(key=lambda h: -h["rerank_score"])
            note(ctx, reranker=RERANKER)
        hits = hits[:top_k]
        if not hits:
            return {"answer": NOT_FOUND, "citations": [], "confidence": "düşük"}

        sources = "\n\n".join(f"[{i}] (belge: {h['doc_id']})\n{h['text']}" for i, h in enumerate(hits, 1))
        res = await self.llm_prompt(
            ctx,
            "bilgi_asistani",
            f"KAYNAKLAR:\n{sources}\n\nSORU: {question}",
            schema=SCHEMA,
            temperature=0.0,
        )
        p = res.parsed
        cited = []
        for n in p.get("citations") or []:
            try:
                idx = int(n)
            except (TypeError, ValueError):
                continue
            if 1 <= idx <= len(hits) and idx not in [c["n"] for c in cited]:
                h = hits[idx - 1]
                cited.append(
                    {
                        "n": idx,
                        "doc_id": h["doc_id"],
                        "chunk_id": h["chunk_id"],
                        "score": h["score"],
                        "snippet": h["text"][:300],
                        "meta": h.get("meta", {}),
                    }
                )
        answer = str(p.get("answer", "")).strip() or NOT_FOUND
        conf = p.get("confidence") if p.get("confidence") in ("yüksek", "orta", "düşük") else "orta"
        if NOT_FOUND.lower() in answer.lower():
            cited, conf = [], "düşük"
        return {"answer": answer, "citations": cited, "confidence": conf}
