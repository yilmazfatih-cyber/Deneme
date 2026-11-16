"""Histogram tabanlı ağaç büyütücü (gradyan artırma için): Newton adımlı, yaprak öncelikli.

Fikir (XGBoost / LightGBM / scikit-learn HGB ile aynı): her satırın kaybının gradyanı g ve
ikinci türevi h verilir. Bir düğümün en iyi sabit katkısı -G/(H + λ), bölmenin kazancı

    kazanç = G_sol²/(H_sol + λ) + G_sağ²/(H_sağ + λ) - G²/(H + λ)

(G, H: düğümdeki toplamlar). Bir düğümün bütün özellikleri için kutu başına (g, h, sayı)
toplamları histogramda birikir; kümülatif toplamla her kutu sınırı tek seferde denenir.
Eksik değerler için iki yön denenir: eksikler sağa (soldan tarama) ya da sola (sağdan tarama).

Hız hileleri: (1) çıkarma hilesi — küçük çocuğun histogramı hesaplanır, büyük çocuğunki
"ebeveyn - küçük" olarak bulunur; (2) en çok kazançlı yaprak önce bölünür (`max_leaf_nodes`).
Genişletme: özellik alt örneklemesi gibi bir ayar için `GrowerSettings`'e alan ekleyip
`find_split` içinde uygulayın.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field

import numpy as np

from ml_temel.klasik._binning import BinMapper
from ml_temel.klasik._tree_structure import NodeList, Tree
from ml_temel.ortak.types import Array, IntArray

_SMALL_NODE = 4000  # bu kadar satırdan az düğümde histogram tek düz `bincount` ile kurulur


@dataclass(frozen=True)
class GrowerSettings:
    """Ağaç büyüme ayarları (scikit-learn HistGradientBoosting ile aynı anlamda)."""

    max_leaf_nodes: int | None
    max_depth: int | None
    min_samples_leaf: int
    l2_regularization: float
    shrinkage: float
    min_hessian_to_split: float = 1e-3


@dataclass(frozen=True)
class Split:
    """Bir düğümün en iyi bölmesi ve iki çocuğun (G, H, sayı) toplamları."""

    gain: float
    feature: int
    bin: int
    missing_left: bool
    left: tuple[float, float, int]
    right: tuple[float, float, int]


@dataclass(order=True)
class _Pending:
    """Bölünmeyi bekleyen yaprak (öncelik: büyük kazanç önce)."""

    priority: float
    node_id: int
    rows: IntArray = field(compare=False)
    histogram: Array = field(compare=False)
    split: Split = field(compare=False)
    depth: int = field(compare=False)


class HistogramBuilder:
    """Kutulanmış veriyi iki düzende tutar ve düğüm histogramlarını (F, kutu, 3) kurar."""

    def __init__(self, binned: Array, n_bins: int) -> None:
        self.by_row = np.ascontiguousarray(binned)
        self.by_column = np.asfortranarray(binned)
        self.n_bins = n_bins
        self.offsets = np.arange(binned.shape[1], dtype=np.intp) * n_bins
        self._root_counts: Array | None = None  # kökte satırlar hiç değişmez: sayımlar bir kez

    def build(self, rows: IntArray | None, grad: Array, hess: Array | None) -> Array:
        """Kanallar: 0 = Σg, 1 = Σh (hess None ise sayı), 2 = satır sayısı."""
        n_features, n_bins = self.by_row.shape[1], self.n_bins
        g = grad if rows is None else grad[rows]
        h = None if hess is None else (hess if rows is None else hess[rows])
        histogram = np.empty((n_features, n_bins, 3))
        if rows is not None and rows.size < _SMALL_NODE:
            flat = (self.by_row[rows].astype(np.intp) + self.offsets).ravel()
            size = n_features * n_bins
            histogram[:, :, 0] = np.bincount(flat, np.repeat(g, n_features), size).reshape(
                -1, n_bins
            )
            histogram[:, :, 2] = np.bincount(flat, minlength=size).reshape(-1, n_bins)
            if h is not None:
                weights = np.repeat(h, n_features)
                histogram[:, :, 1] = np.bincount(flat, weights, size).reshape(-1, n_bins)
        else:
            cached = rows is None and self._root_counts is not None
            for j in range(n_features):
                column = self.by_column[:, j] if rows is None else self.by_column[rows, j]
                column = column.astype(np.intp)
                histogram[j, :, 0] = np.bincount(column, g, n_bins)
                if not cached:
                    histogram[j, :, 2] = np.bincount(column, minlength=n_bins)
                if h is not None:
                    histogram[j, :, 1] = np.bincount(column, h, n_bins)
            if rows is None:
                if self._root_counts is None:
                    self._root_counts = histogram[:, :, 2].copy()
                histogram[:, :, 2] = self._root_counts
        if h is None:
            histogram[:, :, 1] = histogram[:, :, 2]
        return histogram


def find_split(
    histogram: Array, n_bins_non_missing: IntArray, settings: GrowerSettings
) -> Split | None:
    """Histogramdan en iyi bölmeyi bulur; kazanç pozitif bölme yoksa None."""
    lam = settings.l2_regularization
    total_g, total_h, total_n = histogram[0].sum(axis=0)
    observed = histogram[:, :-1, :]  # son kutu: eksik değerler
    missing = histogram[:, -1, :]
    cumulative = np.cumsum(observed, axis=1)
    has_missing = missing[:, 2] > 0
    bins = np.arange(observed.shape[1])
    parent_score = total_g**2 / (total_h + lam)

    def scan(left: Array, valid: Array) -> Array:
        lg, lh, ln = left[..., 0], left[..., 1], left[..., 2]
        rg, rh, rn = total_g - lg, total_h - lh, total_n - ln
        ok = (
            valid
            & (ln >= settings.min_samples_leaf)
            & (rn >= settings.min_samples_leaf)
            & (lh >= settings.min_hessian_to_split)
            & (rh >= settings.min_hessian_to_split)
        )
        with np.errstate(divide="ignore", invalid="ignore"):
            gain = lg**2 / (lh + lam) + rg**2 / (rh + lam) - parent_score
        return np.where(ok, gain, -np.inf)

    last = n_bins_non_missing - 1
    # A: eksikler sağa. Eksik varsa son dolu kutuya kadar (hepsi sol, eksikler sağ) denenir.
    gain_a = scan(cumulative, bins[None, :] < (last + has_missing)[:, None])
    best_a = gain_a.max(axis=1)
    use_b = np.zeros(best_a.shape, dtype=bool)
    per_feature = best_a
    gain_b = gain_a
    if has_missing.any():  # B: eksikler sola (yalnız eksiği olan özelliklerde denenir)
        gain_b = scan(
            cumulative + missing[:, None, :], has_missing[:, None] & (bins < last[:, None])
        )
        best_b = gain_b.max(axis=1)
        use_b = best_b > best_a
        per_feature = np.where(use_b, best_b, best_a)
    feature = int(np.argmax(per_feature))
    gain = float(per_feature[feature])
    if not gain > 0.0:
        return None
    missing_left = bool(use_b[feature])
    bin_index = int(np.argmax((gain_b if missing_left else gain_a)[feature]))
    left = cumulative[feature, bin_index] + (missing[feature] if missing_left else 0.0)
    return Split(
        gain=gain,
        feature=feature,
        bin=bin_index,
        missing_left=missing_left,
        left=(float(left[0]), float(left[1]), int(left[2])),
        right=(float(total_g - left[0]), float(total_h - left[1]), int(total_n - left[2])),
    )


def _leaf_value(g: float, h: float, settings: GrowerSettings) -> float:
    return -g / (h + settings.l2_regularization) * settings.shrinkage


def grow_tree(
    builder: HistogramBuilder,
    mapper: BinMapper,
    grad: Array,
    hess: Array | None,
    settings: GrowerSettings,
    feature_has_missing: Array,
) -> tuple[Tree, list[tuple[IntArray, float]]]:
    """Bir ağaç büyütür; (ağaç, [(yaprağın eğitim satırları, yaprak değeri), ...]) döndürür."""
    n_rows = builder.by_row.shape[0]
    n_nm = mapper.n_bins_non_missing_
    nodes = NodeList(1)
    root_hist = builder.build(None, grad, hess)
    total_g, total_h, total_n = root_hist[0].sum(axis=0)
    root = nodes.add(np.array([_leaf_value(total_g, total_h, settings)]), int(total_n))
    leaves: dict[int, IntArray] = {root: np.arange(n_rows)}
    heap: list[_Pending] = []

    def consider(node_id: int, rows: IntArray, histogram: Array, depth: int) -> None:
        if settings.max_depth is not None and depth >= settings.max_depth:
            return
        if rows.size < 2 * settings.min_samples_leaf:
            return
        split = find_split(histogram, n_nm, settings)
        if split is not None:
            heapq.heappush(heap, _Pending(-split.gain, node_id, rows, histogram, split, depth))

    consider(root, leaves[root], root_hist, 0)
    n_leaves = 1
    while heap and (settings.max_leaf_nodes is None or n_leaves < settings.max_leaf_nodes):
        pending = heapq.heappop(heap)
        split = pending.split
        column = builder.by_column[pending.rows, split.feature]
        is_missing = column == mapper.missing_bin
        go_left = np.where(is_missing, split.missing_left, column <= split.bin)
        left_rows, right_rows = pending.rows[go_left], pending.rows[~go_left]
        left_id = nodes.add(np.array([_leaf_value(*split.left[:2], settings)]), left_rows.size)
        right_id = nodes.add(np.array([_leaf_value(*split.right[:2], settings)]), right_rows.size)
        missing_left = split.missing_left
        if not feature_has_missing[split.feature]:  # eğitimde eksik yoktu: kalabalık çocuğa
            missing_left = left_rows.size > right_rows.size
        threshold = mapper.bin_threshold(split.feature, split.bin)
        children = (left_id, right_id)
        nodes.split(pending.node_id, split.feature, threshold, missing_left, children, split.gain)
        del leaves[pending.node_id]
        leaves[left_id], leaves[right_id] = left_rows, right_rows
        n_leaves += 1
        small_is_left = left_rows.size <= right_rows.size
        small_rows = left_rows if small_is_left else right_rows
        small_hist = builder.build(small_rows, grad, hess)
        large_hist = pending.histogram - small_hist  # çıkarma hilesi
        left_hist, right_hist = (
            (small_hist, large_hist) if small_is_left else (large_hist, small_hist)
        )
        consider(left_id, left_rows, left_hist, pending.depth + 1)
        consider(right_id, right_rows, right_hist, pending.depth + 1)
    tree = nodes.to_tree()
    return tree, [(rows, float(tree.value[node, 0])) for node, rows in leaves.items()]
