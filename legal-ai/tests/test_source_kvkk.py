"""KVKK kurul karar özetleri adaptörü — respx ile sahte ağ."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from legalai.models import DocRef, DocType, SourceId
from legalai.sources.base import SourceError
from legalai.sources.kvkk import KvkkSource

FIX = Path(__file__).parent / "fixtures" / "kvkk"
BASE = "https://www.kvkk.gov.tr"
LIST = f"{BASE}/Icerik/5406/Kurul-Karar-Ozetleri"


def _html(name: str) -> httpx.Response:
    return httpx.Response(
        200, text=(FIX / name).read_text(encoding="utf-8"), headers={"content-type": "text/html"}
    )


@pytest.fixture
def src():
    s = KvkkSource()
    s.limiter.min_interval = 0
    return s


def _mock_list(mock):
    mock.get(LIST, params__contains={"page": "2"}).mock(return_value=_html("liste_p2.html"))
    mock.get(LIST).mock(return_value=_html("liste.html"))


async def test_discover_tum_sayfalar(src):
    with respx.mock(assert_all_called=True) as mock:
        _mock_list(mock)
        refs = [r async for r in src.discover()]

    assert [r.external_id for r in refs] == ["7288", "7281", "7275", "7260"]
    first = refs[0]
    assert first.source == SourceId.KVKK
    assert str(first.url) == f"{BASE}/Icerik/7288/2023-4"
    assert first.published_at == date(2023, 1, 5)
    assert first.extra["decision_no"] == "2023/4"
    assert first.title.startswith("“Bir e-ticaret şirketinin")
    # "dd/mm/yyyy tarihli ve YYYY/N sayılı" biçimi de anlaşılır
    assert refs[2].published_at == date(2022, 12, 8)
    assert refs[2].extra["decision_no"] == "2022/1301"
    # menü bağlantıları (Duyurular, listenin kendisi) karar sayılmaz
    assert "2037" not in {r.external_id for r in refs}


async def test_discover_since_erken_durur(src):
    with respx.mock(assert_all_called=False) as mock:
        _mock_list(mock)
        refs = [r async for r in src.discover(since=date(2022, 12, 20))]
        # 1. sayfadaki son karar since'ten eski olsa da sayfadaki tüm kararlar eski değil → 2. sayfa istenir;
        # 2. sayfadaki tek karar eski → orada durur.
        assert mock.calls.call_count == 2
    assert [r.external_id for r in refs] == ["7288", "7281"]


async def test_discover_query_until_limit(src):
    with respx.mock(assert_all_called=False) as mock:
        _mock_list(mock)
        banka = [r async for r in src.discover(query="BANKA")]
        eski = [r async for r in src.discover(until=date(2022, 12, 1), limit=1)]
    assert [r.external_id for r in banka] == ["7281"]
    assert [r.external_id for r in eski] == ["7260"]


async def test_discover_beklenmeyen_sayfa_hata(src):
    with respx.mock() as mock:
        mock.get(LIST).mock(return_value=httpx.Response(200, text="<html><body>Bakımdayız</body></html>"))
        with pytest.raises(SourceError):
            async for _ in src.discover():
                pass


async def test_fetch(src):
    ref = DocRef(source=SourceId.KVKK, external_id="7288", url=f"{BASE}/Icerik/7288/2023-4")
    with respx.mock() as mock:
        mock.get(f"{BASE}/Icerik/7288/2023-4").mock(return_value=_html("karar_7288.html"))
        doc = await src.fetch(ref)

    assert doc.doc_id == "kvkk:7288"
    assert doc.doc_type == DocType.KURUL_KARARI
    assert doc.court == "Kişisel Verileri Koruma Kurulu"
    assert doc.decision_no == "2023/4"
    assert doc.decision_date == date(2023, 1, 5)
    assert doc.published_at == date(2023, 1, 5)
    assert doc.title.startswith("“Bir e-ticaret şirketinin")
    assert "250.000 TL idari para cezası" in doc.text
    assert "Nasuh Akar" not in doc.text  # yalnızca #icerik gövdesi alındı
    assert doc.metadata["content_id"] == "7288"


async def test_fetch_bos_sayfa_hata(src):
    ref = DocRef(source=SourceId.KVKK, external_id="7288", url=f"{BASE}/Icerik/7288/2023-4")
    with respx.mock() as mock:
        mock.get(f"{BASE}/Icerik/7288/2023-4").mock(return_value=httpx.Response(200, text="<html></html>"))
        with pytest.raises(SourceError):
            await src.fetch(ref)
