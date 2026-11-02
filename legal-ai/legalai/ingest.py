"""Toplama boru hattı: keşfet -> indir -> ham dosyayı sakla -> parçala -> yaz -> (varsa) göm.

Yeniden çalıştırmak güvenlidir: aynı `doc_id` ve aynı içerik özeti varsa belge atlanır.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from legalai.chunking import ChunkParams, chunk_document
from legalai.config import Settings
from legalai.db import Database
from legalai.embeddings import Embedder
from legalai.models import DocRef, Document, SourceId
from legalai.sources.base import BaseSource, SourceError
from legalai.sources.registry import get_source

log = logging.getLogger(__name__)


@dataclass
class IngestReport:
    source: SourceId
    discovered: int = 0
    fetched: int = 0
    skipped: int = 0
    failed: int = 0
    errors: list[str] = field(default_factory=list)

    def summary(self) -> str:
        return (
            f"{self.source}: bulunan {self.discovered}, indirilen {self.fetched}, "
            f"atlanan {self.skipped}, hatalı {self.failed}"
        )


async def ingest_source(
    db: Database,
    source: BaseSource | SourceId | str,
    *,
    since: date | None = None,
    until: date | None = None,
    query: str | None = None,
    limit: int | None = None,
    raw_dir: Path | None = None,
    refetch: bool = False,
    chunk_params: ChunkParams | None = None,
    on_progress=None,
) -> IngestReport:
    adapter = source if isinstance(source, BaseSource) else get_source(source)
    report = IngestReport(source=adapter.source_id)
    log_id = db.log_ingest_start(adapter.source_id)
    try:
        async for ref in adapter.discover(since=since, until=until, query=query, limit=limit):
            report.discovered += 1
            if not refetch and db.has_document(ref.doc_id):
                report.skipped += 1
                continue
            try:
                doc = await adapter.fetch(ref)
            except SourceError as exc:
                report.failed += 1
                report.errors.append(f"{ref.doc_id}: {exc}")
                log.warning("Belge alınamadı %s: %s", ref.doc_id, exc)
                continue
            if db.has_document(doc.doc_id, doc.content_hash):
                report.skipped += 1
                continue
            if raw_dir is not None:
                doc.raw_path = _save_raw(raw_dir, ref, doc)
            else:  # ham baytlar veritabanına yazılmaz
                doc.metadata.pop("raw_bytes", None)
                doc.metadata.pop("raw_ext", None)
            chunks = chunk_document(doc, chunk_params)
            db.upsert_document(doc, chunks)
            report.fetched += 1
            if on_progress:
                on_progress(report, doc)
    finally:
        if not isinstance(source, BaseSource):
            await adapter.aclose()
        db.log_ingest_finish(
            log_id,
            discovered=report.discovered,
            fetched=report.fetched,
            skipped=report.skipped,
            failed=report.failed,
            note="; ".join(report.errors[:20]),
        )
    return report


def _save_raw(raw_dir: Path, ref: DocRef, doc: Document) -> str:
    """Temiz metni kaynak klasörüne yazar (ham HTML/PDF adaptör `metadata['raw_bytes']` verirse onu da)."""
    folder = raw_dir / str(doc.source)
    folder.mkdir(parents=True, exist_ok=True)
    safe = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in doc.external_id)[:120]
    raw = doc.metadata.pop("raw_bytes", None)
    if isinstance(raw, bytes | bytearray):
        ext = doc.metadata.get("raw_ext", "bin")
        path = folder / f"{safe}.{ext}"
        path.write_bytes(raw)
    else:
        path = folder / f"{safe}.txt"
        path.write_text(doc.text, encoding="utf-8")
    return str(path)


def embed_pending(db: Database, embedder: Embedder, *, batch_size: int = 64, on_progress=None) -> int:
    """Gömmesi olmayan parçaları toplu halde gömer. Döndürür: işlenen parça sayısı."""
    done = 0
    for batch in db.iter_chunks_without_embedding(embedder.model_name, batch_size=batch_size):
        vectors = embedder.embed_documents([c.text for c in batch])
        db.put_embeddings(embedder.model_name, zip([c.chunk_id for c in batch], vectors, strict=True))
        done += len(batch)
        if on_progress:
            on_progress(done)
    return done


def reindex_chunks(db: Database, chunk_params: ChunkParams | None = None) -> int:
    """Parçalama kuralları değişince tüm belgeleri yeniden parçalar (gömmeler sıfırlanır)."""
    n = 0
    for doc in list(db.iter_documents()):
        db.upsert_document(doc, chunk_document(doc, chunk_params))
        n += 1
    return n


async def ingest_many(
    db: Database,
    sources: list[SourceId | str],
    settings: Settings,
    **kw,
) -> list[IngestReport]:
    settings.ensure_dirs()
    tasks = [ingest_source(db, s, raw_dir=settings.raw_dir, **kw) for s in sources]
    return list(await asyncio.gather(*tasks))
