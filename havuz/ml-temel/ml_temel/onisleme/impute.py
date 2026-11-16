"""Eksik değer doldurma: SimpleImputer.

Fikir: çoğu model NaN ile çalışamaz. En basit çare, eksik hücreyi sütunun EĞİTİMDEKİ tipik
değeriyle doldurmaktır: sayısal sütunda ortalama ya da (aykırı değerlere dayanıklı) ortanca,
kategori sütununda en sık değer ya da "(eksik)" gibi sabit bir etiket.

`add_indicator=True`, eğitimde eksiği olan her sütun için "bu hücre eksikti" (0/1) sütunu ekler;
eksikliğin kendisi bilgi taşıyorsa (ör. geliri yazmayanlar) doğrusal modellere bunu gösterir.
SIZINTI: doldurma değeri yalnız eğitim verisinden öğrenilir → `Pipeline` içinde kullanın.
scikit-learn'den fark: tümü eksik olan sütun atılmaz; 0 (ya da "(eksik)") ile doldurulur.
Genişletme: yeni strateji için `_column_statistic` fonksiyonuna bir dal ekleyin.
"""

from __future__ import annotations

import math
from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_is_fitted

MISSING_LABEL = "(eksik)"
_STRATEGIES = ("mean", "median", "most_frequent", "constant")


def is_missing(value: Any) -> bool:
    """Tek bir hücre eksik mi? (None ya da NaN)"""
    return value is None or (isinstance(value, float) and math.isnan(value))


def missing_mask(X: Array) -> Array:
    """Eksik hücreler: sayısal dizide NaN; object dizide None ya da NaN."""
    if X.dtype.kind == "f":
        return np.isnan(X)
    if X.dtype.kind in "iub":
        return np.zeros(X.shape, dtype=bool)
    flat = np.array([is_missing(value) for value in X.ravel()], dtype=bool)
    return flat.reshape(X.shape)


def _as_2d(X: ArrayLike) -> Array:
    data = np.asarray(X)
    if data.dtype.kind in "iub":
        data = data.astype(np.float64)
    if data.ndim != 2:
        raise ValueError(
            f"X 2 boyutlu olmalı (satır × sütun); verilen biçim {data.shape}. "
            "Tek sütun için `X.reshape(-1, 1)` kullanın."
        )
    return data


def _column_statistic(values: Array, strategy: str, fill_value: Any, numeric: bool) -> Any:
    """Bir sütunun (eksikleri ayıklanmış) doldurma değeri."""
    if strategy == "constant":
        if fill_value is not None:
            return fill_value
        return 0.0 if numeric else MISSING_LABEL
    if values.size == 0:
        return 0.0 if numeric else MISSING_LABEL
    if strategy == "mean":
        return float(np.mean(values.astype(np.float64)))
    if strategy == "median":
        return float(np.median(values.astype(np.float64)))
    unique, counts = np.unique(values, return_counts=True)
    return unique[int(np.argmax(counts))]  # eşitlikte sıralamada önce gelen


class SimpleImputer(BaseEstimator, TransformerMixin):
    """Eksik hücreleri sütun bazında mean / median / most_frequent / constant ile doldurur."""

    def __init__(
        self, strategy: str = "mean", fill_value: Any = None, add_indicator: bool = False
    ) -> None:
        self.strategy = strategy
        self.fill_value = fill_value
        self.add_indicator = add_indicator

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        if self.strategy not in _STRATEGIES:
            raise ValueError(
                f"strategy şu değerlerden biri olmalı: {', '.join(_STRATEGIES)}; "
                f"verilen: '{self.strategy}'."
            )
        data = _as_2d(X)
        numeric = data.dtype.kind == "f"
        if not numeric and self.strategy in ("mean", "median"):
            raise ValueError(
                f"strategy='{self.strategy}' yalnız sayısal sütunlarda çalışır. Kategori sütunları "
                "için strategy='most_frequent' ya da 'constant' kullanın."
            )
        mask = missing_mask(data)
        self.statistics_ = [
            _column_statistic(data[~mask[:, j], j], self.strategy, self.fill_value, numeric)
            for j in range(data.shape[1])
        ]
        self.indicator_features_ = np.flatnonzero(mask.any(axis=0))
        self.n_features_in_ = data.shape[1]
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "statistics_")
        data = _as_2d(X)
        if data.shape[1] != self.n_features_in_:
            raise ValueError(
                f"SimpleImputer {self.n_features_in_} sütunla eğitildi; verilen veri "
                f"{data.shape[1]} sütunlu."
            )
        mask = missing_mask(data)
        filled = data.copy()
        for j, statistic in enumerate(self.statistics_):
            filled[mask[:, j], j] = statistic
        if self.add_indicator and self.indicator_features_.size:
            flags = mask[:, self.indicator_features_]
            filled = np.column_stack([filled, flags.astype(filled.dtype)])
        return filled
