"""Yargıtay / Danıştay / UYAP Emsal "karararama" ailesi için ortak taban sınıf.

Üç site de aynı yazılım ailesinden türeyen bir JSON API kullanır:

  * Arama:  ``POST {base}/aramalist`` — gövde ``{"data": {"arananKelime": ..., "pageSize": N, "pageNumber": K, ...}}``
            yanıt   ``{"data": {"data": [ {...}, ... ], "recordsTotal": T, ...}, "metadata": {"FMTY": "SUCCESS"}}``
  * Belge:  ``GET {base}/getDokuman?id=<id>`` — yanıt ``{"data": "<html>...</html>", "metadata": {...}}``

Alt sınıflar yalnızca ``source_id``, ``base_url``, arama gövdesinin ek alanları ve mahkeme adı
biçimlendirmesini belirler. Alan adları siteden siteye (ve sürümden sürüme) oynayabildiği için
ayrıştırıcı birden fazla anahtar dener; beklenen yapı hiç yoksa ``SourceError`` fırlatır.

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import AsyncIterator
from datetime import date
from typing import Any, ClassVar

from legalai.models import DocRef, DocType, Document
from legalai.sources.base import BaseSource, SourceError
from legalai.text import clean_text, html_to_text, parse_tr_date

log = logging.getLogger(__name__)

# Arama sonucu öğelerinde denenecek alternatif anahtarlar (öncelik sırasıyla).
_ID_KEYS = ("id", "kararId", "dokumanId", "documentId")
_COURT_KEYS = ("daire", "birim", "birimAdi", "mahkeme", "mahkemeAdi", "kurul", "daireAdi")
_CASE_KEYS = ("esasNo", "esas", "esasNumarasi")
_DECISION_NO_KEYS = ("kararNo", "karar", "kararNumarasi")
_DATE_KEYS = ("kararTarihi", "kararTarih", "tarih", "kararTarihiStr")

# Belge HTML'inde üst bilgi satırlarından meta çıkarmak için yedek desenler.
_RE_CASE = re.compile(r"Esas\s*(?:No|Numarası)?\s*[:：]\s*(\d{4}\s*/\s*\d+)", re.IGNORECASE)
_RE_DECISION = re.compile(r"Karar\s*(?:No|Numarası)?\s*[:：]\s*(\d{4}\s*/\s*\d+)", re.IGNORECASE)
_RE_DATE = re.compile(r"(?:Karar\s*)?Tarih[i]?\s*[:：]\s*(\d{1,2}[./]\d{1,2}[./]\d{4})", re.IGNORECASE)


def _pick(item: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    """Sözlükten ilk dolu anahtarı metin olarak döndürür."""
    for key in keys:
        value = item.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def _fmt_tr_date(value: date | None) -> str:
    """``date`` -> ``dd.MM.yyyy``; boşsa boş dize (API boş alanı tolere eder)."""
    return value.strftime("%d.%m.%Y") if value else ""


class KararAramaSource(BaseSource):
    """Ortak taban. Alt sınıflar `source_id`, `display_name`, `base_url` ve gerekirse
    `extra_search_fields` / `format_court` tanımlar."""

    search_path: ClassVar[str] = "/aramalist"
    document_path: ClassVar[str] = "/getDokuman"
    page_size: ClassVar[int] = 20
    #: Sonsuz döngüye karşı emniyet: en fazla kaç sayfa çekilir.
    max_pages: ClassVar[int] = 500
    #: Mahkeme adının başına eklenecek kurum adı ("Yargıtay", "Danıştay"); boşsa eklenmez.
    court_prefix: ClassVar[str] = ""
    #: Arama gövdesine eklenecek, siteye özgü sabit alanlar.
    extra_search_fields: ClassVar[dict[str, Any]] = {}

    def __init__(self, http: Any = None) -> None:
        super().__init__(http=http)
        self._session_ready = False

    # ---- oturum ----------------------------------------------------------------------

    async def _ensure_session(self) -> None:
        """İlk istekten önce ana sayfaya GET atıp oturum çerezini alır. Başarısızlık ölümcül değildir;
        asıl istek yine denenir (bazı sürümler çerez istemez)."""
        if self._session_ready:
            return
        try:
            await self.get(self.base_url + "/")
        except SourceError as exc:
            log.warning("%s: ana sayfa alınamadı, çerezsiz devam ediliyor (%s)", self.display_name, exc)
        self._session_ready = True

    # ---- alt sınıfların özelleştirebileceği noktalar ---------------------------------------

    def build_search_body(
        self, query: str, page: int, since: date | None, until: date | None
    ) -> dict[str, Any]:
        """``aramalist`` gövdesi. Alt sınıf `extra_search_fields` ile alan ekler; gerekirse bu
        yöntemi ezer."""
        data: dict[str, Any] = {
            "arananKelime": query,
            **self.extra_search_fields,
            "baslangicTarihi": _fmt_tr_date(since),
            "bitisTarihi": _fmt_tr_date(until),
            "pageSize": self.page_size,
            "pageNumber": page,
        }
        return {"data": data}

    def format_court(self, raw: str | None) -> str | None:
        """Ham daire/birim adını kullanıcıya gösterilecek mahkeme adına çevirir."""
        if not raw:
            return self.court_prefix or None
        raw = clean_text(raw)
        if not self.court_prefix or raw.lower().startswith(self.court_prefix.lower()):
            return raw
        return f"{self.court_prefix} {raw}"

    # ---- discover --------------------------------------------------------------------------

    def document_url(self, external_id: str) -> str:
        return f"{self.base_url}{self.document_path}?id={external_id}"

    async def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        if not query or not query.strip():
            raise SourceError(f"{self.display_name} için arama terimi gerekir")
        query = query.strip()
        await self._ensure_session()

        produced = 0
        seen: set[str] = set()
        total: int | None = None
        for page in range(1, self.max_pages + 1):
            if limit is not None and produced >= limit:
                return
            items, total = await self._search_page(query, page, since, until)
            if not items:
                return
            for item in items:
                ref = self._item_to_ref(item)
                if ref is None or ref.external_id in seen:
                    continue
                seen.add(ref.external_id)
                yield ref
                produced += 1
                if limit is not None and produced >= limit:
                    return
            # Son sayfa: toplamı biliyorsak ona göre, bilmiyorsak eksik sayfaya göre dur.
            if total is not None and page * self.page_size >= total:
                return
            if total is None and len(items) < self.page_size:
                return

    async def _search_page(
        self, query: str, page: int, since: date | None, until: date | None
    ) -> tuple[list[dict[str, Any]], int | None]:
        url = self.base_url + self.search_path
        body = self.build_search_body(query, page, since, until)
        resp = await self.post(
            url,
            json=body,
            headers={
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": self.base_url + "/",
            },
        )
        try:
            payload = resp.json()
        except (json.JSONDecodeError, ValueError) as exc:
            raise SourceError(f"{self.display_name} arama yanıtı JSON değil: {url}") from exc
        return self._parse_search_payload(payload)

    def _parse_search_payload(self, payload: Any) -> tuple[list[dict[str, Any]], int | None]:
        """``{"data": {"data": [...], "recordsTotal": N}}`` ve varyantlarını ayrıştırır."""
        if not isinstance(payload, dict):
            raise SourceError(f"{self.display_name} arama yanıtı beklenen yapıda değil (sözlük değil)")
        self._check_metadata(payload)
        data = payload.get("data")
        total: int | None = None
        items: Any
        if isinstance(data, dict):
            items = data.get("data")
            if items is None:
                items = data.get("kararlar") or data.get("results") or data.get("list")
            for key in ("recordsTotal", "recordsFiltered", "total", "toplam"):
                if isinstance(data.get(key), int):
                    total = int(data[key])
                    break
        elif isinstance(data, list):
            items = data
        else:
            items = payload.get("kararlar") or payload.get("results")
        if items is None:
            raise SourceError(
                f"{self.display_name} arama yanıtında sonuç listesi bulunamadı "
                f"(anahtarlar: {sorted(payload)[:8]})"
            )
        if not isinstance(items, list):
            raise SourceError(f"{self.display_name} arama yanıtında sonuç listesi liste değil")
        return [i for i in items if isinstance(i, dict)], total

    def _check_metadata(self, payload: dict[str, Any]) -> None:
        meta = payload.get("metadata")
        if isinstance(meta, dict):
            status = str(meta.get("FMTY") or meta.get("status") or "").upper()
            if status and status != "SUCCESS":
                msg = meta.get("FMTE") or meta.get("message") or status
                raise SourceError(f"{self.display_name} API hata döndürdü: {msg}")

    def _item_to_ref(self, item: dict[str, Any]) -> DocRef | None:
        external_id = _pick(item, _ID_KEYS)
        if not external_id:
            log.debug("%s: kimliksiz sonuç atlandı: %s", self.display_name, item)
            return None
        court = self.format_court(_pick(item, _COURT_KEYS))
        case_no = _pick(item, _CASE_KEYS)
        decision_no = _pick(item, _DECISION_NO_KEYS)
        date_str = _pick(item, _DATE_KEYS)
        decision_date = parse_tr_date(date_str)
        title = self._make_title(court, case_no, decision_no, decision_date)
        extra: dict[str, Any] = {
            "court": court,
            "case_no": case_no,
            "decision_no": decision_no,
            "decision_date": decision_date.isoformat() if decision_date else date_str,
        }
        return DocRef(
            source=self.source_id,
            external_id=external_id,
            url=self.document_url(external_id),
            title=title,
            published_at=decision_date,
            extra=extra,
        )

    @staticmethod
    def _make_title(
        court: str | None, case_no: str | None, decision_no: str | None, decision_date: date | None
    ) -> str:
        parts: list[str] = []
        if court:
            parts.append(court)
        if case_no:
            parts.append(f"E. {case_no}")
        if decision_no:
            parts.append(f"K. {decision_no}")
        if decision_date:
            parts.append(f"T. {decision_date.strftime('%d.%m.%Y')}")
        return " ".join(parts) or "Karar"

    # ---- fetch -----------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        await self._ensure_session()
        url = self.document_url(ref.external_id)
        resp = await self.get(
            url,
            headers={"Accept": "application/json, text/plain, */*", "Referer": self.base_url + "/"},
        )
        html = self._extract_document_html(resp.text, url)
        text = html_to_text(html)
        if not text:
            raise SourceError(f"{self.display_name} belgesi boş geldi: {url}")

        court = ref.extra.get("court") or None
        case_no = ref.extra.get("case_no") or None
        decision_no = ref.extra.get("decision_no") or None
        decision_date = parse_tr_date(ref.extra.get("decision_date")) or ref.published_at

        # Keşifte meta eksik kaldıysa belge metninin başından tamamla.
        head = text[:1500]
        if not case_no and (m := _RE_CASE.search(head)):
            case_no = m.group(1).replace(" ", "")
        if not decision_no and (m := _RE_DECISION.search(head)):
            decision_no = m.group(1).replace(" ", "")
        if not decision_date and (m := _RE_DATE.search(head)):
            decision_date = parse_tr_date(m.group(1))
        if not court:
            court = self.format_court(None)

        title = self._make_title(court, case_no, decision_no, decision_date)
        metadata = {
            k: v
            for k, v in ref.extra.items()
            if k not in {"court", "case_no", "decision_no", "decision_date"}
        }
        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title,
            doc_type=DocType.MAHKEME_KARARI,
            text=text,
            published_at=decision_date,
            decision_date=decision_date,
            court=court,
            case_no=case_no,
            decision_no=decision_no,
            metadata=metadata,
        )

    def _extract_document_html(self, raw: str, url: str) -> str:
        """``getDokuman`` yanıtından HTML'i çıkarır. ``data`` düz metin olabilir, ``{"icerik": ...}``
        gibi iç sözlük olabilir; JSON değilse yanıtın kendisi HTML kabul edilir."""
        stripped = raw.strip()
        if not stripped:
            raise SourceError(f"{self.display_name} belge yanıtı boş: {url}")
        try:
            payload = json.loads(stripped)
        except (json.JSONDecodeError, ValueError):
            if "<" in stripped[:200]:
                return stripped
            raise SourceError(f"{self.display_name} belge yanıtı ne JSON ne HTML: {url}") from None
        if isinstance(payload, str):
            return payload
        if not isinstance(payload, dict):
            raise SourceError(f"{self.display_name} belge yanıtı beklenen yapıda değil: {url}")
        self._check_metadata(payload)
        data = payload.get("data")
        if isinstance(data, str) and data.strip():
            return data
        if isinstance(data, dict):
            for key in ("icerik", "html", "content", "dokuman", "data", "text"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value
        for key in ("icerik", "html", "content"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value
        raise SourceError(f"{self.display_name} belge yanıtında içerik bulunamadı: {url}")
