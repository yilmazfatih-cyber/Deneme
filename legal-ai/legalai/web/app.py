"""FastAPI uygulaması.

`create_app(db=None, retriever=None, analyzer=None)` fabrikası; argüman verilmezse
`legalai.config.get_settings()` ile gerçek nesneler kurulur. Çekirdek modüller tembel
içe aktarılır, böylece testlerde sahte (duck-typed) nesnelerle çalışır.
"""

from __future__ import annotations

import logging
from datetime import date
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from legalai.models import AnalysisResult, SearchHit, SourceId

log = logging.getLogger(__name__)

_HERE = Path(__file__).resolve().parent
TEMPLATES_DIR = _HERE / "templates"
STATIC_DIR = _HERE / "static"

SNIPPET_CHARS = 400

SOURCE_NAMES: dict[SourceId, str] = {
    SourceId.RESMI_GAZETE: "Resmî Gazete",
    SourceId.MEVZUAT: "Mevzuat",
    SourceId.YARGITAY: "Yargıtay",
    SourceId.DANISTAY: "Danıştay",
    SourceId.AYM_NORM: "AYM Norm Denetimi",
    SourceId.AYM_BIREYSEL: "AYM Bireysel Başvuru",
    SourceId.UYAP_EMSAL: "UYAP Emsal",
    SourceId.KVKK: "KVKK",
    SourceId.REKABET: "Rekabet Kurulu",
}


# ----------------------------------------------------------------------------- yardımcılar


def source_list() -> list[dict[str, str]]:
    return [{"id": s.value, "name": SOURCE_NAMES.get(s, s.value)} for s in SourceId]


def parse_sources(raw: str | list[str] | None) -> list[SourceId] | None:
    """`"yargitay,danistay"` ya da `["yargitay", "danistay"]` -> SourceId listesi. Boşsa None."""
    if raw is None:
        return None
    if isinstance(raw, str):
        parts = [p.strip() for p in raw.split(",")]
    else:
        parts = []
        for item in raw:
            parts.extend(p.strip() for p in str(item).split(","))
    parts = [p for p in parts if p]
    if not parts:
        return None
    out: list[SourceId] = []
    for p in parts:
        try:
            sid = SourceId(p)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=f"Bilinmeyen kaynak: {p!r}") from exc
        if sid not in out:
            out.append(sid)
    return out


def parse_date(raw: str | date | None, name: str) -> date | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, date):
        return raw
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise HTTPException(
            status_code=422, detail=f"'{name}' tarihi YYYY-AA-GG biçiminde olmalı: {raw!r}"
        ) from exc


def _snippet(text: str, limit: int = SNIPPET_CHARS) -> str:
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # kelime ortasında kesmemeye çalış
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip() + "…"


def hit_to_dict(hit: SearchHit) -> dict[str, Any]:
    doc = hit.document
    chunk = hit.chunk
    return {
        "title": doc.title,
        "url": str(doc.url),
        "link": hit.link,
        "source": doc.source.value,
        "source_name": SOURCE_NAMES.get(doc.source, doc.source.value),
        "heading": chunk.heading,
        "snippet": _snippet(chunk.text),
        "score": hit.score,
        "published_at": doc.published_at.isoformat() if doc.published_at else None,
        "decision_date": doc.decision_date.isoformat() if doc.decision_date else None,
        "court": doc.court,
        "case_no": doc.case_no,
        "decision_no": doc.decision_no,
        "doc_id": doc.doc_id,
        "chunk_id": chunk.chunk_id,
    }


def analysis_to_dict(result: AnalysisResult) -> dict[str, Any]:
    """AnalysisResult -> JSON; `hits` çok büyük olduğu için dışarıda bırakılır."""
    return {
        "question": result.question,
        "answer_markdown": result.answer_markdown,
        "segments": [
            {"text": seg.text, "citation_indexes": list(seg.citation_indexes)} for seg in result.segments
        ],
        "citations": [
            {
                "index": c.index,
                "title": c.title,
                "url": c.url,
                "source": c.source.value,
                "source_name": SOURCE_NAMES.get(c.source, c.source.value),
                "cited_text": c.cited_text,
                "heading": c.heading,
            }
            for c in result.citations
        ],
        "model": result.model,
        "usage": dict(result.usage),
        "disclaimer": result.disclaimer,
    }


def _is_auth_error(exc: BaseException) -> bool:
    try:
        import anthropic
    except ImportError:  # pragma: no cover
        return False
    return isinstance(exc, anthropic.AuthenticationError)


# ----------------------------------------------------------------------------- istek modelleri


class AnalyzeRequest(BaseModel):
    question: str = Field(min_length=1, max_length=4000)
    sources: list[str] | None = None
    since: str | None = None
    until: str | None = None
    k: int = Field(default=12, ge=1, le=50)


# ----------------------------------------------------------------------------- fabrika


def _build_defaults(db: Any, retriever: Any, analyzer: Any) -> tuple[Any, Any, Any]:
    """Verilmeyen bileşenleri ayarlardan kurar. İçe aktarmalar tembel."""
    settings = None
    if db is None or retriever is None or analyzer is None:
        from legalai.config import get_settings

        settings = get_settings()
    if db is None:
        from legalai.db import Database

        db = Database(settings.db_path)
    if retriever is None:
        from legalai.embeddings import make_embedder
        from legalai.retrieval import Retriever

        retriever = Retriever(db, make_embedder(settings.embedder, settings.embed_model))
    if analyzer is None:
        from legalai.analysis import Analyzer

        analyzer = Analyzer(retriever, model=settings.model, effort=settings.effort)
    return db, retriever, analyzer


def create_app(db: Any = None, retriever: Any = None, analyzer: Any = None) -> FastAPI:
    db, retriever, analyzer = _build_defaults(db, retriever, analyzer)

    app = FastAPI(
        title="legalai",
        description="Türkiye hukuk kaynaklarında arama ve kaynak bağlantılı analiz",
        docs_url="/api/docs",
        redoc_url=None,
    )
    app.state.db = db
    app.state.retriever = retriever
    app.state.analyzer = analyzer

    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

    def _stats() -> dict[str, Any]:
        try:
            stats = app.state.db.stats() if app.state.db is not None else {}
        except Exception as exc:  # noqa: BLE001
            log.warning("stats alınamadı: %s", exc)
            stats = {}
        stats = dict(stats or {})
        stats.setdefault("documents", 0)
        stats.setdefault("chunks", 0)
        stats.setdefault("by_source", {})
        stats.setdefault("last_fetched_at", None)
        return stats

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    def index(request: Request) -> HTMLResponse:
        stats = _stats()
        return templates.TemplateResponse(
            request,
            "index.html",
            {
                "stats": stats,
                "sources": source_list(),
                "source_names": {k.value: v for k, v in SOURCE_NAMES.items()},
                "model": getattr(app.state.analyzer, "model", None),
            },
        )

    @app.get("/api/stats")
    def api_stats() -> dict[str, Any]:
        return _stats()

    @app.get("/api/sources")
    def api_sources() -> list[dict[str, str]]:
        return source_list()

    @app.get("/api/search")
    def api_search(
        q: str = Query(min_length=1, max_length=2000),
        sources: str | None = None,
        since: str | None = None,
        until: str | None = None,
        k: int = Query(default=10, ge=1, le=100),
    ) -> dict[str, Any]:
        src = parse_sources(sources)
        d_since = parse_date(since, "since")
        d_until = parse_date(until, "until")
        try:
            hits = app.state.retriever.search(q, sources=src, since=d_since, until=d_until, k=k)
        except Exception as exc:
            log.exception("arama başarısız")
            return JSONResponse(
                status_code=502,
                content={
                    "detail": "Arama sırasında bir hata oluştu. Lütfen tekrar deneyin.",
                    "error": str(exc),
                },
            )
        return {"query": q, "hits": [hit_to_dict(h) for h in hits]}

    @app.post("/api/analyze")
    def api_analyze(body: AnalyzeRequest) -> Any:
        src = parse_sources(body.sources)
        d_since = parse_date(body.since, "since")
        d_until = parse_date(body.until, "until")
        try:
            result = app.state.analyzer.analyze(
                body.question.strip(), sources=src, since=d_since, until=d_until, k=body.k
            )
        except Exception as exc:
            if _is_auth_error(exc):
                log.error("Anthropic kimlik doğrulama hatası")
                return JSONResponse(
                    status_code=502,
                    content={
                        "detail": "Model servisine erişilemedi: API anahtarı geçersiz ya da eksik "
                        "(ANTHROPIC_API_KEY).",
                        "error": "authentication",
                    },
                )
            log.exception("analiz başarısız")
            return JSONResponse(
                status_code=502,
                content={
                    "detail": "Analiz sırasında bir hata oluştu. Lütfen daha sonra tekrar deneyin.",
                    "error": str(exc) or exc.__class__.__name__,
                },
            )
        return analysis_to_dict(result)

    return app


def main() -> None:  # pragma: no cover - `python -m legalai.web.app`
    import uvicorn

    uvicorn.run(create_app(), host="127.0.0.1", port=8000)


if __name__ == "__main__":  # pragma: no cover
    main()
