"""Web arayüzü testleri: sahte (duck-typed) retriever/analyzer ile FastAPI uçları."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from legalai.models import (
    AnalysisResult,
    AnalysisSegment,
    Chunk,
    Citation,
    Document,
    SearchHit,
    SourceId,
    make_chunk_id,
    make_doc_id,
)
from legalai.web import create_app

# ----------------------------------------------------------------------------- sahte nesneler


def _doc(source: SourceId = SourceId.YARGITAY, ext: str = "2023-1234") -> Document:
    return Document(
        doc_id=make_doc_id(source, ext),
        source=source,
        external_id=ext,
        url="https://karararama.yargitay.gov.tr/karar/123",
        title="Yargıtay 9. HD 2023/1234 E. 2023/5678 K.",
        text="Davacı işçinin haklı nedenle fesih iddiası... " * 40,
        published_at=date(2023, 5, 1),
        decision_date=date(2023, 4, 20),
        court="Yargıtay 9. Hukuk Dairesi",
        case_no="2023/1234",
        decision_no="2023/5678",
    )


def _hit(score: float = 0.87) -> SearchHit:
    doc = _doc()
    chunk = Chunk(
        chunk_id=make_chunk_id(doc.doc_id, 3),
        doc_id=doc.doc_id,
        ordinal=3,
        text="Kıdem tazminatı, işçinin haklı nedenle feshinde de ödenir. " * 20,
        heading="Karar gerekçesi",
        anchor="gerekce",
    )
    return SearchHit(chunk=chunk, document=doc, score=score, bm25_rank=1, vector_rank=2)


class FakeDB:
    def stats(self) -> dict:
        return {
            "documents": 1234,
            "chunks": 56789,
            "by_source": {"yargitay": 1000, "mevzuat": 234},
            "last_fetched_at": "2026-11-01T10:00:00",
        }


class FakeRetriever:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    def search(self, query, *, sources=None, since=None, until=None, k=10):
        self.calls.append({"query": query, "sources": sources, "since": since, "until": until, "k": k})
        return [_hit(0.9), _hit(0.5)]


class FakeAnalyzer:
    model = "claude-test"

    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.calls: list[dict] = []

    def analyze(self, question, *, sources=None, since=None, until=None, k=12):
        self.calls.append({"question": question, "sources": sources, "since": since, "until": until, "k": k})
        if self.error is not None:
            raise self.error
        hit = _hit()
        return AnalysisResult(
            question=question,
            answer_markdown="Kıdem tazminatı ödenir [1].",
            segments=[
                AnalysisSegment(
                    text="**Sonuç:** Kıdem tazminatı ödenir.\n\n- madde bir\n- madde iki",
                    citation_indexes=[1],
                ),
                AnalysisSegment(text="Ek açıklama.", citation_indexes=[]),
            ],
            citations=[
                Citation(
                    index=1,
                    title=hit.document.title,
                    url=hit.link,
                    source=hit.document.source,
                    cited_text=hit.chunk.text[:120],
                    heading=hit.chunk.heading,
                    doc_id=hit.document.doc_id,
                    chunk_id=hit.chunk.chunk_id,
                )
            ],
            hits=[hit],
            model=self.model,
            usage={"input_tokens": 1200, "output_tokens": 300},
        )


@pytest.fixture
def retriever() -> FakeRetriever:
    return FakeRetriever()


@pytest.fixture
def analyzer() -> FakeAnalyzer:
    return FakeAnalyzer()


@pytest.fixture
def client(retriever: FakeRetriever, analyzer: FakeAnalyzer) -> TestClient:
    app = create_app(db=FakeDB(), retriever=retriever, analyzer=analyzer)
    return TestClient(app)


# ----------------------------------------------------------------------------- testler


def test_index_renders_html_with_stats(client: TestClient) -> None:
    r = client.get("/")
    assert r.status_code == 200
    assert "text/html" in r.headers["content-type"]
    body = r.text
    assert "legalai" in body
    assert "1.234" in body  # belge sayısı Türkçe binlik ayracıyla
    assert "Analiz et" in body and "Sadece ara" in body
    assert 'value="yargitay"' in body and "AYM Bireysel Başvuru" in body
    assert "hukuki danışmanlık değildir" in body


def test_static_css_served(client: TestClient) -> None:
    r = client.get("/static/app.css")
    assert r.status_code == 200
    assert "text/css" in r.headers["content-type"]


def test_api_stats(client: TestClient) -> None:
    r = client.get("/api/stats")
    assert r.status_code == 200
    data = r.json()
    assert data["documents"] == 1234
    assert data["by_source"]["yargitay"] == 1000
    assert data["last_fetched_at"] == "2026-11-01T10:00:00"


def test_api_sources(client: TestClient) -> None:
    r = client.get("/api/sources")
    assert r.status_code == 200
    data = r.json()
    ids = [s["id"] for s in data]
    assert ids == [s.value for s in SourceId]
    names = {s["id"]: s["name"] for s in data}
    assert names["resmi_gazete"] == "Resmî Gazete"
    assert names["aym_norm"] == "AYM Norm Denetimi"
    assert names["rekabet"] == "Rekabet Kurulu"


def test_api_search_passes_filters_and_shapes_hits(client: TestClient, retriever: FakeRetriever) -> None:
    r = client.get(
        "/api/search",
        params={
            "q": "kıdem tazminatı",
            "sources": "yargitay,danistay",
            "since": "2023-01-01",
            "until": "2023-12-31",
            "k": 5,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["hits"]) == 2

    call = retriever.calls[0]
    assert call["query"] == "kıdem tazminatı"
    assert call["sources"] == [SourceId.YARGITAY, SourceId.DANISTAY]
    assert call["since"] == date(2023, 1, 1)
    assert call["until"] == date(2023, 12, 31)
    assert call["k"] == 5

    hit = data["hits"][0]
    for key in (
        "title",
        "url",
        "link",
        "source",
        "heading",
        "snippet",
        "score",
        "published_at",
        "court",
        "case_no",
        "decision_no",
    ):
        assert key in hit
    assert hit["source"] == "yargitay"
    assert hit["link"].endswith("#gerekce")
    assert hit["court"] == "Yargıtay 9. Hukuk Dairesi"
    assert hit["case_no"] == "2023/1234"
    assert hit["published_at"] == "2023-05-01"
    assert len(hit["snippet"]) <= 401  # ~400 karakter + "…"
    assert hit["snippet"].endswith("…")


def test_api_search_without_filters(client: TestClient, retriever: FakeRetriever) -> None:
    r = client.get("/api/search", params={"q": "fesih"})
    assert r.status_code == 200
    call = retriever.calls[0]
    assert call["sources"] is None and call["since"] is None and call["until"] is None and call["k"] == 10


def test_api_search_rejects_bad_source_and_date(client: TestClient) -> None:
    assert client.get("/api/search", params={"q": "x", "sources": "yok_boyle"}).status_code == 422
    assert client.get("/api/search", params={"q": "x", "since": "01.01.2023"}).status_code == 422
    assert client.get("/api/search").status_code == 422  # q zorunlu


def test_api_analyze_returns_result_without_hits(client: TestClient, analyzer: FakeAnalyzer) -> None:
    r = client.post(
        "/api/analyze",
        json={
            "question": "Kıdem tazminatı hakkı doğar mı?",
            "sources": ["yargitay"],
            "since": "2020-01-01",
            "until": None,
            "k": 7,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert "hits" not in data
    assert data["question"] == "Kıdem tazminatı hakkı doğar mı?"
    assert data["model"] == "claude-test"
    assert data["usage"] == {"input_tokens": 1200, "output_tokens": 300}
    assert "danışmanlık" in data["disclaimer"]
    assert data["segments"][0]["citation_indexes"] == [1]
    assert data["segments"][1]["citation_indexes"] == []
    cit = data["citations"][0]
    assert cit["index"] == 1
    assert cit["source"] == "yargitay"
    assert cit["url"].startswith("https://karararama.yargitay.gov.tr/")
    assert cit["heading"] == "Karar gerekçesi"
    assert set(cit) >= {"index", "title", "url", "source", "cited_text", "heading"}

    call = analyzer.calls[0]
    assert call["sources"] == [SourceId.YARGITAY]
    assert call["since"] == date(2020, 1, 1)
    assert call["until"] is None
    assert call["k"] == 7


def test_api_analyze_validation(client: TestClient) -> None:
    assert client.post("/api/analyze", json={"question": ""}).status_code == 422
    assert client.post("/api/analyze", json={}).status_code == 422
    assert client.post("/api/analyze", json={"question": "x", "k": 0}).status_code == 422


def test_api_analyze_generic_error_returns_502() -> None:
    analyzer = FakeAnalyzer(error=RuntimeError("model patladı"))
    app = create_app(db=FakeDB(), retriever=FakeRetriever(), analyzer=analyzer)
    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/api/analyze", json={"question": "soru"})
    assert r.status_code == 502
    data = r.json()
    assert "hata" in data["detail"].lower()
    assert data["error"] == "model patladı"


def test_api_analyze_auth_error_returns_502_with_key_hint() -> None:
    anthropic = pytest.importorskip("anthropic")
    import httpx

    resp = httpx.Response(401, request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    err = anthropic.AuthenticationError("invalid x-api-key", response=resp, body=None)
    app = create_app(db=FakeDB(), retriever=FakeRetriever(), analyzer=FakeAnalyzer(error=err))
    client = TestClient(app, raise_server_exceptions=False)
    r = client.post("/api/analyze", json={"question": "soru"})
    assert r.status_code == 502
    data = r.json()
    assert data["error"] == "authentication"
    assert "ANTHROPIC_API_KEY" in data["detail"]


def test_api_search_error_returns_502() -> None:
    class BrokenRetriever:
        def search(self, *a, **k):
            raise ValueError("indeks yok")

    app = create_app(db=FakeDB(), retriever=BrokenRetriever(), analyzer=FakeAnalyzer())
    client = TestClient(app, raise_server_exceptions=False)
    r = client.get("/api/search", params={"q": "x"})
    assert r.status_code == 502
    assert "Arama" in r.json()["detail"]


def test_index_survives_broken_stats() -> None:
    class BrokenDB:
        def stats(self):
            raise OSError("db kilitli")

    app = create_app(db=BrokenDB(), retriever=FakeRetriever(), analyzer=FakeAnalyzer())
    client = TestClient(app)
    assert client.get("/").status_code == 200
    assert client.get("/api/stats").json()["documents"] == 0
