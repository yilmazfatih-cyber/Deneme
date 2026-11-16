"""En yakın komşular (k-NN): sınıflandırma ve regresyon.

Fikir: yeni bir noktanın etiketini, eğitim verisindeki en yakın k noktanın etiketlerinden
çıkar (çoğunluk oyu ya da ortalama). "Eğitim" yalnız veriyi saklamaktır; bütün iş tahminde
yapılır. Uzaklık, ölçeğe çok duyarlıdır: önce `StandardScaler` kullanın.

Uzaklıklar parça parça (bellek sınırlı) kaba kuvvetle hesaplanır:
||a - b||² = ||a||² + ||b||² - 2a·b.
`weights="distance"`: yakın komşunun oyu 1/uzaklık kadar güçlüdür; uzaklığı 0 olan komşu varsa
yalnız onlar sayılır.
Genişletme: yeni bir uzaklık türü için `_pairwise` fonksiyonuna bir dal ekleyin.
"""

from __future__ import annotations

from typing import Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, ClassifierMixin, RegressorMixin
from ml_temel.ortak.types import Array, ArrayLike, IntArray
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_regression_target,
    check_X_y,
    encode_labels,
)

_CHUNK_ELEMENTS = 4_000_000  # bir parçada en çok (sorgu satırı × eğitim satırı) uzaklık


def _pairwise(A: Array, B: Array, metric: str) -> Array:
    """A'nın her satırının B'nin her satırına uzaklığı (len(A) × len(B))."""
    if metric == "euclidean":
        squared = (A * A).sum(axis=1)[:, None] + (B * B).sum(axis=1)[None, :] - 2.0 * (A @ B.T)
        return np.sqrt(np.maximum(squared, 0.0))
    if metric == "manhattan":
        return np.abs(A[:, None, :] - B[None, :, :]).sum(axis=2)
    raise ValueError(f"metric 'euclidean' ya da 'manhattan' olmalı; verilen: '{metric}'.")


class _NeighborsBase(BaseEstimator):
    """Ortak: veriyi saklama ve en yakın k komşuyu bulma."""

    _fit_data: Array

    def __init__(
        self, n_neighbors: int = 5, weights: str = "uniform", metric: str = "euclidean"
    ) -> None:
        self.n_neighbors = n_neighbors
        self.weights = weights
        self.metric = metric

    def _store(self, X: Array) -> None:
        if self.weights not in ("uniform", "distance"):
            raise ValueError("weights 'uniform' ya da 'distance' olmalı.")
        if not 1 <= self.n_neighbors <= X.shape[0]:
            raise ValueError(
                f"n_neighbors 1 ile eğitim satırı sayısı ({X.shape[0]}) arasında olmalı; "
                f"verilen: {self.n_neighbors}."
            )
        self._fit_data = X
        self.n_features_in_ = X.shape[1]

    def kneighbors(self, X: ArrayLike, n_neighbors: int | None = None) -> tuple[Array, IntArray]:
        """(uzaklıklar, eğitim satırı indeksleri), her biri (n_sorgu, k); yakından uzağa sıralı."""
        check_is_fitted(self, "_fit_data")
        data = check_array(X)
        check_n_features(self, data)
        k = self.n_neighbors if n_neighbors is None else n_neighbors
        chunk = max(1, _CHUNK_ELEMENTS // max(self._fit_data.shape[0], 1))
        distances = np.empty((data.shape[0], k))
        indices = np.empty((data.shape[0], k), dtype=np.int64)
        for start in range(0, data.shape[0], chunk):
            block = _pairwise(data[start : start + chunk], self._fit_data, self.metric)
            nearest = np.argpartition(block, k - 1, axis=1)[:, :k]
            nearest_d = np.take_along_axis(block, nearest, axis=1)
            order = np.argsort(nearest_d, axis=1, kind="stable")
            indices[start : start + chunk] = np.take_along_axis(nearest, order, axis=1)
            distances[start : start + chunk] = np.take_along_axis(nearest_d, order, axis=1)
        return distances, indices

    def _neighbor_weights(self, distances: Array) -> Array:
        if self.weights == "uniform":
            return np.ones_like(distances)
        with np.errstate(divide="ignore"):
            inverse = 1.0 / distances
        exact = np.isinf(inverse)
        rows = exact.any(axis=1)
        inverse[rows] = exact[rows]  # sıfır uzaklıklı komşu varsa yalnız onlar oy verir
        return inverse


class KNeighborsClassifier(_NeighborsBase, ClassifierMixin):
    """En yakın k komşunun (ağırlıklı) oy çokluğu. Eşitlikte küçük sınıf numarası kazanır."""

    def fit(self, X: ArrayLike, y: ArrayLike) -> Self:
        data, target = check_X_y(X, y)
        self.classes_, self._codes = encode_labels(target)
        self._store(data)
        return self

    def predict_proba(self, X: ArrayLike) -> Array:
        distances, indices = self.kneighbors(X)
        weights = self._neighbor_weights(distances)
        votes = np.zeros((indices.shape[0], len(self.classes_)))
        rows = np.repeat(np.arange(indices.shape[0]), indices.shape[1])
        np.add.at(votes, (rows, self._codes[indices].ravel()), weights.ravel())
        return votes / votes.sum(axis=1, keepdims=True)

    def predict(self, X: ArrayLike) -> Array:
        labels: Array = self.classes_[self.predict_proba(X).argmax(axis=1)]
        return labels


class KNeighborsRegressor(_NeighborsBase, RegressorMixin):
    """En yakın k komşunun hedeflerinin (ağırlıklı) ortalaması."""

    def fit(self, X: ArrayLike, y: ArrayLike) -> Self:
        data, target = check_X_y(X, y)
        self._target = check_regression_target(target)
        self._store(data)
        return self

    def predict(self, X: ArrayLike) -> Array:
        distances, indices = self.kneighbors(X)
        weights = self._neighbor_weights(distances)
        prediction: Array = (self._target[indices] * weights).sum(axis=1) / weights.sum(axis=1)
        return prediction
