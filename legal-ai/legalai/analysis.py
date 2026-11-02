"""Kaynak bağlantılı hukuki analiz.

Akış: soru -> hibrit arama -> en iyi parçalar `search_result` blokları olarak Claude'a verilir (her blokta
kaynak URL + başlık) -> `citations` açık olduğu için yanıt metni, alıntıladığı bloğa işaret eden
`search_result_location` alıntıları taşır -> biz bunları numaralı, tıklanabilir `Citation` listesine çeviririz.

Model çıktıya kendi uydurduğu bağlantı koymaz; her bağlantı veritabanındaki gerçek belge adresidir.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

import anthropic

from legalai.config import DEFAULT_MODEL
from legalai.models import AnalysisResult, AnalysisSegment, Citation, SearchHit, SourceId
from legalai.retrieval import Retriever

log = logging.getLogger(__name__)

SYSTEM_PROMPT = """Sen Türkiye hukuku konusunda uzman bir hukuk araştırma asistanısın. Kullanıcı hukukçudur.

Kurallar:
- Yalnızca sana verilen kaynak parçalarına (search_result) dayan. Her hukuki iddiayı ilgili kaynaktan alıntıla.
- Kaynaklarda bulunmayan bir şeyi biliyormuş gibi yazma; kaynak yetersizse bunu açıkça söyle ve hangi kaynağa
  bakılması gerektiğini öner (ör. ilgili kanun maddesi, Yargıtay içtihadı).
- Mevzuat ile yargı kararlarını ayır: önce uygulanacak norm, sonra içtihat, sonra değerlendirme.
- Tarihlere dikkat et: mülga/değişik hükümler ve karar tarihleri önemlidir; kaynaktaki tarihi belirt.
- Çelişen kararlar varsa ikisini de göster ve hangisinin daha yeni/üst mahkeme olduğunu söyle.
- Türkçe, resmî ve açık yaz. Kısa paragraflar ve gerektiğinde madde işaretleri kullan. Başlık kullanabilirsin.
- Hukuki görüş değil, kaynaklara dayalı araştırma notu üretiyorsun; sonuçta kısa bir "Değerlendirme" bölümü ver.
"""

_SOURCE_LABEL = {
    SourceId.RESMI_GAZETE: "Resmî Gazete",
    SourceId.MEVZUAT: "Mevzuat",
    SourceId.YARGITAY: "Yargıtay",
    SourceId.DANISTAY: "Danıştay",
    SourceId.AYM_NORM: "AYM (Norm Denetimi)",
    SourceId.AYM_BIREYSEL: "AYM (Bireysel Başvuru)",
    SourceId.UYAP_EMSAL: "UYAP Emsal",
    SourceId.KVKK: "KVKK Kurulu",
    SourceId.REKABET: "Rekabet Kurulu",
}


def source_label(source: SourceId | str) -> str:
    return _SOURCE_LABEL.get(SourceId(source), str(source))


def hit_title(hit: SearchHit) -> str:
    doc = hit.document
    base = doc.title
    if hit.chunk.heading:
        base = f"{base} — {hit.chunk.heading}"
    return f"[{source_label(doc.source)}] {base}"


def build_search_results(hits: list[SearchHit]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for hit in hits:
        doc = hit.document
        meta_lines = []
        if doc.court:
            meta_lines.append(f"Mahkeme/Kurul: {doc.court}")
        if doc.case_no or doc.decision_no:
            meta_lines.append(f"Esas: {doc.case_no or '-'} Karar: {doc.decision_no or '-'}")
        if doc.decision_date or doc.published_at:
            meta_lines.append(f"Tarih: {(doc.decision_date or doc.published_at).isoformat()}")
        if doc.law_no:
            meta_lines.append(f"Mevzuat No: {doc.law_no}")
        if doc.rg_issue:
            meta_lines.append(f"Resmî Gazete Sayı: {doc.rg_issue}")
        content = [{"type": "text", "text": hit.chunk.text}]
        if meta_lines:
            content.insert(0, {"type": "text", "text": "\n".join(meta_lines)})
        blocks.append(
            {
                "type": "search_result",
                "source": hit.link,
                "title": hit_title(hit),
                "content": content,
                "citations": {"enabled": True},
            }
        )
    return blocks


class Analyzer:
    def __init__(
        self,
        retriever: Retriever,
        model: str = DEFAULT_MODEL,
        client: anthropic.Anthropic | None = None,
        *,
        effort: str = "high",
        max_tokens: int = 16000,
    ) -> None:
        self.retriever = retriever
        self.model = model
        self.effort = effort
        self.max_tokens = max_tokens
        self._client = client

    @property
    def client(self) -> anthropic.Anthropic:
        if self._client is None:
            self._client = anthropic.Anthropic()
        return self._client

    def analyze(
        self,
        question: str,
        *,
        sources: list[SourceId] | None = None,
        since: date | None = None,
        until: date | None = None,
        k: int = 12,
        hits: list[SearchHit] | None = None,
    ) -> AnalysisResult:
        if hits is None:
            hits = self.retriever.search(question, sources=sources, since=since, until=until, k=k)
        if not hits:
            return AnalysisResult(
                question=question,
                answer_markdown="Veritabanında bu soruyla eşleşen kaynak bulunamadı. Önce ilgili kaynakları "
                "`legalai ingest` ile toplayın ya da sorguyu farklı terimlerle yineleyin.",
                segments=[AnalysisSegment(text="Veritabanında bu soruyla eşleşen kaynak bulunamadı.")],
                citations=[],
                hits=[],
                model=self.model,
            )

        user_content: list[dict[str, Any]] = build_search_results(hits)
        user_content.append(
            {
                "type": "text",
                "text": (
                    "Yukarıdaki kaynak parçalarına dayanarak şu soruyu analiz et. Her iddiayı alıntıyla destekle.\n\n"
                    f"Soru: {question}"
                ),
            }
        )

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            "messages": [{"role": "user", "content": user_content}],
            "output_config": {"effort": self.effort},
        }
        if self.model.startswith("claude-fable"):
            # Fable ailesinde güvenlik sınıflandırıcısı reddederse sunucu tarafı yedek model devreye girer.
            response = self.client.beta.messages.create(
                betas=["server-side-fallback-2026-07-01"], fallbacks="default", **kwargs
            )
        else:
            with self.client.messages.stream(**kwargs) as stream:
                response = stream.get_final_message()

        if response.stop_reason == "refusal":
            details = getattr(response, "stop_details", None)
            why = getattr(details, "explanation", None) or "model yanıt vermeyi reddetti"
            return AnalysisResult(
                question=question,
                answer_markdown=f"Analiz üretilemedi: {why}",
                segments=[AnalysisSegment(text=f"Analiz üretilemedi: {why}")],
                citations=[],
                hits=hits,
                model=response.model,
            )

        segments, citations = _parse_response(response, hits)
        usage = {
            "input_tokens": getattr(response.usage, "input_tokens", 0) or 0,
            "output_tokens": getattr(response.usage, "output_tokens", 0) or 0,
            "cache_read_input_tokens": getattr(response.usage, "cache_read_input_tokens", 0) or 0,
            "cache_creation_input_tokens": getattr(response.usage, "cache_creation_input_tokens", 0) or 0,
        }
        return AnalysisResult(
            question=question,
            answer_markdown=render_markdown(segments, citations),
            segments=segments,
            citations=citations,
            hits=hits,
            model=response.model,
            usage=usage,
        )


def _parse_response(response: Any, hits: list[SearchHit]) -> tuple[list[AnalysisSegment], list[Citation]]:
    """Yanıt bloklarını segmentlere, alıntıları numaralı kaynaklara çevirir.

    Aynı parçaya (chunk) yapılan tekrar alıntılar aynı numarayı alır.
    """
    citations: list[Citation] = []
    index_by_chunk: dict[str, int] = {}
    segments: list[AnalysisSegment] = []

    for block in response.content:
        if getattr(block, "type", None) != "text":
            continue
        idxs: list[int] = []
        for cit in getattr(block, "citations", None) or []:
            if getattr(cit, "type", None) != "search_result_location":
                continue
            sri = cit.search_result_index
            if not 0 <= sri < len(hits):
                log.warning("Geçersiz search_result_index %s", sri)
                continue
            hit = hits[sri]
            key = hit.chunk.chunk_id
            if key not in index_by_chunk:
                index_by_chunk[key] = len(citations) + 1
                citations.append(
                    Citation(
                        index=index_by_chunk[key],
                        title=hit_title(hit),
                        url=hit.link,
                        source=hit.document.source,
                        cited_text=cit.cited_text,
                        heading=hit.chunk.heading,
                        doc_id=hit.document.doc_id,
                        chunk_id=key,
                    )
                )
            n = index_by_chunk[key]
            if n not in idxs:
                idxs.append(n)
        segments.append(AnalysisSegment(text=block.text, citation_indexes=idxs))
    return segments, citations


def render_markdown(segments: list[AnalysisSegment], citations: list[Citation]) -> str:
    parts: list[str] = []
    for seg in segments:
        marks = "".join(f"[^{i}]" for i in seg.citation_indexes)
        parts.append(seg.text + marks)
    body = "".join(parts).strip()
    if citations:
        body += "\n\n## Kaynaklar\n"
        for c in citations:
            quote = c.cited_text.strip().replace("\n", " ")
            if len(quote) > 240:
                quote = quote[:237] + "..."
            body += f"\n[^{c.index}]: [{c.title}]({c.url}) — “{quote}”"
    return body
