"""HashingVectorizer: sözlük tutmadan, terimleri karma (hash) işleviyle sabit sayıda sütuna dağıtır.

Fikir: her terimin sütunu `crc32(terim) mod n_features` ile bulunur. Sözlük öğrenilmediği için:
  + `fit` gerekmez (durumsuzdur): sızıntı riski yoktur, yeni kelimeler de bir sütuna düşer,
    bellek belge sayısıyla değil `n_features` ile sınırlıdır;
  - iki farklı terim aynı sütuna düşebilir (çarpışma) ve sütunun hangi terim olduğu geri bulunamaz.
`alternate_sign=True`, çarpışan terimlerin birbirini ortalamada götürmesi için karmanın bir
bitini işaret olarak kullanır.

scikit-learn'den fark: karma işlevi MurmurHash3 değil, standart kütüphanedeki `zlib.crc32`'dir;
aynı terim scikit-learn'dekiyle aynı sütuna düşmez (model dosyaları arasında taşınamaz).
Genişletme: başka bir karma işlevi için `_hash` fonksiyonunu değiştirin (kararlı olmalı:
Python'un `hash()`'i her çalıştırmada değişir, KULLANMAYIN).
"""

from __future__ import annotations

import zlib
from collections.abc import Collection, Iterable
from typing import Any, Self

import numpy as np

from ml_temel.onisleme import text
from ml_temel.onisleme.vectorizers import check_dense_size, check_documents, l2_normalize_rows
from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array


def _hash(term: str) -> int:
    """Terimin 32 bitlik kararlı karması (her makinede ve her çalıştırmada aynı)."""
    return zlib.crc32(term.encode("utf-8"))


class HashingVectorizer(BaseEstimator, TransformerMixin):
    """Belgeleri `n_features` sütunlu yoğun matrise çevirir; öğrenilen durum yoktur."""

    def __init__(
        self,
        n_features: int = 4096,
        lowercase: bool = True,
        strip_accents: bool = False,
        analyzer: str = "word",
        ngram_range: tuple[int, int] = (1, 1),
        stop_words: Collection[str] | None = None,
        stem_length: int | None = None,
        alternate_sign: bool = True,
        norm: str | None = "l2",
    ) -> None:
        self.n_features = n_features
        self.lowercase = lowercase
        self.strip_accents = strip_accents
        self.analyzer = analyzer
        self.ngram_range = ngram_range
        self.stop_words = stop_words
        self.stem_length = stem_length
        self.alternate_sign = alternate_sign
        self.norm = norm

    def fit(self, raw_documents: Iterable[Any], y: Any = None) -> Self:
        """Hiçbir şey öğrenmez; yalnız parametreleri denetler (Pipeline uyumu için vardır)."""
        if self.n_features < 2 or self.n_features > 2**31:
            raise ValueError("n_features 2 ile 2**31 arasında olmalı (ör. 4096).")
        if self.norm not in ("l2", None):
            raise ValueError("norm 'l2' ya da None olmalı.")
        return self

    def transform(self, raw_documents: Iterable[Any]) -> Array:
        documents = check_documents(raw_documents)
        check_dense_size(len(documents), self.n_features)
        matrix = np.zeros((len(documents), self.n_features))
        for row, document in enumerate(documents):
            terms = text.analyze(
                document,
                analyzer=self.analyzer,
                ngram_range=self.ngram_range,
                lowercase=self.lowercase,
                strip_accents=self.strip_accents,
                stop_words=self.stop_words,
                stem_length=self.stem_length,
            )
            for term in terms:
                value = _hash(term)
                sign = -1.0 if self.alternate_sign and value >> 31 else 1.0
                matrix[row, (value & 0x7FFFFFFF) % self.n_features] += sign
        return l2_normalize_rows(matrix) if self.norm == "l2" else matrix
