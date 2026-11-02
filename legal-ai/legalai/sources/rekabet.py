# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı
"""Rekabet Kurulu kararları.

* Liste: ``https://www.rekabet.gov.tr/tr/Kararlar`` (filtre: karar türü, tarih; sayfalama query string
  ile — ``?page=N`` varsayıldı, `page_param` ile değiştirilebilir). Her öğe ``/Karar?kararId=<guid>``
  bağlantısı taşır; öğe metninde karar sayısı ("23-45/678-234"), karar tarihi ve konu bulunur.
* Belge: ``/Karar?kararId=<guid>`` HTML sayfası; içinde ``/Dosya/...pdf`` bağlantısı. PDF indirilip
  `pdf_to_text` ile okunur; PDF yoksa ya da boş çıkarsa HTML metni kullanılır. `Document.url` HTML
  sayfasını gösterir, PDF adresi `metadata["pdf_url"]` alanındadır.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, ClassVar
from urllib.parse import parse_qs, urljoin, urlparse

from bs4 import BeautifulSoup, Tag

from legalai import text as textmod
from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.text import clean_text, fold_tr, html_to_text, parse_tr_date

_DATE = r"(\d{1,2}[./]\d{1,2}[./]\d{4})"
_RE_LINK = re.compile(r"kararId=([0-9a-fA-F-]{8,})", re.IGNORECASE)
_RE_KARAR_NO = re.compile(r"(\d{2}-\d{1,3}/\d{1,5}-(?:M\(\d+\)|\d{1,5}))")
_RE_KARAR_TARIHI = re.compile(r"Karar\s*Tarihi\s*[:\-]?\s*" + _DATE, re.IGNORECASE)
_RE_ANY_DATE = re.compile(_DATE)
_RE_PDF = re.compile(r"\.pdf(?:$|[?#])|/Dosya/", re.IGNORECASE)


def _item_container(anchor: Tag) -> Tag:
    """Bağlantıyı saran, başka karar bağlantısı içermeyen en geniş kapsayıcı."""
    node: Tag = anchor
    for _ in range(6):
        parent = node.parent
        if parent is None or not isinstance(parent, Tag) or parent.name in ("body", "html", "[document]"):
            break
        ids = {
            m.group(1).lower()
            for a in parent.find_all("a", href=True)
            if (m := _RE_LINK.search(str(a["href"])))
        }
        if len(ids) > 1:
            break
        node = parent
    return node


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    m = pattern.search(text)
    return m.group(1).strip() if m else None


class RekabetSource(BaseSource):
    """Rekabet Kurulu kararları (liste HTML, karar PDF)."""

    source_id = SourceId.REKABET
    display_name = "Rekabet Kurulu"
    base_url = "https://www.rekabet.gov.tr"
    list_path: ClassVar[str] = "/tr/Kararlar"
    page_param: ClassVar[str] = "page"
    court: ClassVar[str] = "Rekabet Kurulu"
    min_interval: ClassVar[float] = 1.5
    max_pages: ClassVar[int] = 500

    # ---- keşif ---------------------------------------------------------------------------

    async def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        needle = fold_tr(query.strip()) if query and query.strip() else None
        seen: set[str] = set()
        produced = 0
        for page in range(1, self.max_pages + 1):
            params: dict[str, Any] = {}
            if page > 1:
                params[self.page_param] = page
            if since:
                params["baslangicTarihi"] = since.strftime("%d.%m.%Y")
            if until:
                params["bitisTarihi"] = until.strftime("%d.%m.%Y")
            resp = await self.get(f"{self.base_url}{self.list_path}", params=params or None)
            items, has_next = self._parse_list(resp.text, page)
            if not items:
                return
            all_older = True
            for ref in items:
                if ref.external_id in seen:
                    continue
                seen.add(ref.external_id)
                d = ref.published_at
                if d is None or since is None or d >= since:
                    all_older = False
                if d is not None and ((since and d < since) or (until and d > until)):
                    continue
                if needle and needle not in fold_tr(ref.title or ""):
                    continue
                yield ref
                produced += 1
                if limit is not None and produced >= limit:
                    return
            if (since and all_older) or not has_next:
                return

    def _parse_list(self, html: str, page: int) -> tuple[list[DocRef], bool]:
        soup = BeautifulSoup(html, "lxml")
        anchors = [a for a in soup.find_all("a", href=True) if _RE_LINK.search(str(a["href"]))]
        if not anchors:
            if page == 1 and "karar" not in html.lower():
                raise SourceError(f"{self.display_name}: liste sayfasında kararId bağlantısı bulunamadı")
            return [], False

        refs: list[DocRef] = []
        seen: set[str] = set()
        for a in anchors:
            m = _RE_LINK.search(str(a["href"]))
            assert m is not None
            karar_id = m.group(1).lower()
            if karar_id in seen:
                continue
            seen.add(karar_id)
            container = _item_container(a)
            text = clean_text(container.get_text(" ", strip=True))
            no = _first(_RE_KARAR_NO, text)
            d = parse_tr_date(_first(_RE_KARAR_TARIHI, text) or _first(_RE_ANY_DATE, text))
            link_text = clean_text(a.get_text(" ", strip=True))
            title = link_text or self._title_from_text(text, no) or f"Rekabet Kurulu Kararı {no or karar_id}"
            extra: dict[str, Any] = {}
            if no:
                extra["decision_no"] = no
            kind = self._decision_kind(container)
            if kind:
                extra["decision_kind"] = kind
            refs.append(
                DocRef(
                    source=self.source_id,
                    external_id=karar_id,
                    url=f"{self.base_url}/Karar?kararId={karar_id}",
                    title=title,
                    published_at=d,
                    extra=extra,
                )
            )

        has_next = any(
            re.search(rf"[?&]{re.escape(self.page_param)}={page + 1}\b", str(a["href"]))
            for a in soup.find_all("a", href=True)
        )
        return refs, has_next

    @staticmethod
    def _title_from_text(text: str, no: str | None) -> str | None:
        t = _RE_ANY_DATE.sub("", text)
        if no:
            t = t.replace(no, "")
        t = re.sub(r"Karar\s*(?:Sayısı|Tarihi|Türü)\s*[:\-]?", "", t, flags=re.IGNORECASE)
        t = clean_text(re.sub(r"\s{2,}", " ", t)).strip(" ,;:-")
        return t or None

    @staticmethod
    def _decision_kind(container: Tag) -> str | None:
        text = container.get_text(" ", strip=True)
        m = re.search(
            r"Karar\s*Türü\s*[:\-]?\s*([^\n|]+?)(?:\s{2,}|$|Karar\s*(?:Sayısı|Tarihi))", text, re.IGNORECASE
        )
        if m:
            return clean_text(m.group(1)).strip(" ,;") or None
        for kind in ("Birleşme ve Devralma", "Rekabet İhlali", "Menfi Tespit", "Muafiyet", "Özelleştirme"):
            if kind.lower() in text.lower():
                return kind
        return None

    # ---- belge ---------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        page = await self.get(str(ref.url))
        html = page.text
        soup = BeautifulSoup(html, "lxml")
        page_text = html_to_text(html)

        pdf_url = self._find_pdf_url(soup, str(ref.url))
        text = ""
        if pdf_url:
            pdf_resp = await self.get(pdf_url)
            data = pdf_resp.content
            if data[:5] == b"%PDF-" or "pdf" in pdf_resp.headers.get("content-type", "").lower():
                try:
                    text = textmod.pdf_to_text(data)
                except Exception as exc:  # noqa: BLE001 — pypdf çeşitli hatalar fırlatır; HTML metnine düş
                    text = ""
                    pdf_error = str(exc)
                else:
                    pdf_error = None
            else:
                pdf_error = "indirilen dosya PDF değil"
        else:
            pdf_error = None
        source_kind = "pdf" if text.strip() else "html"
        if not text.strip():
            text = page_text
        if len(text.strip()) < 60:
            raise SourceError(f"{self.display_name}: {ref.url} için ne PDF ne HTML metni alınabildi")

        title = ref.title or ""
        for sel in ("h1", "h2", ".karar-baslik", ".page-title", "title"):
            node = soup.select_one(sel)
            if node and clean_text(node.get_text(" ", strip=True)):
                title = clean_text(node.get_text(" ", strip=True))
                break
        decision_no = (
            _first(_RE_KARAR_NO, page_text) or ref.extra.get("decision_no") or _first(_RE_KARAR_NO, text)
        )
        decision_date = (
            parse_tr_date(_first(_RE_KARAR_TARIHI, page_text))
            or ref.published_at
            or parse_tr_date(_first(_RE_KARAR_TARIHI, text))
        )
        metadata: dict[str, Any] = {"text_source": source_kind}
        if pdf_url:
            metadata["pdf_url"] = pdf_url
        if pdf_error:
            metadata["pdf_error"] = pdf_error
        if ref.extra.get("decision_kind"):
            metadata["decision_kind"] = ref.extra["decision_kind"]
        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title or f"Rekabet Kurulu Kararı {decision_no or ref.external_id}",
            doc_type=DocType.KURUL_KARARI,
            text=text,
            published_at=decision_date,
            decision_date=decision_date,
            court=self.court,
            decision_no=decision_no,
            metadata=metadata,
        )

    @staticmethod
    def _find_pdf_url(soup: BeautifulSoup, page_url: str) -> str | None:
        for a in soup.find_all("a", href=True):
            href = str(a["href"])
            if _RE_PDF.search(href):
                return urljoin(page_url, href)
        for node in soup.find_all(["iframe", "embed", "object"]):
            src = node.get("src") or node.get("data")
            if src and _RE_PDF.search(str(src)):
                return urljoin(page_url, str(src))
        return None


def karar_id_from_url(url: str) -> str | None:
    """`https://www.rekabet.gov.tr/Karar?kararId=<guid>` adresinden kararId'yi çıkarır."""
    qs = parse_qs(urlparse(url).query)
    values = qs.get("kararId") or qs.get("kararid")
    return values[0].lower() if values else None
