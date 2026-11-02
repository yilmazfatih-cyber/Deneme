"""Mevzuat (mevzuat.gov.tr) adaptörü testleri (ağ `respx` ile sahteleştirilir)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from legalai.models import DocRef, DocType, SourceId
from legalai.sources.base import SourceError
from legalai.sources.mevzuat import MEVZUAT_TUR, MevzuatSource

FIXTURES = Path(__file__).parent / "fixtures" / "mevzuat"
PDF_URL = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf"
PAGE_URL = "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTur=1&MevzuatTertip=5"


def _source() -> MevzuatSource:
    src = MevzuatSource(http=httpx.AsyncClient())
    src.limiter.min_interval = 0.0
    return src


def _pdf(body: bytes) -> httpx.Response:
    return httpx.Response(200, content=body, headers={"content-type": "application/pdf"})


# ---- discover -------------------------------------------------------------------------------


async def test_discover_default_lists_well_known() -> None:
    src = _source()
    refs = [r async for r in src.discover()]
    await src.aclose()
    assert len(refs) == len(MevzuatSource.well_known) == 20
    nos = {r.extra["mevzuat_no"] for r in refs}
    assert {
        6098,
        4721,
        5237,
        5271,
        6100,
        2004,
        6102,
        4857,
        6698,
        2709,
        6502,
        7201,
        2577,
        5018,
        213,
        3065,
        193,
        5520,
        4054,
        5510,
    } == nos
    tbk = next(r for r in refs if r.extra["mevzuat_no"] == 6098)
    assert tbk.source is SourceId.MEVZUAT
    assert tbk.external_id == "1.5.6098"
    assert tbk.doc_id == "mevzuat:1.5.6098"
    assert tbk.title == "Türk Borçlar Kanunu"
    assert str(tbk.url) == PAGE_URL
    assert tbk.extra["pdf_url"] == PDF_URL
    assert tbk.extra["mevzuat_tur"] == 1 and tbk.extra["mevzuat_tertip"] == 5


async def test_discover_limit() -> None:
    src = _source()
    refs = [r async for r in src.discover(limit=3)]
    await src.aclose()
    assert len(refs) == 3


async def test_discover_numeric_query() -> None:
    src = _source()
    refs = [r async for r in src.discover(query="6098")]
    assert len(refs) == 1
    assert refs[0].external_id == "1.5.6098"
    assert refs[0].title == "Türk Borçlar Kanunu"

    # well_known dışı numara: Tertip 5 varsayılır, başlık yok
    refs = [r async for r in src.discover(query=" 7258 ")]
    assert refs[0].external_id == "1.5.7258"
    assert refs[0].title is None
    assert (
        str(refs[0].url) == "https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=7258&MevzuatTur=1&MevzuatTertip=5"
    )

    # Tür.Tertip.No biçimi
    refs = [r async for r in src.discover(query="9.5.1")]
    assert refs[0].external_id == "9.5.1"
    assert refs[0].extra["pdf_url"] == "https://www.mevzuat.gov.tr/MevzuatMetin/9.5.1.pdf"
    await src.aclose()


async def test_discover_text_query_not_supported() -> None:
    src = _source()
    with pytest.raises(SourceError, match="kanun numarası"):
        _ = [r async for r in src.discover(query="borçlar kanunu")]
    await src.aclose()


# ---- fetch ----------------------------------------------------------------------------------


@respx.mock
async def test_fetch_tbk_pdf() -> None:
    respx.get(PDF_URL).mock(return_value=_pdf((FIXTURES / "1.5.6098.pdf").read_bytes()))
    src = _source()
    ref = await anext(src.discover(query="6098"))
    doc = await src.fetch(ref)
    await src.aclose()

    assert doc.doc_id == "mevzuat:1.5.6098"
    assert doc.title == "Türk Borçlar Kanunu"
    assert doc.doc_type is DocType.KANUN
    assert doc.law_no == "6098"
    assert str(doc.url) == PAGE_URL  # kullanıcıya HTML sayfa gösterilir
    assert doc.metadata["pdf_url"] == PDF_URL
    assert doc.metadata["mevzuat_tur_adi"] == "Kanun"
    assert doc.metadata["short_title"] == "TBK"
    assert doc.metadata["kabul_tarihi"] == "2011-01-11"
    assert doc.rg_issue == "27836"
    assert doc.published_at == date(2011, 2, 4)
    assert "MADDE 1-" in doc.text
    assert "iradelerini" in doc.text


@respx.mock
async def test_fetch_unknown_law_title_from_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    """well_known dışı kanunda başlık PDF'in ilk büyük harfli satırından gelir; PDF sahte bayt + monkeypatch."""
    monkeypatch.setattr(
        "legalai.sources.mevzuat.pdf_to_text",
        lambda data: (
            "10931\nAFET RİSKİ ALTINDAKİ ALANLARIN DÖNÜŞTÜRÜLMESİ HAKKINDA KANUN\n"
            "Kanun Numarası : 6306\nKabul Tarihi : 16/5/2012\n"
            "Yayımlandığı Resmî Gazete : Tarih : 31/5/2012 Sayı : 28309\nMADDE 1- Amaç."
        ),
    )
    url = "https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6306.pdf"
    respx.get(url).mock(return_value=_pdf(b"%PDF-1.7 sahte"))
    src = _source()
    ref = await anext(src.discover(query="6306"))
    doc = await src.fetch(ref)
    await src.aclose()
    assert doc.title == "AFET RİSKİ ALTINDAKİ ALANLARIN DÖNÜŞTÜRÜLMESİ HAKKINDA KANUN"
    assert doc.law_no == "6306"
    assert doc.rg_issue == "28309"
    assert doc.published_at == date(2012, 5, 31)
    assert doc.metadata["kabul_tarihi"] == "2012-05-16"


@respx.mock
async def test_fetch_other_tur_doc_type(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "legalai.sources.mevzuat.pdf_to_text", lambda data: "CUMHURBAŞKANLIĞI TEŞKİLATI HAKKINDA\nMADDE 1-"
    )
    respx.get("https://www.mevzuat.gov.tr/MevzuatMetin/9.5.1.pdf").mock(return_value=_pdf(b"%PDF-1.7 sahte"))
    src = _source()
    ref = await anext(src.discover(query="9.5.1"))
    doc = await src.fetch(ref)
    await src.aclose()
    assert doc.doc_type is DocType.CB_KARARNAMESI
    assert doc.law_no == "1"
    assert doc.metadata["mevzuat_tur_adi"] == MEVZUAT_TUR[9][0]
    assert doc.title == "CUMHURBAŞKANLIĞI TEŞKİLATI HAKKINDA"


@respx.mock
async def test_fetch_ref_without_extra_uses_external_id() -> None:
    respx.get(PDF_URL).mock(return_value=_pdf((FIXTURES / "1.5.6098.pdf").read_bytes()))
    src = _source()
    ref = DocRef(source=SourceId.MEVZUAT, external_id="1.5.6098", url=PAGE_URL)
    doc = await src.fetch(ref)
    await src.aclose()
    assert doc.law_no == "6098"
    assert doc.title == "Türk Borçlar Kanunu"


@respx.mock
async def test_fetch_non_pdf_response_raises() -> None:
    respx.get(PDF_URL).mock(
        return_value=httpx.Response(200, content=b"<html>Hata</html>", headers={"content-type": "text/html"})
    )
    src = _source()
    ref = await anext(src.discover(query="6098"))
    with pytest.raises(SourceError, match="PDF"):
        await src.fetch(ref)
    await src.aclose()


@respx.mock
async def test_fetch_empty_pdf_text_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("legalai.sources.mevzuat.pdf_to_text", lambda data: "   ")
    respx.get(PDF_URL).mock(return_value=_pdf(b"%PDF-1.7 sahte"))
    src = _source()
    ref = await anext(src.discover(query="6098"))
    with pytest.raises(SourceError, match="boş"):
        await src.fetch(ref)
    await src.aclose()
