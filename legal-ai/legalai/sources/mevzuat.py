"""Mevzuat Bilgi Sistemi (mevzuat.gov.tr) kaynak adaptörü.

Belge sayfası: ``https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&MevzuatTur=1&MevzuatTertip=5``
Metin PDF'i:   ``https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6098.pdf``  (biçim ``{Tur}.{Tertip}.{No}.pdf``)

Keşif (``discover``):
  * ``query`` boşsa ``well_known`` listesindeki temel kanunlar yayınlanır.
  * ``query`` "6098" gibi bir sayı ise doğrudan o kanunun referansı üretilir (Tertip 5 varsayılır; kanun
    ``well_known`` listesindeyse oradaki tür/tertip kullanılır).
  * ``query`` "1.5.6098" biçimindeyse (Tür.Tertip.No) verilen değerler kullanılır.
  * ``query`` serbest metin ise ``SourceError`` fırlatılır: Mevzuat için şimdilik kanun numarası ile arama
    destekleniyor. Sitenin arama ucunun (``/Arama`` POST gövdesi) kesin yapısı bilinmediği için uydurulmadı.
  * ``since`` / ``until`` bu kaynakta anlamsızdır ve yok sayılır (mevzuat tarihe göre listelenmez).

# DOĞRULAMA: 2026-11-02 itibarıyla canlı siteye karşı doğrulanmadı (bu ortamda gov.tr erişimi yok).
"""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import date
from typing import Any, ClassVar

from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.text import parse_tr_date, pdf_to_text, tr_upper

log = logging.getLogger(__name__)

# MevzuatTur kodları -> (okunur ad, belge türü). DOĞRULAMA gerekir; sitede yayımlanmış resmî liste yok.
MEVZUAT_TUR: dict[int, tuple[str, DocType]] = {
    1: ("Kanun", DocType.KANUN),
    2: ("Kanun Hükmünde Kararname", DocType.KHK),
    3: ("Tüzük", DocType.DIGER),
    4: ("Yönetmelik (Bakanlar Kurulu)", DocType.YONETMELIK),
    7: ("Yönetmelik (Kurum)", DocType.YONETMELIK),
    8: ("Tebliğ", DocType.TEBLIG),
    9: ("Cumhurbaşkanlığı Kararnamesi", DocType.CB_KARARNAMESI),
    19: ("Cumhurbaşkanı Kararı", DocType.CB_KARARI),
    20: ("Cumhurbaşkanlığı Yönetmeliği", DocType.YONETMELIK),
    21: ("Cumhurbaşkanlığı Genelgesi", DocType.GENELGE),
}

_NUMERIC_RE = re.compile(r"^\s*(\d{1,6})\s*$")
_TRIPLE_RE = re.compile(r"^\s*(\d{1,3})\.(\d{1,2})\.(\d{1,6})\s*$")
_KANUN_NO_RE = re.compile(r"Kanun\s+Numaras[ıi]\s*:?\s*(\d{1,6})")
_KABUL_RE = re.compile(r"Kabul\s+Tarihi\s*:?\s*([\d/.]{8,10})")
_RG_RE = re.compile(r"Resm[îi]\s+Gazete\s*:?\s*Tarih\s*:?\s*([\d/.]{8,10})\s*Say[ıi]\s*:?\s*(\d{3,6})")
_UPPER_LETTERS = re.compile(r"[A-ZÇĞİÖŞÜ]{3,}")


@dataclass(frozen=True)
class WellKnownLaw:
    no: int
    title: str
    short: str
    tur: int = 1
    tertip: int = 5


class MevzuatSource(BaseSource):
    """mevzuat.gov.tr üzerinden kanun ve diğer mevzuat metinleri (PDF)."""

    source_id: ClassVar[SourceId] = SourceId.MEVZUAT
    display_name: ClassVar[str] = "Mevzuat Bilgi Sistemi"
    base_url: ClassVar[str] = "https://www.mevzuat.gov.tr"
    min_interval: ClassVar[float] = 1.5
    concurrency: ClassVar[int] = 1

    #: Sık kullanılan temel kanunlar. ``discover(query=None)`` bu listeyi yayınlar.
    well_known: ClassVar[tuple[WellKnownLaw, ...]] = (
        WellKnownLaw(2709, "Türkiye Cumhuriyeti Anayasası", "Anayasa"),
        WellKnownLaw(6098, "Türk Borçlar Kanunu", "TBK"),
        WellKnownLaw(4721, "Türk Medenî Kanunu", "TMK"),
        WellKnownLaw(5237, "Türk Ceza Kanunu", "TCK"),
        WellKnownLaw(5271, "Ceza Muhakemesi Kanunu", "CMK"),
        WellKnownLaw(6100, "Hukuk Muhakemeleri Kanunu", "HMK"),
        WellKnownLaw(2004, "İcra ve İflas Kanunu", "İİK"),
        WellKnownLaw(6102, "Türk Ticaret Kanunu", "TTK"),
        WellKnownLaw(4857, "İş Kanunu", "İş K."),
        WellKnownLaw(6698, "Kişisel Verilerin Korunması Kanunu", "KVKK"),
        WellKnownLaw(6502, "Tüketicinin Korunması Hakkında Kanun", "TKHK"),
        WellKnownLaw(7201, "Tebligat Kanunu", "Tebligat K."),
        WellKnownLaw(2577, "İdari Yargılama Usulü Kanunu", "İYUK"),
        WellKnownLaw(5018, "Kamu Malî Yönetimi ve Kontrol Kanunu", "KMYKK"),
        WellKnownLaw(213, "Vergi Usul Kanunu", "VUK"),
        WellKnownLaw(3065, "Katma Değer Vergisi Kanunu", "KDVK"),
        WellKnownLaw(193, "Gelir Vergisi Kanunu", "GVK"),
        WellKnownLaw(5520, "Kurumlar Vergisi Kanunu", "KVK"),
        WellKnownLaw(4054, "Rekabetin Korunması Hakkında Kanun", "RKHK"),
        WellKnownLaw(5510, "Sosyal Sigortalar ve Genel Sağlık Sigortası Kanunu", "SSGSS"),
    )

    # ---- adres yardımcıları ------------------------------------------------------------------

    def page_url(self, tur: int, tertip: int, no: int) -> str:
        return f"{self.base_url}/mevzuat?MevzuatNo={no}&MevzuatTur={tur}&MevzuatTertip={tertip}"

    def pdf_url(self, tur: int, tertip: int, no: int) -> str:
        return f"{self.base_url}/MevzuatMetin/{tur}.{tertip}.{no}.pdf"

    @classmethod
    def well_known_by_no(cls, no: int) -> WellKnownLaw | None:
        return next((law for law in cls.well_known if law.no == no), None)

    def make_ref(self, no: int, tur: int = 1, tertip: int = 5, title: str | None = None) -> DocRef:
        known = self.well_known_by_no(no) if tur == 1 else None
        if known and title is None:
            title = known.title
        return DocRef(
            source=self.source_id,
            external_id=f"{tur}.{tertip}.{no}",
            url=self.page_url(tur, tertip, no),
            title=title,
            extra={
                "mevzuat_no": no,
                "mevzuat_tur": tur,
                "mevzuat_tertip": tertip,
                "pdf_url": self.pdf_url(tur, tertip, no),
            },
        )

    # ---- keşif --------------------------------------------------------------------------------

    async def discover(
        self,
        since: date | None = None,
        until: date | None = None,
        query: str | None = None,
        limit: int | None = None,
    ) -> AsyncIterator[DocRef]:
        """Bkz. modül docstring'i. Serbest metin ``query`` için ``SourceError`` fırlatır."""
        refs: list[DocRef]
        if query is None or not query.strip():
            refs = [self.make_ref(law.no, law.tur, law.tertip, law.title) for law in self.well_known]
        else:
            refs = [self._ref_from_query(query)]

        for i, ref in enumerate(refs):
            if limit is not None and i >= limit:
                return
            yield ref

    def _ref_from_query(self, query: str) -> DocRef:
        m = _TRIPLE_RE.match(query)
        if m:
            tur, tertip, no = (int(g) for g in m.groups())
            return self.make_ref(no, tur, tertip)
        m = _NUMERIC_RE.match(query)
        if m:
            no = int(m.group(1))
            known = self.well_known_by_no(no)
            if known:
                return self.make_ref(no, known.tur, known.tertip, known.title)
            return self.make_ref(no, 1, 5)
        raise SourceError(
            "Mevzuat için şimdilik kanun numarası ile arama destekleniyor "
            f"(örn. '6098' ya da '1.5.6098'); alınan sorgu: {query!r}"
        )

    # ---- belge -------------------------------------------------------------------------------

    async def fetch(self, ref: DocRef) -> Document:
        tur, tertip, no = self._ids_from_ref(ref)
        pdf_url = ref.extra.get("pdf_url") or self.pdf_url(tur, tertip, no)

        resp = await self.get(pdf_url)
        data = resp.content
        if data[:5] != b"%PDF-":
            raise SourceError(f"Mevzuat PDF beklenen biçimde değil (PDF başlığı yok): {pdf_url}")
        text = pdf_to_text(data)
        if not text.strip():
            raise SourceError(f"Mevzuat PDF metni boş ya da çıkarılamadı: {pdf_url}")

        tur_name, doc_type = MEVZUAT_TUR.get(tur, (f"Tür {tur}", DocType.DIGER))
        known = self.well_known_by_no(no) if tur == 1 else None
        title = ref.title or (known.title if known else None) or _title_from_text(text) or f"{tur_name} {no}"

        head = text[:3000]
        m_rg = _RG_RE.search(head)
        rg_issue = m_rg.group(2) if m_rg else None
        published_at = parse_tr_date(m_rg.group(1)) if m_rg else None
        m_kabul = _KABUL_RE.search(head)
        kabul = parse_tr_date(m_kabul.group(1)) if m_kabul else None
        m_no = _KANUN_NO_RE.search(head)
        if m_no and m_no.group(1) != str(no):
            log.warning(
                "Mevzuat %s: PDF içindeki kanun numarası (%s) beklenenle uyuşmuyor",
                ref.external_id,
                m_no.group(1),
            )

        metadata: dict[str, Any] = {
            "pdf_url": pdf_url,
            "mevzuat_no": no,
            "mevzuat_tur": tur,
            "mevzuat_tur_adi": tur_name,
            "mevzuat_tertip": tertip,
        }
        if known:
            metadata["short_title"] = known.short
        if kabul:
            metadata["kabul_tarihi"] = kabul.isoformat()

        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=title,
            doc_type=doc_type,
            text=text,
            published_at=published_at,
            law_no=str(no),
            rg_issue=rg_issue,
            metadata=metadata,
        )

    def _ids_from_ref(self, ref: DocRef) -> tuple[int, int, int]:
        extra = ref.extra
        if all(k in extra for k in ("mevzuat_tur", "mevzuat_tertip", "mevzuat_no")):
            return int(extra["mevzuat_tur"]), int(extra["mevzuat_tertip"]), int(extra["mevzuat_no"])
        m = _TRIPLE_RE.match(ref.external_id)
        if m:
            tur, tertip, no = (int(g) for g in m.groups())
            return tur, tertip, no
        raise SourceError(f"Mevzuat referansından tür/tertip/no çıkarılamadı: {ref.external_id!r}")


def _title_from_text(text: str) -> str | None:
    """PDF'in ilk satırlarındaki büyük harfli ilk anlamlı satır (örn. 'TÜRK BORÇLAR KANUNU')."""
    for line in text.split("\n")[:40]:
        line = line.strip()
        if len(line) < 6 or line.isdigit() or not _UPPER_LETTERS.search(line):
            continue
        if line == tr_upper(line) and len(line.split()) >= 2:
            return line[:300]
    return None
