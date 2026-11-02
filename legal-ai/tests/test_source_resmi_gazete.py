"""Resmî Gazete adaptörü testleri (ağ `respx` ile sahteleştirilir)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import httpx
import pytest
import respx

from legalai.models import DocRef, DocType, SourceId
from legalai.sources.base import SourceError
from legalai.sources.resmi_gazete import ResmiGazeteSource, doc_type_for, parse_fihrist

FIXTURES = Path(__file__).parent / "fixtures" / "resmi_gazete"
BASE = "https://www.resmigazete.gov.tr/eskiler/2025/10/"


def _fx(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def _html(body: bytes, status: int = 200) -> httpx.Response:
    return httpx.Response(status, content=body, headers={"content-type": "text/html; charset=utf-8"})


def _pdf(body: bytes) -> httpx.Response:
    return httpx.Response(200, content=body, headers={"content-type": "application/pdf"})


def _source() -> ResmiGazeteSource:
    src = ResmiGazeteSource(http=httpx.AsyncClient())
    src.limiter.min_interval = 0.0  # testte bekleme olmasın
    return src


def _mock_day(router: respx.MockRouter) -> None:
    """31 Ekim 2025: normal fihrist + 1 mükerrer; M2 yok."""
    router.get(BASE + "20251031.htm").mock(return_value=_html(_fx("20251031.htm")))
    router.get(BASE + "20251031M1.htm").mock(return_value=_html(_fx("20251031M1.htm")))
    router.get(BASE + "20251031M2.htm").mock(return_value=httpx.Response(404))


# ---- saf ayrıştırıcı ------------------------------------------------------------------------


def test_parse_fihrist_sections_and_issue() -> None:
    rg_issue, items = parse_fihrist(_fx("20251031.htm"), BASE + "20251031.htm")
    assert rg_issue == "33069"
    by_id = {it["external_id"]: it for it in items}
    assert list(by_id) == [
        "20251031-1",
        "20251031-2",
        "20251031-7",
        "20251031-9",
        "20251031-12",
        "20251031-15",
    ]
    kanun = by_id["20251031-1"]
    assert kanun["section"] == "YASAMA BÖLÜMÜ"
    assert kanun["subsection"] == "KANUNLAR"
    assert kanun["title"] == "7558 Bazı Kanunlarda Değişiklik Yapılmasına Dair Kanun"
    assert kanun["url"] == BASE + "20251031-1.htm"
    assert kanun["ext"] == "htm"

    karar = by_id["20251031-2"]
    assert karar["section"] == "YÜRÜTME VE İDARE BÖLÜMÜ"
    assert karar["subsection"] == "CUMHURBAŞKANI KARARLARI"
    assert karar["title"].startswith("Bazı Alanların")  # baştaki "––" temizlenir
    assert karar["ext"] == "pdf"

    assert by_id["20251031-7"]["subsection"] == "YÖNETMELİKLER"
    # mutlak yol da aynı adrese çözülür
    assert by_id["20251031-9"]["url"] == BASE + "20251031-9.htm"
    assert by_id["20251031-9"]["subsection"] == "TEBLİĞLER"
    assert by_id["20251031-12"]["section"] == "YARGI BÖLÜMÜ"
    assert by_id["20251031-12"]["subsection"] == "ANAYASA MAHKEMESİ KARARLARI"
    # Bölüm değişince alt başlık sıfırlanır
    assert by_id["20251031-15"]["section"] == "İLÂN BÖLÜMÜ"
    assert by_id["20251031-15"]["subsection"] is None


def test_parse_fihrist_mukerrer_ids() -> None:
    rg_issue, items = parse_fihrist(_fx("20251031M1.htm"), BASE + "20251031M1.htm")
    assert rg_issue == "33069"
    assert [it["external_id"] for it in items] == ["20251031M1-1"]
    assert items[0]["subsection"] == "CUMHURBAŞKANLIĞI KARARNAMELERİ"


@pytest.mark.parametrize(
    ("section", "subsection", "expected"),
    [
        ("YASAMA BÖLÜMÜ", "KANUNLAR", DocType.KANUN),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "YÖNETMELİKLER", DocType.YONETMELIK),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "TEBLİĞLER", DocType.TEBLIG),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "CUMHURBAŞKANI KARARLARI", DocType.CB_KARARI),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "CUMHURBAŞKANLIĞI KARARNAMELERİ", DocType.CB_KARARNAMESI),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "GENELGELER", DocType.GENELGE),
        ("YÜRÜTME VE İDARE BÖLÜMÜ", "ATAMA KARARLARI", DocType.RG_DIGER),
        ("YARGI BÖLÜMÜ", "ANAYASA MAHKEMESİ KARARLARI", DocType.MAHKEME_KARARI),
        ("İLÂN BÖLÜMÜ", None, DocType.RG_ILAN),
        (None, None, DocType.RG_DIGER),
    ],
)
def test_doc_type_for(section: str | None, subsection: str | None, expected: DocType) -> None:
    assert doc_type_for(section, subsection) is expected


# ---- discover -------------------------------------------------------------------------------


@respx.mock
async def test_discover_single_day_with_mukerrer() -> None:
    _mock_day(respx)
    src = _source()
    refs = [r async for r in src.discover(since=date(2025, 10, 31), until=date(2025, 10, 31))]
    await src.aclose()

    ids = [r.external_id for r in refs]
    assert ids == [
        "20251031-1",
        "20251031-2",
        "20251031-7",
        "20251031-9",
        "20251031-12",
        "20251031-15",
        "20251031M1-1",
    ]
    first = refs[0]
    assert first.source is SourceId.RESMI_GAZETE
    assert first.doc_id == "resmi_gazete:20251031-1"
    assert first.published_at == date(2025, 10, 31)
    assert str(first.url) == BASE + "20251031-1.htm"
    assert first.extra["section"] == "YASAMA BÖLÜMÜ"
    assert first.extra["subsection"] == "KANUNLAR"
    assert first.extra["rg_issue"] == "33069"
    assert first.extra["mukerrer"] == 0
    assert refs[-1].extra["mukerrer"] == 1
    # M2 denendi ve 404 ile duruldu; M3 hiç istenmedi
    assert respx.calls.call_count == 3


@respx.mock
async def test_discover_skips_missing_days_and_respects_limit() -> None:
    # 1 Kasım 2025 (Cumartesi) ve 2 Kasım (Pazar) çıkmamış olsun
    respx.get("https://www.resmigazete.gov.tr/eskiler/2025/11/20251101.htm").mock(
        return_value=httpx.Response(404)
    )
    respx.get("https://www.resmigazete.gov.tr/eskiler/2025/11/20251102.htm").mock(
        return_value=httpx.Response(404)
    )
    _mock_day(respx)
    src = _source()
    refs = [r async for r in src.discover(since=date(2025, 10, 31), until=date(2025, 11, 2), limit=2)]
    await src.aclose()
    assert [r.external_id for r in refs] == ["20251031-1", "20251031-2"]

    src = _source()
    refs = [r async for r in src.discover(since=date(2025, 10, 31), until=date(2025, 11, 2))]
    await src.aclose()
    assert len(refs) == 7
    assert respx.get("https://www.resmigazete.gov.tr/eskiler/2025/11/20251101.htm").called
    assert respx.get("https://www.resmigazete.gov.tr/eskiler/2025/11/20251102.htm").called


@respx.mock
async def test_discover_query_filters_titles() -> None:
    _mock_day(respx)
    src = _source()
    refs = [r async for r in src.discover(since=date(2025, 10, 31), until=date(2025, 10, 31), query="gümrük")]
    await src.aclose()
    assert [r.external_id for r in refs] == ["20251031-7"]


@respx.mock
async def test_discover_unexpected_structure_raises() -> None:
    respx.get(BASE + "20251031.htm").mock(
        return_value=_html(b"<html><body><p>Bakim calismasi</p></body></html>")
    )
    src = _source()
    with pytest.raises(SourceError):
        _ = [r async for r in src.discover(since=date(2025, 10, 31), until=date(2025, 10, 31))]
    await src.aclose()


# ---- fetch ----------------------------------------------------------------------------------


@respx.mock
async def test_fetch_html_kanun() -> None:
    respx.get(BASE + "20251031-1.htm").mock(return_value=_html(_fx("20251031-1.htm")))
    src = _source()
    ref = DocRef(
        source=SourceId.RESMI_GAZETE,
        external_id="20251031-1",
        url=BASE + "20251031-1.htm",
        title="7558 Bazı Kanunlarda Değişiklik Yapılmasına Dair Kanun",
        published_at=date(2025, 10, 31),
        extra={"section": "YASAMA BÖLÜMÜ", "subsection": "KANUNLAR", "rg_issue": "33069", "format": "htm"},
    )
    doc = await src.fetch(ref)
    await src.aclose()

    assert doc.doc_id == "resmi_gazete:20251031-1"
    assert doc.doc_type is DocType.KANUN
    assert doc.title == ref.title
    assert doc.law_no == "7558"
    assert doc.rg_issue == "33069"
    assert doc.published_at == date(2025, 10, 31)
    assert "MADDE 1-" in doc.text
    assert "Vergi Usul Kanununun 5 inci maddesine" in doc.text
    assert "<p>" not in doc.text and "margin" not in doc.text  # etiket ve stil temizlendi
    assert doc.metadata["format"] == "html"
    assert doc.content_hash


@respx.mock
async def test_fetch_pdf_yonetmelik() -> None:
    respx.get(BASE + "20251031-7.pdf").mock(return_value=_pdf(_fx("20251031-7.pdf")))
    src = _source()
    ref = DocRef(
        source=SourceId.RESMI_GAZETE,
        external_id="20251031-7",
        url=BASE + "20251031-7.pdf",
        title="Gümrük Yönetmeliğinde Değişiklik Yapılmasına Dair Yönetmelik",
        published_at=date(2025, 10, 31),
        extra={"section": "YÜRÜTME VE İDARE BÖLÜMÜ", "subsection": "YÖNETMELİKLER", "rg_issue": "33069"},
    )
    doc = await src.fetch(ref)
    await src.aclose()
    assert doc.doc_type is DocType.YONETMELIK
    assert doc.law_no is None
    assert doc.metadata["format"] == "pdf"
    assert "27369 mükerrer" in doc.text


@respx.mock
async def test_fetch_without_discover_context_infers_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    """Dışarıdan yalnızca URL ile gelen referans: tür metinden, sayı metinden, tarih kimlikten çıkarılır."""
    respx.get(BASE + "20251031-1.htm").mock(return_value=_html(_fx("20251031-1.htm")))
    src = _source()
    ref = DocRef(source=SourceId.RESMI_GAZETE, external_id="20251031-1", url=BASE + "20251031-1.htm")
    doc = await src.fetch(ref)
    await src.aclose()
    assert doc.doc_type is DocType.KANUN
    assert doc.rg_issue == "33069"
    assert doc.published_at == date(2025, 10, 31)
    assert doc.title  # metnin ilk anlamlı satırı
    assert doc.law_no == "7558"


@respx.mock
async def test_fetch_pdf_detected_by_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    """Uzantı .htm olsa da içerik PDF ise pdf_to_text kullanılır (monkeypatch ile sahte bayt)."""
    calls: list[bytes] = []

    def fake_pdf_to_text(data: bytes) -> str:
        calls.append(data)
        return "SAHTE PDF METNİ\nMADDE 1- Deneme."

    monkeypatch.setattr("legalai.sources.resmi_gazete.pdf_to_text", fake_pdf_to_text)
    respx.get(BASE + "20251031-3.htm").mock(
        return_value=httpx.Response(200, content=b"%PDF-1.4 sahte", headers={"content-type": "text/html"})
    )
    src = _source()
    ref = DocRef(source=SourceId.RESMI_GAZETE, external_id="20251031-3", url=BASE + "20251031-3.htm")
    doc = await src.fetch(ref)
    await src.aclose()
    assert calls == [b"%PDF-1.4 sahte"]
    assert doc.metadata["format"] == "pdf"
    assert doc.title == "SAHTE PDF METNİ"


@respx.mock
async def test_fetch_empty_text_raises() -> None:
    respx.get(BASE + "20251031-4.htm").mock(return_value=_html(b"<html><body></body></html>"))
    src = _source()
    ref = DocRef(source=SourceId.RESMI_GAZETE, external_id="20251031-4", url=BASE + "20251031-4.htm")
    with pytest.raises(SourceError):
        await src.fetch(ref)
    await src.aclose()
