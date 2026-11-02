"""Takılabilir gömme sağlayıcıları.

- `none`  : yalnızca BM25 (varsayılan; sıfır bağımlılık, çevrimdışı).
- `voyage`: Voyage AI (`voyage-3-large` / `voyage-multilingual-2`), Türkçe destekler; `VOYAGE_API_KEY` gerekir.
- `local` : sentence-transformers (`intfloat/multilingual-e5-base` varsayılan), tamamen yerel; `pip install legalai[local]`.

Hepsi aynı arayüzü sunar: `embed_documents(texts)`, `embed_query(text)`, `model_name`.
"""

from __future__ import annotations

import math
import os
from typing import Protocol


class Embedder(Protocol):
    model_name: str

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...

    def embed_query(self, text: str) -> list[float]: ...


class VoyageEmbedder:
    def __init__(self, model: str = "voyage-3-large", api_key: str | None = None) -> None:
        import voyageai  # type: ignore[import-not-found]

        self.model_name = model
        self._client = voyageai.Client(api_key=api_key or os.environ.get("VOYAGE_API_KEY"))

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 64):
            res = self._client.embed(texts[i : i + 64], model=self.model_name, input_type="document")
            out.extend(res.embeddings)
        return out

    def embed_query(self, text: str) -> list[float]:
        return self._client.embed([text], model=self.model_name, input_type="query").embeddings[0]


class LocalEmbedder:
    def __init__(self, model: str = "intfloat/multilingual-e5-base") -> None:
        from sentence_transformers import SentenceTransformer  # type: ignore[import-not-found]

        self.model_name = model
        self._model = SentenceTransformer(model)
        self._e5 = "e5" in model.lower()

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        prefixed = [f"passage: {t}" for t in texts] if self._e5 else texts
        return self._model.encode(prefixed, normalize_embeddings=True, batch_size=32).tolist()

    def embed_query(self, text: str) -> list[float]:
        q = f"query: {text}" if self._e5 else text
        return self._model.encode([q], normalize_embeddings=True)[0].tolist()


class HashEmbedder:
    """Deterministik, bağımlılıksız 'gömme' — yalnızca testler ve boru hattı denemeleri için.

    Kelime kovalarına dayanır; anlamsal değildir. Üretimde kullanılmaz.
    """

    model_name = "hash-test-256"

    def __init__(self, dim: int = 256) -> None:
        self.dim = dim

    def _vec(self, text: str) -> list[float]:
        import zlib

        from legalai.text import fold_tr

        v = [0.0] * self.dim
        for tok in fold_tr(text).split():
            v[zlib.crc32(tok.encode("utf-8")) % self.dim] += 1.0
        norm = math.sqrt(sum(x * x for x in v)) or 1.0
        return [x / norm for x in v]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vec(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vec(text)


def make_embedder(kind: str, model: str = "") -> Embedder | None:
    kind = (kind or "none").lower()
    if kind == "none":
        return None
    if kind == "voyage":
        return VoyageEmbedder(model or "voyage-3-large")
    if kind == "local":
        return LocalEmbedder(model or "intfloat/multilingual-e5-base")
    if kind == "hash":
        return HashEmbedder()
    raise ValueError(f"Bilinmeyen gömme türü: {kind} (none | voyage | local)")


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b, strict=False))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(x * x for x in b)) or 1.0
    return dot / (na * nb)
