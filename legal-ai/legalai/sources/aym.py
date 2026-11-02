# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı
"""Anayasa Mahkemesi kaynak adaptörleri.

İki ayrı bilgi bankası vardır; ikisi de aynı URL düzenini kullanır:

* **Norm denetimi** (`AymNormSource`): ``https://normkararlarbilgibankasi.anayasa.gov.tr``
  Karar sayfası ``/ND/{yıl}/{sıra}`` (örn. ``/ND/2023/1``), arama ``/Ara?KelimeAra[]=<terim>&page=N``.
* **Bireysel başvuru** (`AymBireyselSource`): ``https://kararlarbilgibankasi.anayasa.gov.tr``
  Karar sayfası ``/BB/{yıl}/{sıra}`` (örn. ``/BB/2020/1234``), arama aynı biçimde.

`discover` için `query` zorunludur (site tarih aralığına göre listeleme sunmaz); `query` doğrudan
``ND/2023/1`` ya da ``BB/2020/1234`` biçimindeyse ağa çıkılmadan tek `DocRef` üretilir. `since/until`
verilirse arama sonuçlarındaki karar tarihine göre süzülür.

Ayrıştırma toleranslıdır: bağlantılar ``/ND/YYYY/N`` ya da ``/BB/YYYY/N`` düzenine göre bulunur,
meta alanlar sayfanın düz metninden düzenli ifadelerle çekilir. Hiç bağlantı yoksa ve sayfa arama
sayfasına da benzemiyorsa `SourceError` fırlatılır.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, ClassVar

from bs4 import BeautifulSoup, Tag

from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.text import clean_text, html_to_text, parse_tr_date

_DATE = r"(\d{1,2}[./]\d{1,2}[./]\d{4})"
_NO = r"(\d{4}/\d+)"

# Arama sonuçlarındaki E./K. numaraları: "E.2022/123, K.2023/45" ya da "Esas: 2022/123"
_RE_ESAS = re.compile(r"(?:\bE\.\s*|Esas\s*(?:Sayısı|No)?\s*[:\-]?\s*)" + _NO, re.IGNORECASE)
_RE_KARAR_NO = re.compile(r"(?:\bK\.\s*|Karar\s*(?:Sayısı|No)\s*[:\-]?\s*)" + _NO, re.IGNORECASE)
_RE_KARAR_TARIHI = re.compile(r"Karar\s*Tarihi\s*[:\-]?\s*" + _DATE, re.IGNORECASE)
_RE_RG = re.compile(
    r"(?:Resm[iî]\s*Gazete|R\.?\s*G\.?)[^\n\d]{0,40}?"
    + _DATE
    + r"\s*[-–/,]?\s*(?:Sayı\s*[:\-]?\s*)?(\d{4,6})",
    re.IGNORECASE,
)
_RE_BASVURU_NO = re.compile(r"Başvuru\s*(?:Numarası|No)\s*[:\-]?\s*" + _NO, re.IGNORECASE)
_RE_BASVURUCU = re.compile(r"Başvurucu(?:lar)?\s*[:\-]\s*([^\n]+)", re.IGNORECASE)
_RE_BOLUM = re.compile(r"\b(Genel\s+Kurul|Birinci\s+Bölüm|İkinci\s+Bölüm)\b", re.IGNORECASE)
_RE_ANY_DATE = re.compile(_DATE)
_RE_ANY_NO = re.compile(r"\b" + _NO + r"\b")


def _item_container(anchor: Tag, link_re: re.Pattern[str]) -> Tag:
    """Bir sonuç bağlantısını saran, başka karar bağlantısı içermeyen en geniş kapsayıcıyı bulur."""
    node: Tag = anchor
    for _ in range(6):
        parent = node.parent
        if parent is None or not isinstance(parent, Tag) or parent.name in ("body", "html", "[document]"):
            break
        hrefs = {a["href"] for a in parent.find_all("a", href=True) if link_re.search(str(a["href"]))}
        if len(hrefs) > 1:
            break
        node = parent
    return node


def _first(pattern: re.Pattern[str], text: str, group: int = 1) -> str | None:
    m = pattern.search(text)
    return m.group(group).strip() if m else None


def _page_title(soup: BeautifulSoup, fallback: str) -> str:
    for sel in ("h1", "h2", ".karar-baslik", ".baslik", "title"):
        node = soup.select_one(sel)
        if node:
            title = clean_text(node.get_text(" ", strip=True))
            if title:
                return title
    return fallback


class _AymBase(BaseSource):
    """İki bilgi bankasının ortak davranışı. Alt sınıf `kind` ("ND"/"BB") ve meta çıkarımını tanımlar."""

    kind: ClassVar[str] = ""
    court: ClassVar[str] = "Anayasa Mahkemesi"
    search_path: ClassVar[str] = "/Ara"
    min_interval: ClassVar[float] = 1.5

    @property
    def _link_re(self) -> re.Pattern[str]:
        return re.compile(rf"/{self.kind}/(\d{{4}})/(\d+)\b", re.IGNORECASE)

    # ---- keşif ---------------------------------------------------------------------------

    def _ref_for(self, year: str, seq: str, title: str | None = None, **extra: Any) -> DocRef:
        external_id = f"{self.kind}/{int(year)}/{int(seq)}"
        return DocRef(
            source=self.source_id,
            external_id=external_id,
            url=f"{self.base_url}/{external_id}",
            title=title,
            published_at=extra.pop("decision_date", None),
            extra=extra,
        )

    async def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        if not query or not query.strip():
            raise SourceError(f"{self.display_name}: discover için arama terimi (query) zorunludur")
        q = query.strip()

        direct = re.fullmatch(rf"(?:{self.kind})/(\d{{4}})/(\d+)", q, re.IGNORECASE)
        if direct:
            yield self._ref_for(direct.group(1), direct.group(2))
            return

        seen: set[str] = set()
        produced = 0
        page = 1
        while True:
            resp = await self.get(
                f"{self.base_url}{self.search_path}", params={"KelimeAra[]": q, "page": page}
            )
            refs, has_next = self._parse_search(resp.text, page)
            for ref in refs:
                if ref.external_id in seen:
                    continue
                seen.add(ref.external_id)
                d = ref.published_at
                if d is not None and ((since and d < since) or (until and d > until)):
                    continue
                yield ref
                produced += 1
                if limit is not None and produced >= limit:
                    return
            if not has_next or not refs:
                return
            page += 1

    def _parse_search(self, html: str, page: int) -> tuple[list[DocRef], bool]:
        soup = BeautifulSoup(html, "lxml")
        anchors = [a for a in soup.find_all("a", href=True) if self._link_re.search(str(a["href"]))]
        if not anchors:
            marker = "KelimeAra" in html or soup.find("form") is not None or "sonuç" in html.lower()
            if page == 1 and not marker:
                raise SourceError(f"{self.display_name}: arama sayfasında beklenen yapı bulunamadı")
            return [], False

        refs: list[DocRef] = []
        seen: set[str] = set()
        for a in anchors:
            m = self._link_re.search(str(a["href"]))
            assert m is not None
            key = f"{self.kind}/{int(m.group(1))}/{int(m.group(2))}"
            if key in seen:
                continue
            seen.add(key)
            container = _item_container(a, self._link_re)
            text = clean_text(container.get_text(" ", strip=True))
            link_text = clean_text(a.get_text(" ", strip=True))
            refs.append(self._search_ref(m.group(1), m.group(2), text, link_text))

        has_next = any(
            re.search(rf"[?&]page={page + 1}\b", str(a["href"])) for a in soup.find_all("a", href=True)
        ) or any(
            "sonraki" in a.get_text(" ", strip=True).lower() or a.get_text(strip=True) == "»"
            for a in soup.find_all("a", href=True)
        )
        return refs, has_next

    def _search_ref(self, year: str, seq: str, text: str, link_text: str) -> DocRef:  # pragma: no cover
        raise NotImplementedError

    # ---- belge ---------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        resp = await self.get(str(ref.url))
        html = resp.text
        soup = BeautifulSoup(html, "lxml")
        text = html_to_text(html)
        if len(text) < 80:
            raise SourceError(
                f"{self.display_name}: {ref.url} karar metni alınamadı (sayfa boş ya da yapı değişti)"
            )
        meta = self._extract_meta(text, soup)
        title = _page_title(soup, meta.pop("_fallback_title", ref.title or ref.external_id))
        decision_date = meta.pop("decision_date", None) or ref.published_at
        rg_date = meta.get("rg_date")
        chamber = _first(_RE_BOLUM, text)
        if chamber:
            meta["chamber"] = chamber
        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title,
            doc_type=DocType.MAHKEME_KARARI,
            text=text,
            published_at=rg_date or decision_date,
            decision_date=decision_date,
            court=self.court,
            case_no=meta.pop("case_no", None) or ref.extra.get("case_no"),
            decision_no=meta.pop("decision_no", None) or ref.extra.get("decision_no"),
            rg_issue=meta.get("rg_issue"),
            metadata=meta,
        )

    def _extract_meta(self, text: str, soup: BeautifulSoup) -> dict[str, Any]:  # pragma: no cover
        raise NotImplementedError


def _rg_meta(text: str) -> dict[str, Any]:
    m = _RE_RG.search(text)
    if not m:
        return {}
    out: dict[str, Any] = {}
    d = parse_tr_date(m.group(1))
    if d:
        out["rg_date"] = d
    out["rg_issue"] = m.group(2)
    return out


class AymNormSource(_AymBase):
    """AYM norm denetimi (iptal / itiraz) kararları."""

    source_id = SourceId.AYM_NORM
    display_name = "Anayasa Mahkemesi — Norm Denetimi"
    base_url = "https://normkararlarbilgibankasi.anayasa.gov.tr"
    kind = "ND"

    def _search_ref(self, year: str, seq: str, text: str, link_text: str) -> DocRef:
        case_no = _first(_RE_ESAS, text)
        decision_no = _first(_RE_KARAR_NO, text)
        d = parse_tr_date(_first(_RE_KARAR_TARIHI, text) or _first(_RE_ANY_DATE, text))
        title = link_text or None
        if not title and case_no:
            title = f"E.{case_no}" + (f", K.{decision_no}" if decision_no else "")
        extra: dict[str, Any] = {}
        if case_no:
            extra["case_no"] = case_no
        if decision_no:
            extra["decision_no"] = decision_no
        return self._ref_for(year, seq, title=title, decision_date=d, **extra)

    def _extract_meta(self, text: str, soup: BeautifulSoup) -> dict[str, Any]:
        meta: dict[str, Any] = {}
        case_no = _first(_RE_ESAS, text)
        decision_no = _first(_RE_KARAR_NO, text)
        if case_no:
            meta["case_no"] = case_no
        if decision_no:
            meta["decision_no"] = decision_no
        d = parse_tr_date(_first(_RE_KARAR_TARIHI, text))
        if d:
            meta["decision_date"] = d
        meta.update(_rg_meta(text))
        if case_no:
            meta["_fallback_title"] = f"AYM E.{case_no}" + (f", K.{decision_no}" if decision_no else "")
        return meta


class AymBireyselSource(_AymBase):
    """AYM bireysel başvuru kararları."""

    source_id = SourceId.AYM_BIREYSEL
    display_name = "Anayasa Mahkemesi — Bireysel Başvuru"
    base_url = "https://kararlarbilgibankasi.anayasa.gov.tr"
    kind = "BB"

    def _search_ref(self, year: str, seq: str, text: str, link_text: str) -> DocRef:
        app_no = _first(_RE_BASVURU_NO, text) or _first(_RE_ANY_NO, text)
        d = parse_tr_date(_first(_RE_KARAR_TARIHI, text) or _first(_RE_ANY_DATE, text))
        extra: dict[str, Any] = {}
        if app_no:
            extra["case_no"] = app_no
        return self._ref_for(year, seq, title=link_text or None, decision_date=d, **extra)

    def _extract_meta(self, text: str, soup: BeautifulSoup) -> dict[str, Any]:
        meta: dict[str, Any] = {}
        app_no = _first(_RE_BASVURU_NO, text)
        if app_no:
            meta["case_no"] = app_no
            meta["_fallback_title"] = f"AYM Bireysel Başvuru {app_no}"
        applicant = _first(_RE_BASVURUCU, text)
        if applicant:
            meta["applicant"] = applicant
        d = parse_tr_date(_first(_RE_KARAR_TARIHI, text))
        if d:
            meta["decision_date"] = d
        meta.update(_rg_meta(text))
        rights = self._extract_rights(soup, text)
        if rights:
            meta["rights"] = rights
        return meta

    @staticmethod
    def _extract_rights(soup: BeautifulSoup, text: str) -> list[dict[str, str]]:
        """Hak / sonuç tablosunu okur; tablo yoksa 'Hak:' etiketli satırlara düşer."""
        rights: list[dict[str, str]] = []
        for table in soup.find_all("table"):
            header = [clean_text(th.get_text(" ", strip=True)) for th in table.find_all("th")]
            if not any("hak" in h.lower() for h in header):
                continue
            for tr in table.find_all("tr"):
                cells = [clean_text(td.get_text(" ", strip=True)) for td in tr.find_all("td")]
                if not cells or not cells[0]:
                    continue
                row = {"right": cells[0]}
                for key, value in zip(header[1:], cells[1:], strict=False):
                    low = key.lower()
                    if "sonuç" in low:
                        row["outcome"] = value
                    elif "müdahale" in low or "iddia" in low:
                        row["claim"] = value
                    elif "giderim" in low:
                        row["remedy"] = value
                rights.append(row)
            if rights:
                return rights
        for m in re.finditer(r"^Hak(?:lar)?\s*[:\-]\s*(.+)$", text, re.IGNORECASE | re.MULTILINE):
            rights.append({"right": m.group(1).strip()})
        return rights
