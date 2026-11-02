"""AYM norm denetimi ve bireysel başvuru adaptörleri — respx ile sahte ağ."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from legalai.models import DocRef, DocType, SourceId
from legalai.sources.aym import AymBireyselSource, AymNormSource
from legalai.sources.base import SourceError

FIX = Path(__file__).parent / "fixtures" / "aym"
ND = "https://normkararlarbilgibankasi.anayasa.gov.tr"
BB = "https://kararlarbilgibankasi.anayasa.gov.tr"


def _html(name: str) -> httpx.Response:
    return httpx.Response(
        200, text=(FIX / name).read_text(encoding="utf-8"), headers={"content-type": "text/html"}
    )


def _fast(src):
    src.limiter.min_interval = 0
    return src


@pytest.fixture
def norm():
    return _fast(AymNormSource())


@pytest.fixture
def bireysel():
    return _fast(AymBireyselSource())


# ---- norm denetimi ---------------------------------------------------------------------------


async def test_norm_discover_sayfalar_ve_meta(norm):
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{ND}/Ara", params__contains={"KelimeAra[]": "mülkiyet hakkı", "page": "1"}).mock(
            return_value=_html("nd_search.html")
        )
        mock.get(f"{ND}/Ara", params__contains={"KelimeAra[]": "mülkiyet hakkı", "page": "2"}).mock(
            return_value=_html("nd_search_p2.html")
        )
        refs = [r async for r in norm.discover(query="mülkiyet hakkı")]

    assert [r.external_id for r in refs] == ["ND/2023/1", "ND/2022/150", "ND/2020/33"]
    first = refs[0]
    assert first.source == SourceId.AYM_NORM
    assert str(first.url) == f"{ND}/ND/2023/1"
    assert first.published_at == date(2023, 3, 15)
    assert first.extra == {"case_no": "2022/123", "decision_no": "2023/45"}
    assert "Kişisel Verilerin Korunması" in (first.title or "")
    assert refs[1].published_at == date(2022, 12, 1)


async def test_norm_discover_limit_ve_tarih_suzgeci(norm):
    with respx.mock() as mock:
        mock.get(f"{ND}/Ara", params__contains={"page": "1"}).mock(return_value=_html("nd_search.html"))
        mock.get(f"{ND}/Ara", params__contains={"page": "2"}).mock(return_value=_html("nd_search_p2.html"))
        limited = [r async for r in norm.discover(query="mülkiyet hakkı", limit=1)]
        eski = [r async for r in norm.discover(query="mülkiyet hakkı", until=date(2021, 1, 1))]
    assert [r.external_id for r in limited] == ["ND/2023/1"]
    assert [r.external_id for r in eski] == ["ND/2020/33"]


async def test_norm_discover_dogrudan_kimlik_aga_cikmaz(norm):
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(url__regex=r".*").mock(return_value=httpx.Response(500))
        refs = [r async for r in norm.discover(query="ND/2023/1")]
    assert not route.called
    assert len(refs) == 1
    assert refs[0].external_id == "ND/2023/1"
    assert str(refs[0].url) == f"{ND}/ND/2023/1"


async def test_norm_discover_query_zorunlu(norm):
    with pytest.raises(SourceError):
        async for _ in norm.discover():
            pass


async def test_norm_discover_beklenmeyen_sayfa_hata(norm):
    with respx.mock() as mock:
        mock.get(f"{ND}/Ara").mock(return_value=httpx.Response(200, text="<html><body>Bakım</body></html>"))
        with pytest.raises(SourceError):
            async for _ in norm.discover(query="mülkiyet"):
                pass


async def test_norm_fetch(norm):
    ref = DocRef(source=SourceId.AYM_NORM, external_id="ND/2023/1", url=f"{ND}/ND/2023/1")
    with respx.mock() as mock:
        mock.get(f"{ND}/ND/2023/1").mock(return_value=_html("nd_2023_1.html"))
        doc = await norm.fetch(ref)

    assert doc.doc_id == "aym_norm:ND/2023/1"
    assert doc.doc_type == DocType.MAHKEME_KARARI
    assert doc.court == "Anayasa Mahkemesi"
    assert doc.title.startswith("6698 sayılı Kişisel Verilerin Korunması Kanunu")
    assert doc.case_no == "2022/123"
    assert doc.decision_no == "2023/45"
    assert doc.decision_date == date(2023, 3, 15)
    assert doc.rg_issue == "32227"
    assert doc.metadata["rg_date"] == date(2023, 6, 20)
    assert doc.metadata["rg_issue"] == "32227"
    assert doc.metadata["chamber"] == "Genel Kurul"
    assert doc.published_at == date(2023, 6, 20)
    assert "Kuralın Anayasa'ya aykırı olduğuna ve İPTALİNE" in doc.text
    assert "<p>" not in doc.text
    assert "© 2023 Anayasa Mahkemesi" not in doc.text  # footer atıldı


async def test_norm_fetch_bos_sayfa_hata(norm):
    ref = DocRef(source=SourceId.AYM_NORM, external_id="ND/2023/1", url=f"{ND}/ND/2023/1")
    with respx.mock() as mock:
        mock.get(f"{ND}/ND/2023/1").mock(return_value=httpx.Response(200, text="<html></html>"))
        with pytest.raises(SourceError):
            await norm.fetch(ref)


# ---- bireysel başvuru ------------------------------------------------------------------------


async def test_bireysel_discover(bireysel):
    with respx.mock() as mock:
        mock.get(f"{BB}/Ara", params__contains={"KelimeAra[]": "ifade özgürlüğü"}).mock(
            return_value=_html("bb_search.html")
        )
        refs = [r async for r in bireysel.discover(query="ifade özgürlüğü")]

    assert [r.external_id for r in refs] == ["BB/2020/1234", "BB/2019/987"]
    assert refs[0].source == SourceId.AYM_BIREYSEL
    assert str(refs[0].url) == f"{BB}/BB/2020/1234"
    assert refs[0].title == "AYŞE YILMAZ BAŞVURUSU"
    assert refs[0].published_at == date(2020, 11, 12)
    assert refs[0].extra["case_no"] == "2017/12345"
    # mutlak bağlantı da çözülür
    assert str(refs[1].url) == f"{BB}/BB/2019/987"


async def test_bireysel_discover_dogrudan_kimlik(bireysel):
    refs = [r async for r in bireysel.discover(query="BB/2020/1234")]
    assert [r.external_id for r in refs] == ["BB/2020/1234"]


async def test_bireysel_fetch(bireysel):
    ref = DocRef(source=SourceId.AYM_BIREYSEL, external_id="BB/2020/1234", url=f"{BB}/BB/2020/1234")
    with respx.mock() as mock:
        mock.get(f"{BB}/BB/2020/1234").mock(return_value=_html("bb_2020_1234.html"))
        doc = await bireysel.fetch(ref)

    assert doc.doc_id == "aym_bireysel:BB/2020/1234"
    assert doc.doc_type == DocType.MAHKEME_KARARI
    assert doc.court == "Anayasa Mahkemesi"
    assert doc.title == "AYŞE YILMAZ BAŞVURUSU"
    assert doc.case_no == "2017/12345"
    assert doc.decision_no is None
    assert doc.decision_date == date(2020, 11, 12)
    assert doc.metadata["applicant"] == "Ayşe YILMAZ"
    assert doc.metadata["chamber"] == "İkinci Bölüm"
    assert doc.metadata["rg_date"] == date(2021, 2, 5)
    assert doc.rg_issue == "31386"
    rights = doc.metadata["rights"]
    assert rights[0]["right"] == "İfade özgürlüğü"
    assert rights[0]["outcome"] == "İhlal"
    assert rights[0]["remedy"] == "Yeniden yargılama"
    assert rights[1]["right"] == "Adil yargılanma hakkı"
    assert "ifade özgürlüğünün İHLAL EDİLDİĞİNE" in doc.text
