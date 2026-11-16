"""K-means kümeleme (k-means++ başlatmasıyla).

Fikir: veriyi k kümeye ayır; her nokta en yakın merkeze atanır, her merkez kendi noktalarının
ortalamasına taşınır; atamalar değişmeyene kadar sürer (Lloyd algoritması). Amaç, noktaların
merkezlerine uzaklıklarının kareleri toplamını (inertia) küçültmektir; ama yalnız yerel en iyiye
ulaşılır. Bu yüzden:

  k-means++   ilk merkezleri birbirinden uzak seçer (uzaklığın karesiyle orantılı olasılık);
              her adımda birkaç aday dener ve toplamı en çok düşüreni alır (scikit-learn'deki gibi).
  n_init      algoritma farklı tohumlarla `n_init` kez çalışır, en küçük inertia'lı sonuç kalır.

Boş kalan küme, merkezine en uzak noktaya taşınır. Uzaklığa dayandığı için önce ölçekleyin.
Genişletme: farklı bir başlatma için `_kmeans_plus_plus`'ın yanına bir fonksiyon yazıp `fit`'te
çağırın.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array, ArrayLike, IntArray, Seed
from ml_temel.ortak.validation import check_array, check_is_fitted, check_n_features, make_rng


def squared_distances(X: Array, centers: Array) -> Array:
    """Her noktanın her merkeze uzaklığının karesi (n × k)."""
    squared = (X * X).sum(axis=1)[:, None] - 2.0 * (X @ centers.T) + (centers * centers).sum(axis=1)
    return np.maximum(squared, 0.0)


def _kmeans_plus_plus(X: Array, k: int, rng: np.random.Generator) -> Array:
    """Açgözlü k-means++: her yeni merkez için 2 + ln(k) aday çekilir, en iyisi seçilir."""
    n_samples = X.shape[0]
    trials = 2 + int(np.log(k))
    centers = np.empty((k, X.shape[1]))
    centers[0] = X[rng.integers(n_samples)]
    closest = squared_distances(X, centers[:1])[:, 0]
    for c in range(1, k):
        total = closest.sum()
        if total <= 0.0:  # bütün noktalar mevcut merkezlerin üstünde: rastgele seç
            centers[c] = X[rng.integers(n_samples)]
            continue
        candidates = np.searchsorted(np.cumsum(closest), rng.random(trials) * total)
        candidates = np.minimum(candidates, n_samples - 1)
        candidate_d = np.minimum(closest[None, :], squared_distances(X, X[candidates]).T)
        best = int(np.argmin(candidate_d.sum(axis=1)))
        centers[c] = X[candidates[best]]
        closest = candidate_d[best]
    return centers


def _lloyd(
    X: Array, centers: Array, max_iter: int, tol: float
) -> tuple[Array, IntArray, float, int]:
    """Atama ve ortalama adımlarını yakınsayana dek yineler: (merkezler, etiket, inertia, adım)."""
    k = centers.shape[0]
    labels = np.zeros(X.shape[0], dtype=np.int64)
    steps = 0
    for _ in range(max_iter):
        steps += 1
        distances = squared_distances(X, centers)
        labels = distances.argmin(axis=1)
        counts = np.bincount(labels, minlength=k)
        sums = np.zeros_like(centers)
        np.add.at(sums, labels, X)
        new_centers = centers.copy()
        filled = counts > 0
        new_centers[filled] = sums[filled] / counts[filled, None]
        if not filled.all():  # boş küme: en kötü temsil edilen noktaya taşı
            nearest = distances[np.arange(X.shape[0]), labels]
            far = np.argsort(-nearest)[: int((~filled).sum())]
            new_centers[~filled] = X[far]
        shift = float(((new_centers - centers) ** 2).sum())
        centers = new_centers
        if shift <= tol:
            break
    distances = squared_distances(X, centers)
    labels = distances.argmin(axis=1)
    inertia = float(distances[np.arange(X.shape[0]), labels].sum())
    return centers, labels, inertia, steps


class KMeans(BaseEstimator, TransformerMixin):
    """k kümeli K-means. `labels_`, `cluster_centers_`, `inertia_` alanlarını öğrenir."""

    def __init__(
        self,
        n_clusters: int = 8,
        n_init: int = 10,
        max_iter: int = 300,
        tol: float = 1e-4,
        random_state: Seed = None,
    ) -> None:
        self.n_clusters = n_clusters
        self.n_init = n_init
        self.max_iter = max_iter
        self.tol = tol
        self.random_state = random_state

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        data = check_array(X)
        if not 1 <= self.n_clusters <= data.shape[0]:
            raise ValueError(
                f"n_clusters 1 ile satır sayısı ({data.shape[0]}) arasında olmalı; "
                f"verilen: {self.n_clusters}."
            )
        rng = make_rng(self.random_state)
        tolerance = self.tol * float(np.mean(np.var(data, axis=0)))  # ölçeğe göre eşik
        best: tuple[Array, IntArray, float, int] | None = None
        for _ in range(max(1, self.n_init)):
            start = _kmeans_plus_plus(data, self.n_clusters, rng)
            result = _lloyd(data, start, self.max_iter, tolerance)
            if best is None or result[2] < best[2]:
                best = result
        assert best is not None
        self.cluster_centers_, self.labels_, self.inertia_, self.n_iter_ = best
        self.n_features_in_ = data.shape[1]
        return self

    def _checked(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "cluster_centers_")
        data = check_array(X)
        check_n_features(self, data)
        return data

    def predict(self, X: ArrayLike) -> IntArray:
        """Her noktanın en yakın küme merkezinin numarası."""
        labels: IntArray = squared_distances(self._checked(X), self.cluster_centers_).argmin(axis=1)
        return labels

    def fit_predict(self, X: ArrayLike, y: Any = None) -> IntArray:
        labels: IntArray = self.fit(X).labels_
        return labels

    def transform(self, X: ArrayLike) -> Array:
        """Her noktanın her merkeze (kareköklü) uzaklığı: n × k."""
        return np.sqrt(squared_distances(self._checked(X), self.cluster_centers_))

    def score(self, X: ArrayLike, y: Any = None) -> float:
        """Eksi inertia (büyük olan iyidir; scikit-learn ile aynı)."""
        distances = squared_distances(self._checked(X), self.cluster_centers_)
        return -float(distances.min(axis=1).sum())
