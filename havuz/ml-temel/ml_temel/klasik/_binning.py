"""Kutulama (binning): sürekli sütunları en çok 255 kutuya + 1 "eksik" kutusuna çevirir.

Fikir: gradyan artırmada her bölme aramasında bütün eşikleri denemek pahalıdır. Değerleri önce
kantillere göre en çok `max_bins` kutuya ayırırsak (uint8), bir düğümün bütün özellikleri için
kutu başına gradyan/hessian toplamlarını (histogram) tek geçişte çıkarırız; bölme araması
kutu sınırlarında yapılır. Farklı değer sayısı `max_bins`'ten azsa kutular değerlerin tam
kendisidir (eşikler ardışık değerlerin ortası), yani hiç bilgi kaybolmaz.

Eşikler scikit-learn'ün `_BinMapper`'ıyla aynı kuralla seçilir (ortalanmış ters dağılım kantilleri,
200 000 satırlık alt örneklem). Eksik değer (NaN) her zaman son kutuya (255) düşer.
Genişletme: kategorik sütunları ayrı kutulamak gerekirse `_thresholds` yanına yeni bir yol ekleyin.
"""

from __future__ import annotations

from typing import Self

import numpy as np

from ml_temel.ortak.types import Array, Seed
from ml_temel.ortak.validation import make_rng

ALMOST_INF = 1e300


def _thresholds(column: Array, max_bins: int) -> Array:
    """Bir sütunun kutu üst sınırları (en çok max_bins - 1 tane)."""
    values = column[~np.isnan(column)]
    distinct = np.unique(values)
    if distinct.size <= 1:
        return np.empty(0)
    if distinct.size <= max_bins:
        edges = (distinct[:-1] + distinct[1:]) / 2.0
    else:
        percentiles = np.linspace(0.0, 100.0, max_bins + 1)[1:-1]
        edges = np.unique(np.percentile(values, percentiles, method="averaged_inverted_cdf"))
    return np.minimum(edges, ALMOST_INF)


class BinMapper:
    """Eğitim verisinden kutu sınırlarını öğrenir; veriyi uint8 kutu numaralarına çevirir."""

    def __init__(
        self, max_bins: int = 255, subsample: int | None = 200_000, random_state: Seed = None
    ) -> None:
        if not 2 <= max_bins <= 255:
            raise ValueError(f"max_bins 2 ile 255 arasında olmalı; verilen: {max_bins}")
        self.max_bins = max_bins
        self.subsample = subsample
        self.random_state = random_state

    @property
    def missing_bin(self) -> int:
        """Eksik değerlerin kutusu: her zaman son kutu."""
        return self.max_bins

    def fit(self, X: Array) -> Self:
        data = X
        if self.subsample is not None and X.shape[0] > self.subsample:
            rows = make_rng(self.random_state).choice(X.shape[0], self.subsample, replace=True)
            data = X[rows]
        self.thresholds_ = [_thresholds(data[:, j], self.max_bins) for j in range(X.shape[1])]
        self.n_bins_non_missing_ = np.array([t.size + 1 for t in self.thresholds_], dtype=np.int64)
        return self

    def transform(self, X: Array) -> Array:
        """(n, F) uint8 kutu matrisi; x ≤ eşik[b] olan en küçük b kutusu, NaN → son kutu."""
        binned = np.empty(X.shape, dtype=np.uint8)
        for j, edges in enumerate(self.thresholds_):
            column = X[:, j]
            bins = np.searchsorted(edges, column, side="left")
            binned[:, j] = np.where(np.isnan(column), self.missing_bin, bins)
        return binned

    def bin_threshold(self, feature: int, bin_index: int) -> float:
        """ "Kutu ≤ b" bölmesinin gerçek değer karşılığı (son dolu kutu için +∞)."""
        edges = self.thresholds_[feature]
        return float(edges[bin_index]) if bin_index < edges.size else float("inf")
