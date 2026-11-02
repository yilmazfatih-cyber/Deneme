"""Rekabet Kurulu adaptörü — respx ile sahte ağ, PDF okuma monkeypatch."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from legalai.models import DocRef, DocType, SourceId
from legalai.sources.base import SourceError
from legalai.sources.rekabet import RekabetSource, karar_id_from_url

FIX = Path(__file__).parent / "fixtures" / "rekabet"
BASE = "https://www.rekabet.gov.tr"
LIST = f"{BASE}/tr/Kararlar"
ID1 = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"
ID2 = "9a8b7c6d-1e2f-4a3b-9c8d-7e6f5a4b3c2d"
FAKE_PDF = b"%PDF-1.4\n%sahte\n"


def _html(name: str) -> httpx.Response:
    return httpx.Response(
        200, text=(FIX / name).read_text(encoding="utf-8"), headers={"content-type": "text/html"}
    )


@pytest.fixture
def src():
    s = RekabetSource()
    s.limiter.min_interval = 0
    return s


async def test_discover_sayfalar(src):
    with respx.mock(assert_all_called=True) as mock:
        mock.get(LIST, params__contains={"page": "2"}).mock(return_value=_html("kararlar_p2.html"))
        mock.get(LIST).mock(return_value=_html("kararlar.html"))
        refs = [r async for r in src.discover()]

    assert [r.external_id for r in refs] == [ID1, ID2, "11111111-2222-4333-8444-555555555555"]
    first = refs[0]
    assert first.source == SourceId.REKABET
    assert str(first.url) == f"{BASE}/Karar?kararId={ID1}"
    assert first.title.startswith("Hızlı tüketim malları")
    assert first.published_at == date(2023, 9, 28)
    assert first.extra["decision_no"] == "23-45/678-234"
    assert first.extra["decision_kind"] == "Rekabet İhlali"
    assert refs[1].extra["decision_kind"] == "Birleşme ve Devralma"


async def test_discover_tarih_filtresi_ve_query(src):
    with respx.mock(assert_all_called=False) as mock:
        route = mock.get(LIST).mock(return_value=_html("kararlar.html"))
        refs = [r async for r in src.discover(since=date(2023, 9, 25), query="tüketim")]
    assert [r.external_id for r in refs] == [ID1]
    sent = route.calls[0].request.url
    assert sent.params["baslangicTarihi"] == "25.09.2023"


async def test_discover_beklenmeyen_sayfa_hata(src):
    with respx.mock() as mock:
        mock.get(LIST).mock(return_value=httpx.Response(200, text="<html><body>Bakım</body></html>"))
        with pytest.raises(SourceError):
            async for _ in src.discover():
                pass


async def test_fetch_pdf(src, monkeypatch):
    seen: dict[str, bytes] = {}

    def fake_pdf_to_text(data: bytes) -> str:
        seen["data"] = data
        return (
            "REKABET KURULU KARARI\nKarar Sayısı: 23-45/678-234\nKarar Tarihi: 28.09.2023\n"
            "Yeniden satış fiyatının tespiti yoluyla 4054 sayılı Kanun'un 4. maddesinin ihlal edildiğine karar verilmiştir."
        )

    monkeypatch.setattr("legalai.text.pdf_to_text", fake_pdf_to_text)
    ref = DocRef(source=SourceId.REKABET, external_id=ID1, url=f"{BASE}/Karar?kararId={ID1}")
    with respx.mock(assert_all_called=True) as mock:
        mock.get(f"{BASE}/Karar", params__contains={"kararId": ID1}).mock(return_value=_html("karar.html"))
        mock.get(f"{BASE}/Dosya/Karar/23-45-678-234.pdf").mock(
            return_value=httpx.Response(200, content=FAKE_PDF, headers={"content-type": "application/pdf"})
        )
        doc = await src.fetch(ref)

    assert seen["data"] == FAKE_PDF
    assert doc.doc_id == f"rekabet:{ID1}"
    assert doc.doc_type == DocType.KURUL_KARARI
    assert doc.court == "Rekabet Kurulu"
    assert str(doc.url) == f"{BASE}/Karar?kararId={ID1}"  # kullanıcıya HTML sayfası gösterilir
    assert doc.metadata["pdf_url"] == f"{BASE}/Dosya/Karar/23-45-678-234.pdf"
    assert doc.metadata["text_source"] == "pdf"
    assert doc.title.startswith("Hızlı tüketim malları")
    assert doc.decision_no == "23-45/678-234"
    assert doc.decision_date == date(2023, 9, 28)
    assert "4054 sayılı Kanun'un 4. maddesinin ihlal edildiğine" in doc.text


async def test_fetch_pdf_yoksa_html(src, monkeypatch):
    def boom(_: bytes) -> str:
        raise AssertionError("PDF yokken pdf_to_text çağrılmamalı")

    monkeypatch.setattr("legalai.text.pdf_to_text", boom)
    ref = DocRef(source=SourceId.REKABET, external_id=ID2, url=f"{BASE}/Karar?kararId={ID2}")
    with respx.mock() as mock:
        mock.get(f"{BASE}/Karar", params__contains={"kararId": ID2}).mock(
            return_value=_html("karar_pdfsiz.html")
        )
        doc = await src.fetch(ref)

    assert doc.metadata["text_source"] == "html"
    assert "pdf_url" not in doc.metadata
    assert doc.decision_no == "23-44/650-221"
    assert doc.decision_date == date(2023, 9, 21)
    assert "işleme izin verilmesine" in doc.text


async def test_fetch_bozuk_pdf_html_metnine_duser(src, monkeypatch):
    def broken(_: bytes) -> str:
        raise ValueError("bozuk PDF")

    monkeypatch.setattr("legalai.text.pdf_to_text", broken)
    ref = DocRef(source=SourceId.REKABET, external_id=ID1, url=f"{BASE}/Karar?kararId={ID1}")
    with respx.mock() as mock:
        mock.get(f"{BASE}/Karar", params__contains={"kararId": ID1}).mock(return_value=_html("karar.html"))
        mock.get(f"{BASE}/Dosya/Karar/23-45-678-234.pdf").mock(
            return_value=httpx.Response(200, content=FAKE_PDF, headers={"content-type": "application/pdf"})
        )
        doc = await src.fetch(ref)
    assert doc.metadata["text_source"] == "html"
    assert doc.metadata["pdf_error"] == "bozuk PDF"
    assert "yeniden satış fiyatının tespiti iddiası incelenmiştir" in doc.text


def test_karar_id_from_url():
    assert karar_id_from_url(f"{BASE}/Karar?kararId={ID1.upper()}") == ID1
    assert karar_id_from_url(f"{BASE}/tr/Kararlar") is None
