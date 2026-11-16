"""Kesin (exact) CART ağaç kurucu: seviye seviye, numpy ile vektörel bölme araması.

Fikir: bir düğümü bölmek için her aday özellikte değerleri sıralar ve ardışık iki farklı değerin
ortasındaki her eşiği deneriz. Sol ve sağ tarafın istatistikleri kümülatif toplamla bir seferde
bulunur. Hız için düğüm düğüm değil SEVİYE seviye çalışırız: aynı derinlikteki bütün düğümlerin
satırları "düğüm × değer sırası" anahtarıyla tek bir `argsort` ile sıralanır; böylece Python
döngüsü düğüm sayısıyla değil derinlik × aday özellik sayısıyla büyür.

Ölçütler, "vekil" (proxy) bir fonksiyonla kazanca çevrilir: kazanç = v(sol) + v(sağ) - v(ebeveyn).
  gini           v = Σ cₖ² / N                       (c: sınıfların ağırlıklı sayıları)
  entropy        v = Σ cₖ log₂ cₖ - N log₂ N
  squared_error  v = (Σ a·y)² / Σ a                  (a: örnek ağırlığı)
Bu kazanç, scikit-learn'ün "ağırlıklı safsızlık azalışı"nın kök ağırlığıyla çarpılmış hâlidir;
bu yüzden aynı eşikleri seçer (eşit kazançta seçim sırası farklı olabilir).
Genişletme: yeni bir ölçüt için `PROXIES` sözlüğüne bir vekil fonksiyon ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

from ml_temel.klasik._tree_structure import NodeList, Tree
from ml_temel.ortak.types import Array, IntArray


def _gini(stats: Array) -> Array:
    total = stats.sum(axis=-1)
    return (stats * stats).sum(axis=-1) / np.where(total > 0, total, 1.0)


def _xlog2x(values: Array) -> Array:
    return np.where(values > 0, values * np.log2(np.where(values > 0, values, 1.0)), 0.0)


def _entropy(stats: Array) -> Array:
    return _xlog2x(stats).sum(axis=-1) - _xlog2x(stats.sum(axis=-1))


def _squared_error(stats: Array) -> Array:
    weight = stats[..., 0]
    return stats[..., 1] ** 2 / np.where(weight > 0, weight, 1.0)


PROXIES: dict[str, Callable[[Array], Array]] = {
    "gini": _gini,
    "entropy": _entropy,
    "squared_error": _squared_error,
    # YENİ ÖLÇÜT BURAYA
}


@dataclass(frozen=True)
class CartSettings:
    """Ağaç büyüme ayarları (anlamları scikit-learn'deki aynı adlı parametrelerle aynıdır)."""

    criterion: str
    max_depth: int | None
    min_samples_split: int
    min_samples_leaf: int
    max_features: int
    min_impurity_decrease: float


def node_values(criterion: str, totals: Array) -> Array:
    """Düğüm tahmini: sınıflandırmada sınıf oranları, regresyonda ağırlıklı ortalama."""
    if criterion == "squared_error":
        return (totals[:, 1] / np.where(totals[:, 0] > 0, totals[:, 0], 1.0))[:, None]
    sums = totals.sum(axis=1, keepdims=True)
    return totals / np.where(sums > 0, sums, 1.0)


def _is_pure(criterion: str, totals: Array) -> Array:
    if criterion == "squared_error":
        weight = np.where(totals[:, 0] > 0, totals[:, 0], 1.0)
        mean_square = totals[:, 2] / weight
        variance = mean_square - (totals[:, 1] / weight) ** 2
        return np.asarray(variance <= 1e-12 * np.maximum(mean_square, 1e-300))
    return np.asarray((totals > 0).sum(axis=1) <= 1)


def dense_ranks(X: Array) -> IntArray:
    """Her sütunda değerlerin yoğun sırası (eşit değerler aynı sırayı alır)."""
    ranks = np.empty(X.shape, dtype=np.int64)
    for column in range(X.shape[1]):
        ranks[:, column] = np.unique(X[:, column], return_inverse=True)[1]
    return ranks


def _first_peak_per_owner(owners: IntArray, gain: Array) -> IntArray:
    """`owners` sıralıyken her sahibin en büyük kazancının İLK konumu (eşitlikte sol eşik)."""
    segment = np.flatnonzero(np.r_[True, owners[1:] != owners[:-1]])
    peak = np.maximum.reduceat(gain, segment)
    peaks = np.flatnonzero(gain == np.repeat(peak, np.diff(np.r_[segment, owners.size])))
    first: IntArray = peaks[np.r_[True, owners[peaks][1:] != owners[peaks][:-1]]]
    return first


def _best_splits(
    X: Array,
    ranks: IntArray,
    row_stats: Array,
    rows: IntArray,
    node: IntArray,
    totals: Array,
    counts: IntArray,
    settings: CartSettings,
    rng: np.random.Generator,
) -> tuple[Array, IntArray, Array]:
    """Bir seviyedeki A düğümün her biri için en iyi (kazanç, özellik, eşik)."""
    n_nodes, n_features = totals.shape[0], X.shape[1]
    if settings.max_features >= n_features:
        table = np.broadcast_to(np.arange(n_features), (n_nodes, n_features))
    else:  # her düğüm kendi rastgele özellik altkümesini dener (rastgele orman)
        table = np.argsort(rng.random((n_nodes, n_features)), axis=1)[:, : settings.max_features]
    proxy = PROXIES[settings.criterion]
    parent = proxy(totals)
    best_gain = np.full(n_nodes, -np.inf)
    best_feature = np.zeros(n_nodes, dtype=np.int64)
    best_threshold = np.zeros(n_nodes)
    stride = int(np.max(ranks, initial=0)) + 1
    for slot in range(table.shape[1]):
        row_features = table[:, slot][node]
        order = np.argsort(node * stride + ranks[rows, row_features])  # önce düğüm, sonra değer
        sorted_node, sorted_rows = node[order], rows[order]
        sorted_rank = ranks[sorted_rows, row_features[order]]
        sorted_stats = row_stats[sorted_rows]
        cumulative = np.cumsum(sorted_stats, axis=0)
        starts = np.searchsorted(sorted_node, np.arange(n_nodes))
        before = cumulative[starts] - sorted_stats[starts]  # her düğümün başından önceki toplam
        owner = sorted_node[:-1]
        left_count = np.arange(1, sorted_node.size) - starts[owner]
        valid = (
            (owner == sorted_node[1:])
            & (sorted_rank[:-1] < sorted_rank[1:])
            & (left_count >= settings.min_samples_leaf)
            & (counts[owner] - left_count >= settings.min_samples_leaf)
        )
        candidates = np.flatnonzero(valid)
        if candidates.size == 0:
            continue
        owners = owner[candidates]  # sıralı: aynı düğümün adayları yan yana
        left = cumulative[candidates] - before[owners]
        gain = proxy(left) + proxy(totals[owners] - left) - parent[owners]
        first = _first_peak_per_owner(owners, gain)
        winners, gains, spots = owners[first], gain[first], candidates[first]
        better = gains > best_gain[winners]
        winners, gains, spots = winners[better], gains[better], spots[better]
        feature = table[winners, slot]
        low, high = X[sorted_rows[spots], feature], X[sorted_rows[spots + 1], feature]
        middle = (low + high) / 2.0
        best_gain[winners] = gains
        best_feature[winners] = feature
        best_threshold[winners] = np.where((middle == high) | ~np.isfinite(middle), low, middle)
    return best_gain, best_feature, best_threshold


def build_cart(
    X: Array,
    row_stats: Array,
    settings: CartSettings,
    rng: np.random.Generator,
    ranks: IntArray | None = None,
) -> Tree:
    """Satır istatistiklerinden ağaç kurar.

    `row_stats`: sınıflandırmada ağırlıklı tek-sıcak (n, K); regresyonda (a, a·y, a·y²) (n, 3).
    `ranks`: `dense_ranks(X)`; ormanda bütün ağaçlar için bir kez hesaplanıp verilir.
    """
    if settings.criterion not in PROXIES:
        raise ValueError(
            f"Bilinmeyen ölçüt: '{settings.criterion}'. Geçerli olanlar: {', '.join(PROXIES)}."
        )
    width = 1 if settings.criterion == "squared_error" else row_stats.shape[1]
    ranks = dense_ranks(X) if ranks is None else ranks
    nodes = NodeList(width)
    rows = np.arange(X.shape[0])
    local = np.zeros(X.shape[0], dtype=np.int64)
    level = [nodes.add(np.zeros(width), X.shape[0])]
    root_weight = float(row_stats[:, 0].sum() if width == 1 else row_stats.sum())
    min_gain = settings.min_impurity_decrease * root_weight - 1e-12 * max(root_weight, 1.0)
    smallest_split = max(settings.min_samples_split, 2 * settings.min_samples_leaf)
    depth = 0
    while level:
        level_stats = row_stats[rows].T
        totals = np.column_stack([np.bincount(local, c, minlength=len(level)) for c in level_stats])
        counts = np.bincount(local, minlength=len(level))
        values = node_values(settings.criterion, totals)
        for position, node_id in enumerate(level):
            nodes.value[node_id] = values[position]
            nodes.n_samples[node_id] = int(counts[position])
        splittable = (counts >= smallest_split) & ~_is_pure(settings.criterion, totals)
        if settings.max_depth is not None and depth >= settings.max_depth:
            break
        if not splittable.any():
            break
        candidates = np.flatnonzero(splittable)
        remap = np.full(len(level), -1)
        remap[candidates] = np.arange(candidates.size)
        keep = splittable[local]
        rows, local = rows[keep], remap[local[keep]]
        gain, feature, threshold = _best_splits(
            X, ranks, row_stats, rows, local, totals[candidates], counts[candidates], settings, rng
        )
        do_split = np.isfinite(gain) & (gain >= min_gain)
        children: list[int] = []
        for winner in np.flatnonzero(do_split).tolist():
            pair = (nodes.add(np.zeros(width), 0), nodes.add(np.zeros(width), 0))
            nodes.split(
                level[candidates[winner]],
                int(feature[winner]),
                float(threshold[winner]),
                False,
                pair,
                float(gain[winner]),
            )
            children.extend(pair)
        moving = do_split[local]
        rows, local = rows[moving], local[moving]
        rank = np.cumsum(do_split) - 1
        go_right = X[rows, feature[local]] > threshold[local]
        local = 2 * rank[local] + go_right
        level = children
        depth += 1
    return nodes.to_tree()
