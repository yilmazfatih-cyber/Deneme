"""Ortak veri modeli. Tüm kaynak adaptörleri bu tipleri üretir; veritabanı ve RAG bu tipleri tüketir."""

from __future__ import annotations

import hashlib
from datetime import UTC, date, datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field, HttpUrl


class SourceId(StrEnum):
    """Kaynak kimlikleri. Yeni kaynak eklerken buraya ve `sources/registry.py`'ye ekle."""

    RESMI_GAZETE = "resmi_gazete"  # resmigazete.gov.tr
    MEVZUAT = "mevzuat"  # mevzuat.gov.tr (kanun, KHK, CBK, yönetmelik...)
    YARGITAY = "yargitay"  # karararama.yargitay.gov.tr
    DANISTAY = "danistay"  # karararama.danistay.gov.tr
    AYM_NORM = "aym_norm"  # normkararlarbilgibankasi.anayasa.gov.tr
    AYM_BIREYSEL = "aym_bireysel"  # kararlarbilgibankasi.anayasa.gov.tr
    UYAP_EMSAL = "uyap_emsal"  # emsal.uyap.gov.tr (BAM / ilk derece)
    KVKK = "kvkk"  # kvkk.gov.tr kurul kararları
    REKABET = "rekabet"  # rekabet.gov.tr kurul kararları


class DocType(StrEnum):
    KANUN = "kanun"
    KHK = "khk"
    CB_KARARNAMESI = "cb_kararnamesi"
    CB_KARARI = "cb_karari"
    YONETMELIK = "yonetmelik"
    TEBLIG = "teblig"
    GENELGE = "genelge"
    RG_ILAN = "rg_ilan"  # Resmî Gazete ilan / atama / diğer
    RG_DIGER = "rg_diger"
    MAHKEME_KARARI = "mahkeme_karari"
    KURUL_KARARI = "kurul_karari"
    DIGER = "diger"


class DocRef(BaseModel):
    """Keşif aşamasında üretilen hafif referans. `fetch` ile tam belgeye dönüşür."""

    source: SourceId
    external_id: str = Field(description="Kaynak içinde tekil kimlik (örn. RG 20251031-3, Yargıtay karar id)")
    url: HttpUrl = Field(description="Belgenin doğrudan açılabilir adresi (kullanıcıya gösterilen bağlantı)")
    title: str | None = None
    published_at: date | None = None
    extra: dict[str, Any] = Field(default_factory=dict)

    @property
    def doc_id(self) -> str:
        return make_doc_id(self.source, self.external_id)


class Document(BaseModel):
    """Depolanan belgenin tam hali. `text` temiz düz metindir; `raw` ham HTML/PDF dosya yolu."""

    doc_id: str
    source: SourceId
    external_id: str
    url: HttpUrl
    title: str
    doc_type: DocType = DocType.DIGER
    text: str
    published_at: date | None = None
    decision_date: date | None = None  # mahkeme kararları için karar tarihi
    court: str | None = None  # "Yargıtay 9. Hukuk Dairesi", "Danıştay 10. Daire", "AYM Genel Kurul"
    case_no: str | None = None  # Esas No (2023/1234)
    decision_no: str | None = None  # Karar No
    law_no: str | None = None  # Mevzuat numarası (6098)
    rg_issue: str | None = None  # Resmî Gazete sayısı (32345)
    metadata: dict[str, Any] = Field(default_factory=dict)
    raw_path: str | None = None
    content_hash: str = ""
    fetched_at: datetime = Field(default_factory=lambda: datetime.now(UTC).replace(tzinfo=None, microsecond=0))

    def model_post_init(self, context: Any, /) -> None:
        if not self.content_hash:
            self.content_hash = hashlib.sha256(self.text.encode("utf-8")).hexdigest()


class Chunk(BaseModel):
    """RAG birimi. `anchor` varsa bağlantıya `#` ile eklenir (örn. madde numarası)."""

    chunk_id: str
    doc_id: str
    ordinal: int
    text: str
    heading: str | None = None  # "Madde 5", "Karar gerekçesi", "Hüküm" gibi
    anchor: str | None = None
    char_start: int = 0
    char_end: int = 0
    token_estimate: int = 0


class SearchHit(BaseModel):
    chunk: Chunk
    document: Document
    score: float
    bm25_rank: int | None = None
    vector_rank: int | None = None

    @property
    def link(self) -> str:
        url = str(self.document.url)
        return f"{url}#{self.chunk.anchor}" if self.chunk.anchor else url


class Citation(BaseModel):
    """Analiz çıktısında kaynak bağlantısı."""

    index: int
    title: str
    url: str
    source: SourceId
    cited_text: str
    heading: str | None = None
    doc_id: str
    chunk_id: str


class AnalysisSegment(BaseModel):
    text: str
    citation_indexes: list[int] = Field(default_factory=list)


class AnalysisResult(BaseModel):
    question: str
    answer_markdown: str
    segments: list[AnalysisSegment]
    citations: list[Citation]
    hits: list[SearchHit]
    model: str
    usage: dict[str, int] = Field(default_factory=dict)
    disclaimer: str = (
        "Bu çıktı hukuki danışmanlık değildir; kaynaklar doğrudan bağlantılarından doğrulanmalıdır."
    )


def make_doc_id(source: SourceId | str, external_id: str) -> str:
    return f"{source}:{external_id}"


def make_chunk_id(doc_id: str, ordinal: int) -> str:
    return f"{doc_id}#{ordinal:04d}"
