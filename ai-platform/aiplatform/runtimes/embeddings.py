"""Gömme (embedding) çalışma zamanı + basit SQLite vektör deposu + kelime tabanlı parçalayıcı.

- `embed(texts, model_id, kind)` sentence-transformers ile kurulu artifact klasöründen (tembel) yükler.
  e5 ailesinde "query: " / "passage: " önekleri otomatik eklenir. Vektörler L2-normalize edilir.
- `VectorStore` — `data_dir/vectors.db` (sqlite3 + numpy, kosinüs). Küçük/orta koleksiyonlar (≈100 bin parça)
  için yeterlidir; daha büyük kurulumlarda pgvector/qdrant önerilir.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
import threading
from collections.abc import Iterable
from pathlib import Path
from typing import Any

import numpy as np

from ..config import get_settings
from ..modules.base import ModuleError, ModuleNotReady
from . import model_dir
from .lazy import LazyRegistry

EMBEDDER_PREFERENCE = ["bge-m3", "turkish-e5-large", "multilingual-e5-small"]
_MODELS = LazyRegistry()


def default_embedder(prefer: Iterable[str] | None = None) -> str:
    order = list(prefer or []) + [m for m in EMBEDDER_PREFERENCE if m not in (prefer or [])]
    for mid in order:
        if model_dir(mid) is not None:
            return mid
    raise ModuleNotReady("Gömme modeli kurulu değil — modül mağazasından 'semantik-arama' kurun")


def _load_sentence_transformer(path: Path):
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as e:
        raise ModuleNotReady(
            "'sentence-transformers' kurulu değil — modül mağazasından 'semantik-arama' kurun"
        ) from e
    return SentenceTransformer(str(path), device=None)


def get_embedder(model_id: str):
    path = model_dir(model_id)
    if path is None:
        raise ModuleNotReady(
            f"'{model_id}' gömme modeli kurulu değil — modül mağazasından 'semantik-arama' kurun"
        )
    return _MODELS.get(str(path), lambda: _load_sentence_transformer(path))


def _prefix(model_id: str, kind: str) -> str:
    if "e5" in model_id:
        return "query: " if kind == "query" else "passage: "
    return ""


def embed_sync(texts: list[str], model_id: str | None = None, kind: str = "passage") -> np.ndarray:
    mid = model_id or default_embedder()
    model = get_embedder(mid)
    pre = _prefix(mid, kind)
    vecs = model.encode([pre + t for t in texts], normalize_embeddings=True, convert_to_numpy=True)
    return np.asarray(vecs, dtype=np.float32)


async def embed(texts: list[str], model_id: str | None = None, kind: str = "passage") -> np.ndarray:
    return await asyncio.to_thread(embed_sync, texts, model_id, kind)


# ----------------------------------------------------------------------------- parçalayıcı


def chunk_text(text: str, max_tokens: int = 400, overlap: int = 50) -> list[str]:
    """Kelime tabanlı kayan pencere (≈ 1 kelime = 1,3 belirteç; sınır yaklaşık)."""
    words = (text or "").split()
    if not words:
        return []
    size = max(1, int(max_tokens))
    step = max(1, size - max(0, min(overlap, size - 1)))
    chunks = []
    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start : start + size]))
        if start + size >= len(words):
            break
    return chunks


# ----------------------------------------------------------------------------- vektör deposu


class VectorStore:
    _lock = threading.Lock()

    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path) if path else get_settings().data_dir / "vectors.db"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._conn() as c:
            c.execute(
                """CREATE TABLE IF NOT EXISTS vectors (
                    collection TEXT NOT NULL, doc_id TEXT NOT NULL, chunk_id INTEGER NOT NULL,
                    text TEXT NOT NULL, vector BLOB NOT NULL, dim INTEGER NOT NULL,
                    model_id TEXT, meta_json TEXT,
                    PRIMARY KEY (collection, doc_id, chunk_id))"""
            )
            c.execute("CREATE INDEX IF NOT EXISTS ix_vectors_collection ON vectors(collection)")

    def _conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.path))

    def add(self, collection: str, items: list[dict[str, Any]], model_id: str | None = None) -> int:
        """items: {doc_id, chunk_id, text, vector, meta?}. Aynı (doc_id, chunk_id) üzerine yazılır."""
        rows = []
        for it in items:
            vec = np.asarray(it["vector"], dtype=np.float32).ravel()
            rows.append(
                (
                    collection,
                    str(it["doc_id"]),
                    int(it.get("chunk_id", 0)),
                    it["text"],
                    vec.tobytes(),
                    int(vec.shape[0]),
                    model_id,
                    json.dumps(it.get("meta") or {}, ensure_ascii=False),
                )
            )
        with self._lock, self._conn() as c:
            dims = {
                r[0] for r in c.execute("SELECT DISTINCT dim FROM vectors WHERE collection=?", (collection,))
            }
            new_dims = {r[5] for r in rows}
            if dims and (dims | new_dims) != dims:
                raise ModuleError(
                    f"'{collection}' koleksiyonu farklı boyutlu vektörler içeriyor; aynı gömme modelini kullanın"
                )
            c.executemany("INSERT OR REPLACE INTO vectors VALUES (?,?,?,?,?,?,?,?)", rows)
        return len(rows)

    def delete_document(self, collection: str, doc_id: str) -> int:
        with self._lock, self._conn() as c:
            return c.execute(
                "DELETE FROM vectors WHERE collection=? AND doc_id=?", (collection, doc_id)
            ).rowcount

    def delete_collection(self, collection: str) -> int:
        with self._lock, self._conn() as c:
            return c.execute("DELETE FROM vectors WHERE collection=?", (collection,)).rowcount

    def collections(self) -> list[dict]:
        with self._conn() as c:
            return [
                {"collection": r[0], "chunks": r[1], "documents": r[2], "model_id": r[3]}
                for r in c.execute(
                    "SELECT collection, COUNT(*), COUNT(DISTINCT doc_id), MAX(model_id) FROM vectors GROUP BY collection"
                )
            ]

    def collection_model(self, collection: str) -> str | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT model_id FROM vectors WHERE collection=? LIMIT 1", (collection,)
            ).fetchone()
        return row[0] if row else None

    def search(self, collection: str, query_vector, top_k: int = 5) -> list[dict]:
        q = np.asarray(query_vector, dtype=np.float32).ravel()
        with self._conn() as c:
            rows = c.execute(
                "SELECT doc_id, chunk_id, text, vector, dim, meta_json FROM vectors WHERE collection=?",
                (collection,),
            ).fetchall()
        if not rows:
            return []
        mat = np.vstack(
            [np.frombuffer(r[3], dtype=np.float32) for r in rows if r[4] == q.shape[0]]
            or [np.zeros((0, q.shape[0]))]
        )
        kept = [r for r in rows if r[4] == q.shape[0]]
        if not kept:
            raise ModuleError(
                "Sorgu vektörü koleksiyonla aynı boyutta değil; koleksiyonu aynı modelle dizinleyin"
            )
        norms = np.linalg.norm(mat, axis=1) * (np.linalg.norm(q) or 1.0)
        norms[norms == 0] = 1.0
        scores = (mat @ q) / norms
        order = np.argsort(-scores)[: max(1, int(top_k))]
        return [
            {
                "doc_id": kept[i][0],
                "chunk_id": kept[i][1],
                "text": kept[i][2],
                "score": round(float(scores[i]), 4),
                "meta": json.loads(kept[i][5] or "{}"),
            }
            for i in order
        ]


__all__ = ["VectorStore", "chunk_text", "default_embedder", "embed", "embed_sync", "get_embedder"]
