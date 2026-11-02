"""Boru hattı: sahte adaptörle keşif -> indirme -> depolama; yeniden çalıştırmada atlama; gömme."""

from __future__ import annotations

from datetime import date

from legalai.db import Database
from legalai.embeddings import HashEmbedder
from legalai.ingest import embed_pending, ingest_source, reindex_chunks
from legalai.models import DocRef, DocType, Document, SourceId
from legalai.sources.base import BaseSource, SourceError


class FakeSource(BaseSource):
    source_id = SourceId.RESMI_GAZETE
    display_name = "Sahte RG"

    def __init__(self, docs: dict[str, str], broken: set[str] | None = None):
        super().__init__()
        self.docs = docs
        self.broken = broken or set()
        self.fetch_calls = 0

    async def discover(self, since=None, until=None, query=None, limit=None):
        for i, ext in enumerate(self.docs):
            if limit is not None and i >= limit:
                return
            yield DocRef(
                source=self.source_id,
                external_id=ext,
                url=f"https://www.resmigazete.gov.tr/eskiler/2025/10/{ext}.htm",
                title=ext,
                published_at=date(2025, 10, 31),
            )

    async def fetch(self, ref: DocRef) -> Document:
        self.fetch_calls += 1
        if ref.external_id in self.broken:
            raise SourceError("bozuk sayfa")
        return Document(
            doc_id=ref.doc_id,
            source=self.source_id,
            external_id=ref.external_id,
            url=ref.url,
            title=f"Belge {ref.external_id}",
            doc_type=DocType.YONETMELIK,
            text=self.docs[ref.external_id],
            published_at=ref.published_at,
            metadata={"raw_bytes": b"<html>x</html>", "raw_ext": "htm"},
        )


async def test_ingest_stores_skips_and_reports(tmp_path):
    db = Database(":memory:")
    src = FakeSource(
        {
            "20251031-1": "MADDE 1 - Bu Yönetmelik kira sözleşmelerine uygulanır.",
            "20251031-2": "MADDE 1 - İkinci belge.",
            "20251031-3": "hata",
        },
        broken={"20251031-3"},
    )
    report = await ingest_source(db, src, raw_dir=tmp_path)
    assert (report.discovered, report.fetched, report.skipped, report.failed) == (3, 2, 0, 1)
    assert db.stats()["documents"] == 2
    assert (tmp_path / "resmi_gazete" / "20251031-1.htm").read_bytes() == b"<html>x</html>"
    doc = db.get_document("resmi_gazete:20251031-1")
    assert doc is not None and "raw_bytes" not in doc.metadata and doc.raw_path

    # İkinci çalıştırma: var olanlar indirilmez
    calls_before = src.fetch_calls
    report2 = await ingest_source(db, src, raw_dir=tmp_path)
    assert report2.skipped == 2 and report2.fetched == 0
    assert src.fetch_calls == calls_before + 1  # yalnızca bozuk olan yeniden denendi

    # refetch=True ile içerik aynıysa yine atlanır (hash)
    report3 = await ingest_source(db, src, raw_dir=tmp_path, refetch=True, limit=2)
    assert report3.skipped == 2

    log = db.conn.execute("SELECT COUNT(*) FROM ingest_log WHERE finished_at IS NOT NULL").fetchone()[0]
    assert log == 3


async def test_embed_pending_and_reindex():
    db = Database(":memory:")
    src = FakeSource({"a": "MADDE 1 - Kira bedeli. " * 5, "b": "MADDE 2 - Tahliye. " * 5})
    await ingest_source(db, src)
    emb = HashEmbedder()
    n = embed_pending(db, emb, batch_size=1)
    assert n == db.stats()["chunks"] and n > 0
    assert embed_pending(db, emb) == 0
    assert reindex_chunks(db) == 2
    assert db.embedding_count(emb.model_name) == 0  # yeniden parçalama gömmeleri sıfırlar
