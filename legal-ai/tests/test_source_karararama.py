"""Yargıtay / Danıştay / UYAP Emsal adaptörleri için `respx` ile uçtan uca testler.

Her kaynak için: oturum çerezi GET'i, iki sayfalı `aramalist` (sayfalama + limit) ve `getDokuman`
sahteleştirilir; `discover` ve `fetch` sonuçları (başlık, tarih, url, metin) doğrulanır.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import pytest
import respx

from legalai.models import DocType, SourceId
from legalai.sources.base import SourceError
from legalai.sources.danistay import DanistaySource
from legalai.sources.registry import get_source
from legalai.sources.uyap_emsal import UyapEmsalSource
from legalai.sources.yargitay import YargitaySource

FIXTURES = Path(__file__).parent / "fixtures" / "karararama"


def load(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


# Kaynak başına: sınıf, fixture ön eki, beklenen ilk sonuç değerleri.
CASES = {
    "yargitay": {
        "cls": YargitaySource,
        "prefix": "yargitay",
        "query": "kıdem tazminatı",
        "first_id": "Y1001",
        "court": "Yargıtay 9. Hukuk Dairesi",
        "case_no": "2023/1234",
        "decision_no": "2023/5678",
        "decision_date": date(2023, 5, 12),
        "ids": ["Y1001", "Y1002", "Y1003"],
        "sentence": "Davacı, kıdem tazminatının ödenmesini talep etmiştir.",
        "second_court": "Yargıtay Hukuk Genel Kurulu",
    },
    "danistay": {
        "cls": DanistaySource,
        "prefix": "danistay",
        "query": "imar planı",
        "first_id": "D2001",
        "court": "Danıştay 10. Daire",
        "case_no": "2021/4455",
        "decision_no": "2023/1122",
        "decision_date": date(2023, 3, 20),
        "ids": ["D2001", "D2002", "D2003"],
        "sentence": "İmar planı değişikliğine ilişkin belediye meclisi kararının iptali",
        "second_court": "Danıştay İdari Dava Daireleri Kurulu",
    },
    "uyap_emsal": {
        "cls": UyapEmsalSource,
        "prefix": "uyap",
        "query": "kira tespiti",
        "first_id": "U3001",
        "court": "İstanbul Bölge Adliye Mahkemesi 12. Hukuk Dairesi",
        "case_no": "2022/1500",
        "decision_no": "2023/700",
        "decision_date": date(2023, 6, 30),
        "ids": ["U3001", "U3002", "U3003"],
        "sentence": "kira bedelinin aylık net 15.000 TL olarak tespitine",
        "second_court": "Ankara 3. Sulh Hukuk Mahkemesi",
    },
}


def make_source(case: dict[str, Any]):
    """Hız sınırlayıcıyı sıfırlayıp sayfa boyutunu 2'ye çeker (2 sayfa test edilebilsin)."""
    src = case["cls"](http=httpx.AsyncClient())
    src.limiter.min_interval = 0
    src.page_size = 2
    return src


def mock_site(router: respx.MockRouter, case: dict[str, Any]) -> dict[str, Any]:
    """Ana sayfa, iki sayfalı arama ve belge uçlarını sahteleştirir; çağrı kayıtlarını döndürür."""
    base = case["cls"].base_url
    prefix = case["prefix"]
    bodies: list[dict[str, Any]] = []

    router.get(f"{base}/").mock(
        return_value=httpx.Response(
            200, text="<html>ana sayfa</html>", headers={"Set-Cookie": "JSESSIONID=abc"}
        )
    )

    def search(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        page = body["data"]["pageNumber"]
        if page == 1:
            return httpx.Response(200, json=load(f"{prefix}_aramalist_p1.json"))
        if page == 2:
            return httpx.Response(200, json=load(f"{prefix}_aramalist_p2.json"))
        return httpx.Response(
            200, json={"data": {"data": [], "recordsTotal": 3}, "metadata": {"FMTY": "SUCCESS"}}
        )

    search_route = router.post(f"{base}/aramalist").mock(side_effect=search)
    doc_route = router.get(url__regex=rf"{base}/getDokuman\?id=.*").mock(
        return_value=httpx.Response(200, json=load(f"{prefix}_getDokuman.json"))
    )
    return {"bodies": bodies, "search": search_route, "doc": doc_route}


@pytest.mark.parametrize("name", list(CASES))
@respx.mock
async def test_discover_paginates_and_builds_refs(name: str) -> None:
    case = CASES[name]
    calls = mock_site(respx.mock, case)
    src = make_source(case)

    refs = [ref async for ref in src.discover(query=case["query"])]

    assert [r.external_id for r in refs] == case["ids"]
    assert calls["search"].call_count == 2  # recordsTotal=3, pageSize=2 -> 2 sayfa
    assert all(b["data"]["arananKelime"] == case["query"] for b in calls["bodies"])
    assert [b["data"]["pageNumber"] for b in calls["bodies"]] == [1, 2]
    assert all(b["data"]["pageSize"] == 2 for b in calls["bodies"])

    first = refs[0]
    assert first.source == SourceId(name)
    assert str(first.url) == f"{case['cls'].base_url}/getDokuman?id={case['first_id']}"
    assert first.published_at == case["decision_date"]
    assert first.extra["court"] == case["court"]
    assert first.extra["case_no"] == case["case_no"]
    assert first.extra["decision_no"] == case["decision_no"]
    assert first.title == (
        f"{case['court']} E. {case['case_no']} K. {case['decision_no']} "
        f"T. {case['decision_date'].strftime('%d.%m.%Y')}"
    )
    assert refs[1].extra["court"] == case["second_court"]
    await src.aclose()


@pytest.mark.parametrize("name", list(CASES))
@respx.mock
async def test_discover_limit_stops_early(name: str) -> None:
    case = CASES[name]
    calls = mock_site(respx.mock, case)
    src = make_source(case)

    refs = [ref async for ref in src.discover(query=case["query"], limit=1)]

    assert [r.external_id for r in refs] == case["ids"][:1]
    assert calls["search"].call_count == 1  # ikinci sayfa hiç istenmez
    await src.aclose()


@pytest.mark.parametrize("name", list(CASES))
@respx.mock
async def test_discover_passes_date_range(name: str) -> None:
    case = CASES[name]
    calls = mock_site(respx.mock, case)
    src = make_source(case)

    [ref async for ref in src.discover(since=date(2023, 1, 1), until=date(2023, 12, 31), query=case["query"])]

    body = calls["bodies"][0]["data"]
    assert body["baslangicTarihi"] == "01.01.2023"
    assert body["bitisTarihi"] == "31.12.2023"
    await src.aclose()


@pytest.mark.parametrize("name", list(CASES))
async def test_discover_requires_query(name: str) -> None:
    src = make_source(CASES[name])
    with pytest.raises(SourceError, match="arama terimi gerekir"):
        async for _ in src.discover():
            pass
    await src.aclose()


@pytest.mark.parametrize("name", list(CASES))
@respx.mock
async def test_fetch_builds_document(name: str) -> None:
    case = CASES[name]
    calls = mock_site(respx.mock, case)
    src = make_source(case)

    refs = [ref async for ref in src.discover(query=case["query"], limit=1)]
    doc = await src.fetch(refs[0])

    assert calls["doc"].call_count == 1
    assert doc.doc_id == f"{name}:{case['first_id']}"
    assert doc.source == SourceId(name)
    assert doc.doc_type == DocType.MAHKEME_KARARI
    assert doc.court == case["court"]
    assert doc.case_no == case["case_no"]
    assert doc.decision_no == case["decision_no"]
    assert doc.decision_date == case["decision_date"]
    assert doc.published_at == case["decision_date"]
    assert doc.title == refs[0].title
    assert str(doc.url) == f"{case['cls'].base_url}/getDokuman?id={case['first_id']}"
    assert case["sentence"] in doc.text
    assert "<p>" not in doc.text and "console.log" not in doc.text
    assert doc.content_hash
    await src.aclose()


@respx.mock
async def test_session_cookie_fetched_once() -> None:
    case = CASES["yargitay"]
    mock_site(respx.mock, case)
    src = make_source(case)
    home = respx.mock.get(f"{case['cls'].base_url}/")

    refs = [ref async for ref in src.discover(query=case["query"])]
    await src.fetch(refs[0])

    assert home.call_count == 1
    await src.aclose()


@respx.mock
async def test_api_error_metadata_raises_source_error() -> None:
    case = CASES["danistay"]
    base = case["cls"].base_url
    respx.mock.get(f"{base}/").mock(return_value=httpx.Response(200, text="ok"))
    respx.mock.post(f"{base}/aramalist").mock(
        return_value=httpx.Response(200, json=load("aramalist_error.json"))
    )
    src = make_source(case)
    with pytest.raises(SourceError, match="Arama kriteri hatalı"):
        async for _ in src.discover(query="x"):
            pass
    await src.aclose()


@respx.mock
async def test_unexpected_search_shape_raises_source_error() -> None:
    case = CASES["uyap_emsal"]
    base = case["cls"].base_url
    respx.mock.get(f"{base}/").mock(return_value=httpx.Response(200, text="ok"))
    respx.mock.post(f"{base}/aramalist").mock(return_value=httpx.Response(200, json={"foo": "bar"}))
    src = make_source(case)
    with pytest.raises(SourceError, match="sonuç listesi bulunamadı"):
        async for _ in src.discover(query="x"):
            pass
    await src.aclose()


@respx.mock
async def test_fetch_fills_missing_meta_from_html() -> None:
    """Keşif metası eksikse belge metnindeki Esas/Karar/Tarih satırlarından tamamlanır."""
    case = CASES["danistay"]
    base = case["cls"].base_url
    respx.mock.get(f"{base}/").mock(return_value=httpx.Response(200, text="ok"))
    respx.mock.get(url__regex=rf"{base}/getDokuman\?id=.*").mock(
        return_value=httpx.Response(200, json=load("danistay_getDokuman.json"))
    )
    src = make_source(case)
    from legalai.models import DocRef

    ref = DocRef(source=SourceId.DANISTAY, external_id="D2001", url=f"{base}/getDokuman?id=D2001")
    doc = await src.fetch(ref)
    assert doc.case_no == "2021/4455"
    assert doc.decision_no == "2023/1122"
    assert doc.decision_date == date(2023, 3, 20)
    assert doc.court == "Danıştay"
    await src.aclose()


def test_registry_resolves_classes() -> None:
    assert isinstance(get_source("yargitay"), YargitaySource)
    assert isinstance(get_source("danistay"), DanistaySource)
    assert isinstance(get_source("uyap_emsal"), UyapEmsalSource)
