"""Analiz katmanı: sahte Anthropic istemcisiyle alıntı eşlemesi ve istek biçimi doğrulanır."""

from __future__ import annotations

from types import SimpleNamespace

from legalai.analysis import Analyzer, build_search_results
from legalai.retrieval import Retriever


class _Stream:
    def __init__(self, msg):
        self._msg = msg

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def get_final_message(self):
        return self._msg


class FakeMessages:
    def __init__(self, response):
        self.response = response
        self.calls: list[dict] = []

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _Stream(self.response)


def _cit(sri: int, text: str):
    return SimpleNamespace(
        type="search_result_location",
        search_result_index=sri,
        cited_text=text,
        start_block_index=1,
        end_block_index=2,
    )


def test_build_search_results_carry_links(db):
    hits = Retriever(db).search("kira artış oranı", k=4)
    blocks = build_search_results(hits)
    assert blocks and all(b["type"] == "search_result" for b in blocks)
    assert all(b["citations"] == {"enabled": True} for b in blocks)
    assert all(b["source"].startswith("https://") for b in blocks)
    assert any("Madde 344" in b["title"] for b in blocks)


def test_analyze_maps_citations_to_links(db):
    retriever = Retriever(db)
    hits = retriever.search("kira artış oranı tüketici fiyat endeksi", k=4)
    fake_response = SimpleNamespace(
        model="claude-opus-5-5",
        stop_reason="end_turn",
        content=[
            SimpleNamespace(
                type="text",
                text="Kira artışı TÜFE oniki aylık ortalamayı aşamaz.",
                citations=[_cit(0, "oniki aylık")],
            ),
            SimpleNamespace(
                type="text",
                text=" Yargıtay bu sınırı aşan artışı bozma sebebi saymıştır.",
                citations=[_cit(1, "BOZULMASINA"), _cit(0, "tekrar")],
            ),
            SimpleNamespace(type="text", text=" Sonuç olarak oran yasal sınırla sınırlıdır.", citations=None),
        ],
        usage=SimpleNamespace(
            input_tokens=1000, output_tokens=200, cache_read_input_tokens=0, cache_creation_input_tokens=900
        ),
    )
    client = SimpleNamespace(messages=FakeMessages(fake_response))
    analyzer = Analyzer(retriever, model="claude-opus-5-5", client=client)

    result = analyzer.analyze("Kira artış oranı en fazla ne olabilir?", k=4, hits=hits)

    call = client.messages.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["output_config"] == {"effort": "high"}
    assert call["system"][0]["cache_control"] == {"type": "ephemeral"}
    user_content = call["messages"][0]["content"]
    assert user_content[-1]["type"] == "text" and "Kira artış oranı" in user_content[-1]["text"]
    assert sum(1 for b in user_content if b["type"] == "search_result") == len(hits)

    assert len(result.citations) == 2  # 0 ve 1; 0'ın tekrarı aynı numarayı alır
    assert [c.index for c in result.citations] == [1, 2]
    assert result.citations[0].url == hits[0].link
    assert result.citations[1].url == hits[1].link
    assert result.segments[1].citation_indexes == [2, 1]
    assert result.segments[2].citation_indexes == []
    assert "## Kaynaklar" in result.answer_markdown
    assert f"({hits[0].link})" in result.answer_markdown
    assert result.usage["input_tokens"] == 1000


def test_analyze_without_hits_does_not_call_model(db):
    client = SimpleNamespace(messages=FakeMessages(None))
    analyzer = Analyzer(Retriever(db), client=client)
    result = analyzer.analyze("xyzqwv olmayan terim 9999", k=4)
    assert client.messages.calls == []
    assert result.citations == [] and "bulunamadı" in result.answer_markdown
