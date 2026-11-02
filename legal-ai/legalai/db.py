"""SQLite depolama: belgeler, parçalar, FTS5 tam metin dizini, isteğe bağlı gömme vektörleri.

Tek dosya, sunucu yok. FTS5 `unicode61 remove_diacritics 2` ile Türkçe aksanlara toleranslıdır;
ayrıca `fold_tr` ile katlanmış bir kopya saklanır ki "ihtiyati tedbir" / "İHTİYATİ TEDBİR" eşleşsin.
"""

from __future__ import annotations

import json
import sqlite3
import struct
from collections.abc import Iterable, Iterator
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from legalai.models import Chunk, Document, SourceId
from legalai.text import fold_tr

SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS documents (
  doc_id        TEXT PRIMARY KEY,
  source        TEXT NOT NULL,
  external_id   TEXT NOT NULL,
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  doc_type      TEXT NOT NULL,
  text          TEXT NOT NULL,
  published_at  TEXT,
  decision_date TEXT,
  court         TEXT,
  case_no       TEXT,
  decision_no   TEXT,
  law_no        TEXT,
  rg_issue      TEXT,
  metadata      TEXT NOT NULL DEFAULT '{}',
  raw_path      TEXT,
  content_hash  TEXT NOT NULL,
  fetched_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_source_date ON documents(source, published_at);
CREATE INDEX IF NOT EXISTS idx_documents_law_no ON documents(law_no);

CREATE TABLE IF NOT EXISTS chunks (
  chunk_id   TEXT PRIMARY KEY,
  doc_id     TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
  ordinal    INTEGER NOT NULL,
  heading    TEXT,
  anchor     TEXT,
  text       TEXT NOT NULL,
  char_start INTEGER NOT NULL,
  char_end   INTEGER NOT NULL,
  token_estimate INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id, ordinal);

CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
  chunk_id UNINDEXED,
  heading,
  text,
  text_folded,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS embeddings (
  chunk_id TEXT PRIMARY KEY REFERENCES chunks(chunk_id) ON DELETE CASCADE,
  model    TEXT NOT NULL,
  dim      INTEGER NOT NULL,
  vector   BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  source     TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  discovered INTEGER DEFAULT 0,
  fetched    INTEGER DEFAULT 0,
  skipped    INTEGER DEFAULT 0,
  failed     INTEGER DEFAULT 0,
  note       TEXT
);
"""


def _iso(d: date | datetime | None) -> str | None:
    return d.isoformat() if d else None


def pack_vector(vec: list[float]) -> bytes:
    return struct.pack(f"<{len(vec)}f", *vec)


def unpack_vector(blob: bytes, dim: int) -> list[float]:
    return list(struct.unpack(f"<{dim}f", blob))


class Database:
    def __init__(self, path: str | Path = ":memory:") -> None:
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # ---- belgeler --------------------------------------------------------------------------

    def has_document(self, doc_id: str, content_hash: str | None = None) -> bool:
        row = self.conn.execute("SELECT content_hash FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
        if row is None:
            return False
        return content_hash is None or row["content_hash"] == content_hash

    def upsert_document(self, doc: Document, chunks: Iterable[Chunk]) -> None:
        """Belgeyi ve parçalarını atomik yazar; eski parçalar ve gömmeler silinir."""
        chunks = list(chunks)
        with self.conn:
            self.conn.execute(
                "DELETE FROM chunks_fts WHERE chunk_id IN (SELECT chunk_id FROM chunks WHERE doc_id=?)",
                (doc.doc_id,),
            )
            self.conn.execute("DELETE FROM chunks WHERE doc_id=?", (doc.doc_id,))
            self.conn.execute(
                """INSERT INTO documents (doc_id, source, external_id, url, title, doc_type, text, published_at,
                     decision_date, court, case_no, decision_no, law_no, rg_issue, metadata, raw_path, content_hash, fetched_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                   ON CONFLICT(doc_id) DO UPDATE SET
                     url=excluded.url, title=excluded.title, doc_type=excluded.doc_type, text=excluded.text,
                     published_at=excluded.published_at, decision_date=excluded.decision_date, court=excluded.court,
                     case_no=excluded.case_no, decision_no=excluded.decision_no, law_no=excluded.law_no,
                     rg_issue=excluded.rg_issue, metadata=excluded.metadata, raw_path=excluded.raw_path,
                     content_hash=excluded.content_hash, fetched_at=excluded.fetched_at""",
                (
                    doc.doc_id,
                    str(doc.source),
                    doc.external_id,
                    str(doc.url),
                    doc.title,
                    str(doc.doc_type),
                    doc.text,
                    _iso(doc.published_at),
                    _iso(doc.decision_date),
                    doc.court,
                    doc.case_no,
                    doc.decision_no,
                    doc.law_no,
                    doc.rg_issue,
                    json.dumps(doc.metadata, ensure_ascii=False),
                    doc.raw_path,
                    doc.content_hash,
                    _iso(doc.fetched_at),
                ),
            )
            self.conn.executemany(
                """INSERT INTO chunks (chunk_id, doc_id, ordinal, heading, anchor, text, char_start, char_end, token_estimate)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                [
                    (
                        c.chunk_id,
                        c.doc_id,
                        c.ordinal,
                        c.heading,
                        c.anchor,
                        c.text,
                        c.char_start,
                        c.char_end,
                        c.token_estimate,
                    )
                    for c in chunks
                ],
            )
            self.conn.executemany(
                "INSERT INTO chunks_fts (chunk_id, heading, text, text_folded) VALUES (?,?,?,?)",
                [(c.chunk_id, c.heading or "", c.text, fold_tr(c.text)) for c in chunks],
            )

    def get_document(self, doc_id: str) -> Document | None:
        row = self.conn.execute("SELECT * FROM documents WHERE doc_id=?", (doc_id,)).fetchone()
        return _row_to_document(row) if row else None

    def get_documents(self, doc_ids: Iterable[str]) -> dict[str, Document]:
        ids = list(dict.fromkeys(doc_ids))
        if not ids:
            return {}
        out: dict[str, Document] = {}
        for i in range(0, len(ids), 500):
            batch = ids[i : i + 500]
            q = f"SELECT * FROM documents WHERE doc_id IN ({','.join('?' * len(batch))})"
            for row in self.conn.execute(q, batch):
                out[row["doc_id"]] = _row_to_document(row)
        return out

    def iter_documents(self, source: SourceId | None = None) -> Iterator[Document]:
        if source:
            cur = self.conn.execute(
                "SELECT * FROM documents WHERE source=? ORDER BY published_at", (str(source),)
            )
        else:
            cur = self.conn.execute("SELECT * FROM documents ORDER BY source, published_at")
        for row in cur:
            yield _row_to_document(row)

    def delete_document(self, doc_id: str) -> None:
        with self.conn:
            self.conn.execute(
                "DELETE FROM chunks_fts WHERE chunk_id IN (SELECT chunk_id FROM chunks WHERE doc_id=?)",
                (doc_id,),
            )
            self.conn.execute("DELETE FROM documents WHERE doc_id=?", (doc_id,))

    # ---- parçalar ------------------------------------------------------------------------------

    def get_chunks(self, chunk_ids: Iterable[str]) -> dict[str, Chunk]:
        ids = list(dict.fromkeys(chunk_ids))
        if not ids:
            return {}
        out: dict[str, Chunk] = {}
        for i in range(0, len(ids), 500):
            batch = ids[i : i + 500]
            q = f"SELECT * FROM chunks WHERE chunk_id IN ({','.join('?' * len(batch))})"
            for row in self.conn.execute(q, batch):
                out[row["chunk_id"]] = _row_to_chunk(row)
        return out

    def iter_chunks_without_embedding(self, model: str, batch_size: int = 64) -> Iterator[list[Chunk]]:
        cur = self.conn.execute(
            """SELECT c.* FROM chunks c LEFT JOIN embeddings e ON e.chunk_id=c.chunk_id AND e.model=?
               WHERE e.chunk_id IS NULL ORDER BY c.doc_id, c.ordinal""",
            (model,),
        )
        batch: list[Chunk] = []
        for row in cur:
            batch.append(_row_to_chunk(row))
            if len(batch) >= batch_size:
                yield batch
                batch = []
        if batch:
            yield batch

    # ---- tam metin arama ---------------------------------------------------------------------

    def fts_search(
        self,
        query: str,
        *,
        sources: list[SourceId] | None = None,
        since: date | None = None,
        until: date | None = None,
        limit: int = 50,
    ) -> list[tuple[str, float]]:
        """FTS5 BM25. Döndürür: [(chunk_id, skor)] — skor büyük = daha iyi."""
        match = build_fts_query(query)
        if not match:
            return []
        sql = """
            SELECT f.chunk_id AS chunk_id, bm25(chunks_fts, 0.0, 2.0, 1.0, 1.0) AS rank
            FROM chunks_fts f
            JOIN chunks c ON c.chunk_id = f.chunk_id
            JOIN documents d ON d.doc_id = c.doc_id
            WHERE chunks_fts MATCH ?
        """
        params: list[Any] = [match]
        sql, params = _apply_filters(sql, params, sources, since, until)
        sql += " ORDER BY rank, c.doc_id, c.ordinal LIMIT ?"
        params.append(limit)
        rows = self.conn.execute(sql, params).fetchall()
        # bm25 küçük (negatif) = daha iyi; işaret çevir
        return [(r["chunk_id"], -float(r["rank"])) for r in rows]

    # ---- gömmeler ----------------------------------------------------------------------------

    def put_embeddings(self, model: str, items: Iterable[tuple[str, list[float]]]) -> None:
        with self.conn:
            self.conn.executemany(
                "INSERT OR REPLACE INTO embeddings (chunk_id, model, dim, vector) VALUES (?,?,?,?)",
                [(cid, model, len(vec), pack_vector(vec)) for cid, vec in items],
            )

    def iter_embeddings(
        self,
        model: str,
        *,
        sources: list[SourceId] | None = None,
        since: date | None = None,
        until: date | None = None,
    ) -> Iterator[tuple[str, list[float]]]:
        sql = """SELECT e.chunk_id, e.dim, e.vector FROM embeddings e
                 JOIN chunks c ON c.chunk_id=e.chunk_id JOIN documents d ON d.doc_id=c.doc_id
                 WHERE e.model=?"""
        params: list[Any] = [model]
        sql, params = _apply_filters(sql, params, sources, since, until)
        for row in self.conn.execute(sql, params):
            yield row["chunk_id"], unpack_vector(row["vector"], row["dim"])

    def embedding_count(self, model: str) -> int:
        return self.conn.execute("SELECT COUNT(*) FROM embeddings WHERE model=?", (model,)).fetchone()[0]

    # ---- günlük / istatistik -----------------------------------------------------------------

    def log_ingest_start(self, source: SourceId) -> int:
        with self.conn:
            cur = self.conn.execute(
                "INSERT INTO ingest_log (source, started_at) VALUES (?, ?)",
                (str(source), datetime.now(UTC).replace(tzinfo=None).isoformat()),
            )
            return int(cur.lastrowid)

    def log_ingest_finish(
        self, log_id: int, *, discovered: int, fetched: int, skipped: int, failed: int, note: str = ""
    ) -> None:
        with self.conn:
            self.conn.execute(
                """UPDATE ingest_log SET finished_at=?, discovered=?, fetched=?, skipped=?, failed=?, note=? WHERE id=?""",
                (
                    datetime.now(UTC).replace(tzinfo=None).isoformat(),
                    discovered,
                    fetched,
                    skipped,
                    failed,
                    note,
                    log_id,
                ),
            )

    def stats(self) -> dict[str, Any]:
        docs = self.conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
        chunks = self.conn.execute("SELECT COUNT(*) FROM chunks").fetchone()[0]
        by_source = {
            r["source"]: r["n"]
            for r in self.conn.execute(
                "SELECT source, COUNT(*) AS n FROM documents GROUP BY source ORDER BY source"
            )
        }
        last = self.conn.execute("SELECT MAX(fetched_at) FROM documents").fetchone()[0]
        emb = {
            r["model"]: r["n"]
            for r in self.conn.execute("SELECT model, COUNT(*) AS n FROM embeddings GROUP BY model")
        }
        return {
            "documents": docs,
            "chunks": chunks,
            "by_source": by_source,
            "last_fetched_at": last,
            "embeddings": emb,
        }


def _apply_filters(
    sql: str, params: list[Any], sources: list[SourceId] | None, since: date | None, until: date | None
) -> tuple[str, list[Any]]:
    if sources:
        sql += f" AND d.source IN ({','.join('?' * len(sources))})"
        params.extend(str(s) for s in sources)
    if since:
        sql += " AND COALESCE(d.decision_date, d.published_at) >= ?"
        params.append(since.isoformat())
    if until:
        sql += " AND COALESCE(d.decision_date, d.published_at) <= ?"
        params.append(until.isoformat())
    return sql, params


def build_fts_query(query: str) -> str:
    """Serbest metni güvenli FTS5 sorgusuna çevirir.

    - Tırnaklı ifadeler korunur ("ihtiyati tedbir").
    - Diğer kelimeler katlanır (fold_tr) ve her biri ön ek eşleşmeli (kira* -> kiracı, kiralayan).
    - Kelimeler OR ile birleşir; BM25 çok eşleşene yüksek skor verir. Böylece 1 kelime eksikse sonuç kaybolmaz.
    """
    import re

    phrases = re.findall(r'"([^"]+)"', query)
    rest = re.sub(r'"[^"]+"', " ", query)
    terms: list[str] = []
    for ph in phrases:
        clean = fold_tr(ph).replace('"', " ").strip()
        if clean:
            terms.append('"' + clean + '"')
    for tok in re.findall(r"[0-9A-Za-zçğıöşüÇĞİÖŞÜâîû]+", rest):
        if len(tok) < 2:
            continue
        folded = fold_tr(tok)
        if folded in _STOPWORDS:
            continue
        terms.append(folded + "*" if len(folded) >= 4 else folded)
    if not terms:
        return ""
    return " OR ".join(terms)


_STOPWORDS = {
    "ve",
    "ile",
    "bir",
    "bu",
    "şu",
    "su",
    "da",
    "de",
    "mi",
    "mı",
    "mu",
    "mü",
    "için",
    "icin",
    "gibi",
    "ne",
    "nedir",
    "hakkında",
    "hakkinda",
    "olan",
    "olarak",
    "ise",
    "ya",
    "veya",
    "ama",
    "fakat",
    "ancak",
    "her",
    "çok",
    "cok",
    "daha",
    "en",
    "ki",
    "ki̇",
    "midir",
    "mıdır",
    "nasıl",
    "nasil",
    "hangi",
    "kaç",
    "kac",
    "nelerdir",
}


def _row_to_document(row: sqlite3.Row) -> Document:
    return Document(
        doc_id=row["doc_id"],
        source=SourceId(row["source"]),
        external_id=row["external_id"],
        url=row["url"],
        title=row["title"],
        doc_type=row["doc_type"],
        text=row["text"],
        published_at=date.fromisoformat(row["published_at"]) if row["published_at"] else None,
        decision_date=date.fromisoformat(row["decision_date"]) if row["decision_date"] else None,
        court=row["court"],
        case_no=row["case_no"],
        decision_no=row["decision_no"],
        law_no=row["law_no"],
        rg_issue=row["rg_issue"],
        metadata=json.loads(row["metadata"] or "{}"),
        raw_path=row["raw_path"],
        content_hash=row["content_hash"],
        fetched_at=datetime.fromisoformat(row["fetched_at"]),
    )


def _row_to_chunk(row: sqlite3.Row) -> Chunk:
    return Chunk(
        chunk_id=row["chunk_id"],
        doc_id=row["doc_id"],
        ordinal=row["ordinal"],
        heading=row["heading"],
        anchor=row["anchor"],
        text=row["text"],
        char_start=row["char_start"],
        char_end=row["char_end"],
        token_estimate=row["token_estimate"],
    )
