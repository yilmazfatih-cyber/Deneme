# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı
"""Kişisel Verileri Koruma Kurulu karar özetleri.

* Liste: ``https://www.kvkk.gov.tr/Icerik/5406/Kurul-Karar-Ozetleri`` — sayfalama query string ile
  (``?page=N`` varsayıldı; `page_param` ile değiştirilebilir). Her öğe ``/Icerik/<id>/<slug>``
  bağlantısı taşır; öğe metninde "Karar Tarihi: dd/mm/yyyy, Karar No: 2023/123" ve konu başlığı bulunur.
  Bazı başlıklar "... 05/01/2023 tarihli ve 2023/4 sayılı Karar Özeti" biçimindedir; ikisi de anlaşılır.
* Belge: aynı ``/Icerik/<id>/<slug>`` sayfasının HTML'i.

`discover(since, until, query)`: liste yeniden-eskiye sıralıdır; `since` verilmişse sayfadaki tüm
kararlar `since`'ten eskiyse tarama durur. `query` verilirse başlıkta (Türkçe katlanmış) alt dize eşlemesi.
"""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, ClassVar

from bs4 import BeautifulSoup, Tag

from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.text import clean_text, fold_tr, html_to_text, parse_tr_date

_DATE = r"(\d{1,2}[./]\d{1,2}[./]\d{4})"
_NO = r"(\d{4}/\d+)"
_RE_LINK = re.compile(r"/Icerik/(\d+)(?:/|$)", re.IGNORECASE)
_RE_KARAR_TARIHI = re.compile(r"Karar\s*Tarihi\s*[:\-]?\s*" + _DATE, re.IGNORECASE)
_RE_KARAR_NO = re.compile(r"Karar\s*(?:No|Numarası|Sayısı)\s*[:\-]?\s*" + _NO, re.IGNORECASE)
_RE_TARIHLI_SAYILI = re.compile(_DATE + r"\s*tarihli\s*ve\s*" + _NO + r"\s*sayılı", re.IGNORECASE)
_RE_META_PREFIX = re.compile(
    r"^\s*(?:Karar\s*Tarihi\s*[:\-]?\s*[\d./]+\s*[,;]?\s*)?(?:Karar\s*No\s*[:\-]?\s*\d{4}/\d+\s*[,;]?\s*)?",
    re.IGNORECASE,
)


def _item_container(anchor: Tag) -> Tag:
    """Bağlantıyı saran, başka içerik bağlantısı içermeyen en geniş kapsayıcı."""
    node: Tag = anchor
    for _ in range(6):
        parent = node.parent
        if parent is None or not isinstance(parent, Tag) or parent.name in ("body", "html", "[document]"):
            break
        ids = {m.group(1) for a in parent.find_all("a", href=True) if (m := _RE_LINK.search(str(a["href"])))}
        if len(ids) > 1:
            break
        node = parent
    return node


def _decision_meta(text: str) -> tuple[date | None, str | None]:
    d = parse_tr_date(_first(_RE_KARAR_TARIHI, text))
    no = _first(_RE_KARAR_NO, text)
    if d is None or no is None:
        m = _RE_TARIHLI_SAYILI.search(text)
        if m:
            d = d or parse_tr_date(m.group(1))
            no = no or m.group(2)
    return d, no


def _first(pattern: re.Pattern[str], text: str) -> str | None:
    m = pattern.search(text)
    return m.group(1).strip() if m else None


class KvkkSource(BaseSource):
    """KVKK Kurul karar özetleri."""

    source_id = SourceId.KVKK
    display_name = "Kişisel Verileri Koruma Kurulu"
    base_url = "https://www.kvkk.gov.tr"
    list_path: ClassVar[str] = "/Icerik/5406/Kurul-Karar-Ozetleri"
    list_id: ClassVar[str] = "5406"
    page_param: ClassVar[str] = "page"
    court: ClassVar[str] = "Kişisel Verileri Koruma Kurulu"
    min_interval: ClassVar[float] = 1.5
    max_pages: ClassVar[int] = 200

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
            params = {self.page_param: page} if page > 1 else None
            resp = await self.get(f"{self.base_url}{self.list_path}", params=params)
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
        if not anchors and page == 1:
            raise SourceError(f"{self.display_name}: liste sayfasında /Icerik/ bağlantısı bulunamadı")

        refs: list[DocRef] = []
        seen: set[str] = set()
        for a in anchors:
            m = _RE_LINK.search(str(a["href"]))
            assert m is not None
            cid = m.group(1)
            if cid == self.list_id or cid in seen:
                continue
            container = _item_container(a)
            text = clean_text(container.get_text(" ", strip=True))
            d, no = _decision_meta(text)
            if d is None and no is None:
                continue  # menü / duyuru bağlantısı; karar değil
            seen.add(cid)
            link_text = clean_text(a.get_text(" ", strip=True))
            title = link_text or _RE_META_PREFIX.sub("", text, count=1).strip() or f"KVKK Kurul Kararı {no}"
            href = str(a["href"])
            url = (
                href
                if href.startswith("http")
                else f"{self.base_url}{href if href.startswith('/') else '/' + href}"
            )
            extra: dict[str, Any] = {}
            if no:
                extra["decision_no"] = no
            refs.append(
                DocRef(
                    source=self.source_id, external_id=cid, url=url, title=title, published_at=d, extra=extra
                )
            )

        has_next = any(
            re.search(rf"[?&]{re.escape(self.page_param)}={page + 1}\b", str(a["href"]))
            for a in soup.find_all("a", href=True)
        )
        return refs, has_next

    # ---- belge ---------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        resp = await self.get(str(ref.url))
        html = resp.text
        soup = BeautifulSoup(html, "lxml")
        body = None
        for sel in ("#icerik", ".icerik", ".content-detail", ".page-content", "article", "main", ".content"):
            body = soup.select_one(sel)
            if body and len(body.get_text(strip=True)) > 80:
                break
            body = None
        text = html_to_text(str(body)) if body else html_to_text(html)
        if len(text) < 60:
            raise SourceError(
                f"{self.display_name}: {ref.url} karar metni alınamadı (sayfa boş ya da yapı değişti)"
            )

        title = ref.title or ""
        for sel in ("h1", "h2", ".icerik-baslik", ".page-title", "title"):
            node = soup.select_one(sel)
            if node and clean_text(node.get_text(" ", strip=True)):
                title = clean_text(node.get_text(" ", strip=True))
                break
        d, no = _decision_meta(text)
        if d is None and no is None:
            d, no = _decision_meta(title)
        decision_date = d or ref.published_at
        decision_no = no or ref.extra.get("decision_no")
        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title or f"KVKK Kurul Kararı {decision_no or ref.external_id}",
            doc_type=DocType.KURUL_KARARI,
            text=text,
            published_at=decision_date,
            decision_date=decision_date,
            court=self.court,
            decision_no=decision_no,
            metadata={"content_id": ref.external_id},
        )
