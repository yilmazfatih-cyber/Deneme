"""İzolasyon ormanı (IsolationForest): etiketsiz veride aykırı değer bulma.

Fikir: aykırı noktalar "az ve farklı"dır; rastgele bölmelerle onları yalnız bırakmak kolaydır.
Her ağaç, satırların küçük bir alt örneklemiyle (varsayılan 256) kurulur: her düğümde rastgele
bir özellik ve o düğümdeki en küçük-en büyük değer arasında rastgele bir eşik seçilir. Bir
noktanın köke uzaklığı (yol uzunluğu) ağaçlar boyunca ortalanır; KISA yol = aykırı.

    skor(x) = 2^(-E[h(x)] / c(ψ)),   c(n) = 2·H(n-1) - 2(n-1)/n   (ψ: alt örneklem boyu)

`score_samples` scikit-learn'deki gibi bu skorun eksisini döndürür (küçük = daha aykırı).
`contamination="auto"` ise eşik -0.5'tir; oran verilirse eğitim skorlarının o kantili eşik olur.
`predict`: aykırıya -1, normale +1. Ağaçlar seviye seviye vektörel kurulur.
Genişletme: yeni bir aykırılık modeli için `fit` / `score_samples` / `predict` üçlüsünü örnek alın.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.klasik._tree_structure import NodeList, Tree
from ml_temel.ortak.base import BaseEstimator
from ml_temel.ortak.types import Array, ArrayLike, Seed
from ml_temel.ortak.validation import check_array, check_is_fitted, check_n_features, make_rng

_EULER = 0.5772156649015329


def average_path_length(n: Array) -> Array:
    """Başarısız ikili arama ağacı aramasının ortalama uzunluğu c(n); n ≤ 1 için 0, n = 2 için 1."""
    n = np.asarray(n, dtype=np.float64)
    result = np.zeros_like(n)
    result[n == 2] = 1.0
    big = n > 2
    result[big] = 2.0 * (np.log(n[big] - 1.0) + _EULER) - 2.0 * (n[big] - 1.0) / n[big]
    return result


def _isolation_tree(X: Array, max_depth: int, rng: np.random.Generator) -> tuple[Tree, Array]:
    """Rastgele bölmeli bir ağaç ve düğüm derinlikleri."""
    nodes = NodeList(1)
    depths = [0]
    rows = np.arange(X.shape[0])
    local = np.zeros(X.shape[0], dtype=np.int64)
    level = [nodes.add(np.zeros(1), X.shape[0])]
    depth = 0
    while level and depth < max_depth:
        order = np.argsort(local, kind="stable")
        rows, local = rows[order], local[order]
        counts = np.bincount(local, minlength=len(level))
        starts = np.r_[0, np.cumsum(counts)[:-1]]
        filled = counts > 0
        low = np.full((len(level), X.shape[1]), np.inf)
        high = np.full((len(level), X.shape[1]), -np.inf)
        low[filled] = np.minimum.reduceat(X[rows], starts[filled], axis=0)
        high[filled] = np.maximum.reduceat(X[rows], starts[filled], axis=0)
        varying = (high > low) & (counts > 1)[:, None]
        can_split = varying.any(axis=1)
        if not can_split.any():
            break
        feature = np.argmax(np.where(varying, rng.random(varying.shape), -1.0), axis=1)
        picked = np.arange(len(level))
        threshold = low[picked, feature] + rng.random(len(level)) * (
            high[picked, feature] - low[picked, feature]
        )
        children: list[int] = []
        for position in np.flatnonzero(can_split).tolist():
            pair = (nodes.add(np.zeros(1), 0), nodes.add(np.zeros(1), 0))
            depths.extend([depth + 1, depth + 1])
            split = (int(feature[position]), float(threshold[position]))
            nodes.split(level[position], split[0], split[1], False, pair, 0.0)
            children.extend(pair)
        moving = can_split[local]
        rows, local = rows[moving], local[moving]
        rank = np.cumsum(can_split) - 1
        go_right = X[rows, feature[local]] > threshold[local]
        local = 2 * rank[local] + go_right
        child_counts = np.bincount(local, minlength=len(children))
        for child, count in zip(children, child_counts.tolist(), strict=True):
            nodes.n_samples[child] = count
        level = children
        depth += 1
    return nodes.to_tree(), np.asarray(depths, dtype=np.float64)


class IsolationForest(BaseEstimator):
    """Aykırı değer dedektörü: `predict` aykırıya -1, normale +1 döndürür."""

    def __init__(
        self,
        n_estimators: int = 100,
        max_samples: Any = "auto",
        contamination: Any = "auto",
        random_state: Seed = None,
    ) -> None:
        self.n_estimators = n_estimators
        self.max_samples = max_samples
        self.contamination = contamination
        self.random_state = random_state

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        data = check_array(X)
        n_rows = data.shape[0]
        if self.max_samples == "auto":
            size = min(256, n_rows)
        elif isinstance(self.max_samples, float):
            size = max(2, int(self.max_samples * n_rows))
        else:
            size = min(int(self.max_samples), n_rows)
        rng = make_rng(self.random_state)
        max_depth = int(np.ceil(np.log2(max(size, 2))))
        self.trees_: list[Tree] = []
        self.depths_: list[Array] = []
        for _ in range(self.n_estimators):
            sample = rng.choice(n_rows, size=size, replace=False)
            tree, depths = _isolation_tree(data[sample], max_depth, rng)
            self.trees_.append(tree)
            self.depths_.append(depths)
        self.max_samples_ = size
        self.n_features_in_ = data.shape[1]
        if self.contamination == "auto":
            self.offset_ = -0.5
        else:
            if not 0.0 < float(self.contamination) <= 0.5:
                raise ValueError("contamination 'auto' ya da (0, 0.5] arası bir oran olmalı.")
            self.offset_ = float(
                np.percentile(self.score_samples(data), 100.0 * self.contamination)
            )
        return self

    def score_samples(self, X: ArrayLike) -> Array:
        """Eksi aykırılık skoru: küçük (daha eksi) değer daha aykırı demektir."""
        check_is_fitted(self, "trees_")
        data = check_array(X)
        check_n_features(self, data)
        total = np.zeros(data.shape[0])
        for tree, depths in zip(self.trees_, self.depths_, strict=True):
            leaf = tree.apply(data)
            total += depths[leaf] + average_path_length(tree.n_samples[leaf])
        mean_path = total / len(self.trees_)
        scale = float(average_path_length(np.array([self.max_samples_]))[0])
        return -(2.0 ** (-mean_path / max(scale, 1e-12)))

    def decision_function(self, X: ArrayLike) -> Array:
        """Eşiğe göre skor: negatif = aykırı."""
        return self.score_samples(X) - self.offset_

    def predict(self, X: ArrayLike) -> Array:
        return np.where(self.decision_function(X) < 0, -1, 1)

    def fit_predict(self, X: ArrayLike, y: Any = None) -> Array:
        return self.fit(X).predict(X)
