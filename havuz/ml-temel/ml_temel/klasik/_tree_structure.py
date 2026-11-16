"""Tree: eğitilmiş bir karar ağacının dizi (array) gösterimi ve vektörel tahmin.

Fikir: düğümleri nesne olarak değil, paralel dizilerde tutarız: i. düğümün bölme özelliği
`feature[i]`, eşiği `threshold[i]`, çocukları `left[i]` / `right[i]`. Yapraklarda `feature = -1`.
Tahminde bütün satırlar kökten başlar; her turda henüz yaprağa ulaşmamış satırlar bir seviye
iner (x ≤ eşik → sol). Tur sayısı ağacın derinliği kadardır; her tur numpy ile vektöreldir.
Eksik değer (NaN) `missing_left[i]` doğruysa sola, değilse sağa gider.

Kim kullanır: `_cart.py` (kesin ağaç), `_hist_grower.py` (histogram ağacı), `tree.py`,
`forest.py`, `boosting.py`, `isolation.py`.
Genişletme: yeni bir düğüm bilgisi gerekiyorsa `NodeList`'e ve `Tree.__init__`'e alan ekleyin.
"""

from __future__ import annotations

import numpy as np

from ml_temel.ortak.types import Array, IntArray


class Tree:
    """Paralel dizilerle karar ağacı. `value[i]`: düğümün tahmini (olasılıklar ya da sayı)."""

    def __init__(
        self,
        feature: IntArray,
        threshold: Array,
        missing_left: Array,
        left: IntArray,
        right: IntArray,
        value: Array,
        n_samples: IntArray,
        gain: Array,
    ) -> None:
        self.feature = feature
        self.threshold = threshold
        self.missing_left = missing_left
        self.left = left
        self.right = right
        self.value = value
        self.n_samples = n_samples
        self.gain = gain

    @property
    def node_count(self) -> int:
        return int(self.feature.shape[0])

    @property
    def n_leaves(self) -> int:
        return int((self.feature < 0).sum())

    @property
    def max_depth(self) -> int:
        """Kökten en uzak yaprağa kenar sayısı."""
        depth = np.zeros(self.node_count, dtype=np.int64)
        for node in range(self.node_count):  # çocuklar her zaman ebeveynden sonra eklenir
            if self.feature[node] >= 0:
                depth[self.left[node]] = depth[self.right[node]] = depth[node] + 1
        return int(np.max(depth))

    def apply(self, X: Array) -> IntArray:
        """Her satırın düştüğü yaprağın düğüm numarası."""
        node = np.zeros(X.shape[0], dtype=np.int64)
        active = np.flatnonzero(self.feature[node] >= 0)
        while active.size:
            current = node[active]
            values = X[active, self.feature[current]]
            go_left = values <= self.threshold[current]
            missing = np.isnan(values)
            if missing.any():
                go_left = np.where(missing, self.missing_left[current], go_left)
            node[active] = np.where(go_left, self.left[current], self.right[current])
            active = active[self.feature[node[active]] >= 0]
        return node

    def predict(self, X: Array) -> Array:
        """Her satırın yaprak değeri (biçim: satır × değer genişliği)."""
        values: Array = self.value[self.apply(X)]
        return values

    def feature_importances(self, n_features: int) -> Array:
        """Bölmelerin kazançlarının özellik başına toplamı, toplamı 1'e normalleştirilmiş."""
        internal = self.feature >= 0
        totals = np.bincount(
            self.feature[internal], weights=self.gain[internal], minlength=n_features
        )
        total = float(totals.sum())
        return totals / total if total > 0 else totals


class NodeList:
    """Ağaç kurulurken düğümleri biriktiren yardımcı; `to_tree` ile `Tree`'ye çevrilir."""

    def __init__(self, value_width: int) -> None:
        self.value_width = value_width
        self.feature: list[int] = []
        self.threshold: list[float] = []
        self.missing_left: list[bool] = []
        self.left: list[int] = []
        self.right: list[int] = []
        self.value: list[Array] = []
        self.n_samples: list[int] = []
        self.gain: list[float] = []

    def add(self, value: Array, n_samples: int) -> int:
        """Yeni bir yaprak ekler ve numarasını döndürür (sonradan `split` ile iç düğüm olabilir)."""
        self.feature.append(-1)
        self.threshold.append(np.nan)
        self.missing_left.append(False)
        self.left.append(-1)
        self.right.append(-1)
        self.value.append(np.asarray(value, dtype=np.float64).reshape(self.value_width))
        self.n_samples.append(int(n_samples))
        self.gain.append(0.0)
        return len(self.feature) - 1

    def split(
        self,
        node: int,
        feature: int,
        threshold: float,
        missing_left: bool,
        children: tuple[int, int],
        gain: float,
    ) -> None:
        """Bir yaprağı iç düğüme çevirir."""
        self.feature[node] = int(feature)
        self.threshold[node] = float(threshold)
        self.missing_left[node] = bool(missing_left)
        self.left[node], self.right[node] = children
        self.gain[node] = float(gain)

    def to_tree(self) -> Tree:
        return Tree(
            feature=np.asarray(self.feature, dtype=np.int64),
            threshold=np.asarray(self.threshold, dtype=np.float64),
            missing_left=np.asarray(self.missing_left, dtype=bool),
            left=np.asarray(self.left, dtype=np.int64),
            right=np.asarray(self.right, dtype=np.int64),
            value=np.vstack(self.value) if self.value else np.empty((0, self.value_width)),
            n_samples=np.asarray(self.n_samples, dtype=np.int64),
            gain=np.asarray(self.gain, dtype=np.float64),
        )
