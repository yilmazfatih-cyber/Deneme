"""Uçtan uca: gerçek Database + Retriever + web uygulaması, yalnızca Claude sahte.

Soru -> arama -> search_result blokları -> (sahte) model -> numaralı, bağlantılı alıntılar -> JSON API.
"""

from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from legalai.analysis import Analyzer
from legalai.retrieval import Retriever
from legalai.web.app import create_app


class _EchoMessages:
    """Modele giden search_result bloklarını okuyup ilk ikisine atıf yapan sahte yanıt üretir."""

    def stream(self, **kwargs):
        blocks = [b for b in kwargs["messages"][0]["content"] if b["type"] == "search_result"]
        cits = [
            SimpleNamespace(
                type="search_result_location",
                search_result_index=i,
                cited_text=blocks[i]["content"][-1]["text"][:60],
                start_block_index=0,
                end_block_index=1,
            )
            for i in range(min(2, len(blocks)))
        ]
        msg = SimpleNamespace(
            model="claude-opus-5-5",
            stop_reason="end_turn",
            content=[
                SimpleNamespace(
                    type="text",
                    text="## Uygulanacak norm\n\nKira artışı TÜFE ile sınırlıdır.",
                    citations=cits[:1],
                ),
                SimpleNamespace(
                    type="text",
                    text="\n\n## İçtihat\n\nYargıtay sınırı aşan artışı bozmuştur.",
                    citations=cits[1:],
                ),
            ],
            usage=SimpleNamespace(
                input_tokens=10, output_tokens=5, cache_read_input_tokens=0, cache_creation_input_tokens=0
            ),
        )
        outer = self

        class _S:
            def __enter__(self_inner):
                return self_inner

            def __exit__(self_inner, *a):
                return False

            def get_final_message(self_inner):
                return msg

        del outer
        return _S()


def test_full_flow_through_http(db):
    retriever = Retriever(db)
    analyzer = Analyzer(retriever, client=SimpleNamespace(messages=_EchoMessages()))
    client = TestClient(create_app(db=db, retriever=retriever, analyzer=analyzer))

    r = client.get("/api/search", params={"q": "kira artış oranı", "sources": "mevzuat"})
    assert r.status_code == 200
    hits = r.json()["hits"]
    assert hits and all(h["source"] == "mevzuat" for h in hits)
    assert all(h["link"].startswith("https://www.mevzuat.gov.tr/") for h in hits)

    r = client.post(
        "/api/analyze", json={"question": "Kira artış oranı tüketici fiyat endeksi sınırı nedir?", "k": 6}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert len(data["citations"]) == 2
    urls = {c["url"] for c in data["citations"]}
    assert any("mevzuat.gov.tr" in u for u in urls) and any("yargitay.gov.tr" in u for u in urls)
    assert data["segments"][0]["citation_indexes"] == [1]
    assert data["segments"][1]["citation_indexes"] == [2]
    assert "hits" not in data
    assert "danışmanlık" in data["disclaimer"]

    page = client.get("/")
    assert page.status_code == 200 and "Resmî Gazete" in page.text
