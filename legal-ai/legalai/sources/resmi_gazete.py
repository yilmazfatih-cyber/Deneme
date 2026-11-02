"""Resmî Gazete (resmigazete.gov.tr) kaynak adaptörü.

Keşif: günlük fihrist sayfası ``https://www.resmigazete.gov.tr/eskiler/YYYY/MM/YYYYMMDD.htm``
(mükerrer sayılar ``YYYYMMDDM1.htm``, ``YYYYMMDDM2.htm`` ...). Fihristte bölüm başlıkları
(YASAMA BÖLÜMÜ / YÜRÜTME VE İDARE BÖLÜMÜ / YARGI BÖLÜMÜ / İLÂN BÖLÜMÜ) ve alt başlıklar (KANUNLAR,
YÖNETMELİKLER, TEBLİĞLER ...) altında ``YYYYMMDD-N.htm`` ya da ``YYYYMMDD-N.pdf`` bağlantılı maddeler yer alır.

Belge: HTML ise ``html_to_text``, PDF ise ``pdf_to_text`` ile düz metne çevrilir.

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı (bu ortamda gov.tr erişimi yok).
Ayrıştırıcı toleranslıdır: başlıklar sınıf adına değil, büyük harfli metne göre tanınır; bağlantılar
dosya adı kalıbıyla (``\\d{8}(M\\d+)?-\\d+.(htm|pdf)``) seçilir.
"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from datetime import date, timedelta
from typing import Any, ClassVar
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup, Tag

from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.text import clean_text, fold_tr, html_to_text, pdf_to_text, tr_lower, tr_upper

log = logging.getLogger(__name__)


def _fold(text: str) -> str:
    """Büyük harfli başlıklar için güvenli katlama: önce Türkçe küçük harf, sonra aksan katlama."""
    return fold_tr(tr_lower(text))


# Fihrist madde bağlantısı: 20251031-1.htm, 20251031M1-3.htm, 20251031-7-1.pdf
_ITEM_RE = re.compile(
    r"^(?P<day>\d{8})(?P<muk>M\d+)?-(?P<seq>\d+(?:-\d+)*)\.(?P<ext>html?|pdf)$", re.IGNORECASE
)
_ISSUE_RE = re.compile(r"Say[ıi]\s*:?\s*(\d{4,6})")
_LAW_NO_RE = re.compile(r"Kanun\s+No\.?\s*:?\s*(\d{3,5})")
_LEADING_BULLETS = re.compile(r"^[\s\-–—•·]+")
_UPPER_LETTERS = re.compile(r"[A-ZÇĞİÖŞÜ]{3,}")

# Bölüm başlıkları (katlanmış biçim -> normalize ad)
_SECTIONS = {
    "yasama bolumu": "YASAMA BÖLÜMÜ",
    "yurutme ve idare bolumu": "YÜRÜTME VE İDARE BÖLÜMÜ",
    "yargi bolumu": "YARGI BÖLÜMÜ",
    "ilan bolumu": "İLÂN BÖLÜMÜ",
}

# Alt başlık (katlanmış, parça eşleşme) -> belge türü. Sıra önemli: özel olanlar önce.
_SUBSECTION_TYPES: tuple[tuple[str, DocType], ...] = (
    ("cumhurbaskanligi kararname", DocType.CB_KARARNAMESI),
    ("cumhurbaskani karar", DocType.CB_KARARI),
    ("kanun hukmunde kararname", DocType.KHK),
    ("kanun", DocType.KANUN),
    ("yonetmelik", DocType.YONETMELIK),
    ("teblig", DocType.TEBLIG),
    ("genelge", DocType.GENELGE),
    ("mahkemesi karar", DocType.MAHKEME_KARARI),
    ("yargitay karar", DocType.MAHKEME_KARARI),
    ("danistay karar", DocType.MAHKEME_KARARI),
    ("kurul karar", DocType.KURUL_KARARI),
)

_HEADING_TAGS = ("p", "h1", "h2", "h3", "h4", "h5", "h6", "b", "strong", "font", "td", "div", "span", "li")


def doc_type_for(section: str | None, subsection: str | None) -> DocType:
    """Fihrist bölüm/alt başlığından belge türü çıkarır."""
    sub = _fold(subsection or "")
    for needle, dtype in _SUBSECTION_TYPES:
        if needle in sub:
            return dtype
    sec = _fold(section or "")
    if "ilan" in sec:
        return DocType.RG_ILAN
    if "yargi" in sec:
        return DocType.MAHKEME_KARARI
    return DocType.RG_DIGER


def parse_issue(text: str) -> str | None:
    """'Sayı : 33069' ifadesinden sayı numarasını döndürür."""
    m = _ISSUE_RE.search(text)
    return m.group(1) if m else None


def parse_law_no(text: str) -> str | None:
    """'Kanun No. 7558' ifadesinden kanun numarasını döndürür (yalnızca ilk 4000 karakterde aranır)."""
    m = _LAW_NO_RE.search(text[:4000])
    return m.group(1) if m else None


def _is_heading_text(text: str) -> bool:
    if not text or len(text) > 150:
        return False
    if not _UPPER_LETTERS.search(text):
        return False
    return text == tr_upper(text)


def parse_fihrist(html: bytes | str, page_url: str) -> tuple[str | None, list[dict[str, Any]]]:
    """Fihrist HTML'ini ayrıştırır.

    Dönüş: ``(rg_issue, items)``; her madde ``{"external_id", "url", "title", "section", "subsection", "ext"}``.
    Belge sırasıyla gezilir: büyük harfli başlıklar bölüm/alt başlık bağlamını günceller, kalıba uyan
    her bağlantı o bağlamla kaydedilir.
    """
    soup = BeautifulSoup(html, "lxml")
    for node in soup.select("script, style"):
        node.decompose()

    rg_issue = parse_issue(soup.get_text(" "))

    section: str | None = None
    subsection: str | None = None
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for tag in soup.find_all(True):
        if not isinstance(tag, Tag):
            continue
        if tag.name == "a":
            href = tag.get("href")
            if not isinstance(href, str):
                continue
            basename = urlparse(href).path.rsplit("/", 1)[-1]
            m = _ITEM_RE.match(basename)
            if not m:
                continue
            external_id = f"{m['day']}{m['muk'] or ''}-{m['seq']}"
            if external_id in seen:
                continue
            seen.add(external_id)
            title = _LEADING_BULLETS.sub("", clean_text(tag.get_text(" "))).strip() or None
            items.append(
                {
                    "external_id": external_id,
                    "url": urljoin(page_url, href),
                    "title": title,
                    "section": section,
                    "subsection": subsection,
                    "ext": m["ext"].lower(),
                }
            )
            continue

        if tag.name not in _HEADING_TAGS or tag.find("a") is not None:
            continue
        text = clean_text(tag.get_text(" "))
        if not _is_heading_text(text):
            continue
        folded = _fold(text)
        matched_section = next((name for key, name in _SECTIONS.items() if key in folded), None)
        if matched_section:
            if matched_section != section:
                section = matched_section
                subsection = None
        else:
            subsection = text

    return rg_issue, items


class ResmiGazeteSource(BaseSource):
    """Resmî Gazete günlük fihristleri ve maddeleri."""

    source_id: ClassVar[SourceId] = SourceId.RESMI_GAZETE
    display_name: ClassVar[str] = "Resmî Gazete"
    base_url: ClassVar[str] = "https://www.resmigazete.gov.tr"
    min_interval: ClassVar[float] = 1.0
    concurrency: ClassVar[int] = 2
    max_mukerrer: ClassVar[int] = 5  # aynı gün için denenecek en fazla mükerrer sayısı

    # ---- adres yardımcıları ------------------------------------------------------------------

    def fihrist_url(self, day: date, mukerrer: int = 0) -> str:
        suffix = f"M{mukerrer}" if mukerrer else ""
        return f"{self.base_url}/eskiler/{day:%Y}/{day:%m}/{day:%Y%m%d}{suffix}.htm"

    # ---- keşif --------------------------------------------------------------------------------

    async def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        """``since``..``until`` (dahil) arasındaki her gün için fihristi çeker.

        Varsayılan: ikisi de boşsa bugün; yalnızca ``since`` boşsa tek gün (``until``); yalnızca ``until``
        boşsa bugüne kadar. Fihrist 404 ise (Resmî Gazete çıkmayan gün) o gün sessizce atlanır.
        Her gün için ``M1``, ``M2`` ... mükerrer fihristleri de 404 alınana dek denenir.
        ``query`` verilirse başlıkta (Türkçe katlanmış) parça eşleşmesi aranır.
        """
        until = until or date.today()
        since = since or until
        if since > until:
            since, until = until, since
        needle = _fold(query) if query else None

        produced = 0
        day = since
        while day <= until:
            for mukerrer in range(self.max_mukerrer + 1):
                url = self.fihrist_url(day, mukerrer)
                resp = await self._get_optional(url)
                if resp is None:
                    if mukerrer == 0:
                        log.info("Resmî Gazete %s için fihrist yok (404), atlanıyor", day)
                    break
                rg_issue, items = parse_fihrist(resp.content, url)
                if not items and mukerrer == 0:
                    raise SourceError(f"Fihrist beklenen yapıda değil, hiç madde bulunamadı: {url}")
                for item in items:
                    if needle and needle not in _fold(item["title"] or ""):
                        continue
                    yield DocRef(
                        source=self.source_id,
                        external_id=item["external_id"],
                        url=item["url"],
                        title=item["title"],
                        published_at=day,
                        extra={
                            "section": item["section"],
                            "subsection": item["subsection"],
                            "rg_issue": rg_issue,
                            "mukerrer": mukerrer,
                            "format": item["ext"],
                        },
                    )
                    produced += 1
                    if limit is not None and produced >= limit:
                        return
            day += timedelta(days=1)

    async def _get_optional(self, url: str) -> httpx.Response | None:
        """404'te ``None`` döndürür; başka hata durumunda ``self.get`` ile yeniden deneme yoluna girer.

        Not: ``BaseSource._request`` 404'ü de yeniden dener; çıkmayan günler için üç kez beklemek
        gereksiz olduğu için ilk istek doğrudan, ancak yine hız sınırlayıcı altında yapılır.
        """
        async with self.limiter:
            try:
                resp = await self.http.get(url)
            except httpx.TransportError as exc:
                log.warning("GET %s taşıma hatası (%s), yeniden deneme yoluna geçiliyor", url, exc)
                resp = None
        if resp is not None:
            if resp.status_code == 404:
                return None
            if resp.is_success:
                return resp
        return await self.get(url)

    # ---- belge -------------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        url = str(ref.url)
        resp = await self.get(url)
        content_type = resp.headers.get("content-type", "").lower()
        is_pdf = (
            ref.extra.get("format") == "pdf"
            or urlparse(url).path.lower().endswith(".pdf")
            or "application/pdf" in content_type
            or resp.content[:5] == b"%PDF-"
        )
        text = pdf_to_text(resp.content) if is_pdf else html_to_text(resp.content)
        if not text.strip():
            raise SourceError(f"Belge metni boş ya da çıkarılamadı: {url}")

        section = ref.extra.get("section")
        subsection = ref.extra.get("subsection")
        doc_type = doc_type_for(section, subsection)
        if doc_type is DocType.RG_DIGER and not subsection:
            # Fihrist bağlamı yoksa metnin başındaki tür başlığına bak
            head = _fold(text[:600])
            for needle, dtype in _SUBSECTION_TYPES:
                if needle in head:
                    doc_type = dtype
                    break

        title = ref.title or _first_meaningful_line(text) or ref.external_id
        rg_issue = ref.extra.get("rg_issue") or parse_issue(text[:1500])
        law_no = parse_law_no(text) if doc_type is DocType.KANUN else None
        published_at = ref.published_at or _date_from_external_id(ref.external_id)

        metadata: dict[str, Any] = {
            "section": section,
            "subsection": subsection,
            "format": "pdf" if is_pdf else "html",
        }
        if ref.extra.get("mukerrer"):
            metadata["mukerrer"] = ref.extra["mukerrer"]

        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title,
            doc_type=doc_type,
            text=text,
            published_at=published_at,
            law_no=law_no,
            rg_issue=rg_issue,
            metadata=metadata,
        )


def _first_meaningful_line(text: str) -> str | None:
    for line in text.split("\n"):
        line = line.strip()
        if len(line) >= 8 and not line.isdigit():
            return line[:300]
    return None


def _date_from_external_id(external_id: str) -> date | None:
    m = re.match(r"(\d{4})(\d{2})(\d{2})", external_id)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
