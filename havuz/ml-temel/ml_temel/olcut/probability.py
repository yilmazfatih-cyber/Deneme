"""Olasılık ölçütleri: log-kayıp, Brier skoru, kalibrasyon eğrisi ve ECE.

Fikir: iyi bir model yalnız doğru sıralamaz, olasılıkları da DOĞRU söyler: "%70" dediği
örneklerin gerçekten yaklaşık %70'i pozitif çıkmalıdır (kalibrasyon).

  log-kayıp  -ortalama(log p_doğru_sınıf). Kendinden emin yanlışları çok ağır cezalandırır.
  Brier      ortalama((p - y)²). 0 kusursuz; hep pozitif oranını söylemek ≈ oran·(1-oran).
  ECE        tahminler kutulara ayrılır; her kutuda |gerçek oran - ortalama tahmin| farkının
             kutu büyüklüğüyle ağırlıklı ortalaması. 0.02 altı genelde iyi kalibrasyondur.

Olasılıklar log(0) olmasın diye [ε, 1-ε] aralığına kırpılır.
Genişletme: yeni olasılık ölçütü için `brier_score_loss`'u kopyalayın.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.olcut.ranking import binarize_target
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_consistent_length, column_or_1d

_EPS = float(np.finfo(np.float64).eps)


def _positive_probability(y_prob: ArrayLike) -> Array:
    prob = np.asarray(y_prob, dtype=np.float64)
    if prob.ndim == 2 and prob.shape[1] == 2:
        prob = prob[:, 1]
    if prob.ndim != 1:
        raise ValueError(
            f"İkili ölçüt için y_prob 1 boyutlu olmalı; verilen biçim {prob.shape}. "
            "`predict_proba(X)[:, 1]` verin."
        )
    if ((prob < 0) | (prob > 1)).any() or np.isnan(prob).any():
        raise ValueError("y_prob 0 ile 1 arasında olasılıklar içermeli (NaN olmamalı).")
    return prob


def log_loss(y_true: ArrayLike, y_prob: ArrayLike, labels: ArrayLike | None = None) -> float:
    """Çapraz entropi. `y_prob` 1 boyutluysa pozitif (büyük etiketli) sınıfın olasılığıdır;
    2 boyutluysa sütunlar sıralı sınıflarla aynı sıradadır."""
    true = column_or_1d(y_true, name="y_true")
    prob = np.asarray(y_prob, dtype=np.float64)
    classes = np.unique(true) if labels is None else np.unique(np.asarray(labels))
    if prob.ndim == 1:
        prob = np.column_stack([1.0 - prob, prob])
    check_consistent_length(true, prob)
    if len(classes) == 1 and prob.shape[1] == 2:
        raise ValueError(
            "y_true içinde tek sınıf var; log-kayıp için iki sınıfı `labels=[...]` ile belirtin."
        )
    if prob.shape[1] != len(classes):
        raise ValueError(
            f"y_prob {prob.shape[1]} sütunlu ama {len(classes)} sınıf var; sütun sayısı sınıf "
            "sayısına eşit ve `classes_` sırasında olmalı."
        )
    prob = np.clip(prob, _EPS, 1.0 - _EPS)
    prob = prob / prob.sum(axis=1, keepdims=True)
    codes = np.searchsorted(classes, true)
    return float(-np.mean(np.log(prob[np.arange(true.shape[0]), codes])))


def brier_score_loss(y_true: ArrayLike, y_prob: ArrayLike, pos_label: Any = None) -> float:
    """İkili Brier skoru: tahmin edilen olasılık ile 0/1 sonuç arasındaki ortalama kare fark."""
    target = binarize_target(y_true, pos_label)
    prob = _positive_probability(y_prob)
    check_consistent_length(target, prob)
    return float(np.mean((prob - target) ** 2))


def _bin_edges(prob: Array, n_bins: int, strategy: str) -> Array:
    if strategy == "uniform":
        return np.linspace(0.0, 1.0, n_bins + 1)
    if strategy == "quantile":
        return np.quantile(prob, np.linspace(0.0, 1.0, n_bins + 1))
    raise ValueError(f"strategy 'uniform' ya da 'quantile' olmalı; verilen: '{strategy}'.")


def calibration_table(
    y_true: ArrayLike,
    y_prob: ArrayLike,
    n_bins: int = 10,
    strategy: str = "uniform",
    pos_label: Any = None,
) -> tuple[Array, Array, Array]:
    """Dolu kutular için (ortalama tahmin, gerçek pozitif oranı, örnek sayısı)."""
    target = binarize_target(y_true, pos_label)
    prob = _positive_probability(y_prob)
    check_consistent_length(target, prob)
    edges = _bin_edges(prob, n_bins, strategy)
    # scikit-learn ile aynı kural: kutular (alt, üst] aralığıdır; sınırdaki değer alt kutuya düşer.
    bins = np.searchsorted(edges[1:-1], prob, side="left")
    counts = np.bincount(bins, minlength=n_bins)
    filled = counts > 0
    mean_predicted = np.bincount(bins, weights=prob, minlength=n_bins)[filled] / counts[filled]
    fraction_positive = np.bincount(bins, weights=target, minlength=n_bins)[filled] / counts[filled]
    return mean_predicted, fraction_positive, counts[filled]


def calibration_curve(
    y_true: ArrayLike,
    y_prob: ArrayLike,
    n_bins: int = 5,
    strategy: str = "uniform",
    pos_label: Any = None,
) -> tuple[Array, Array]:
    """scikit-learn ile aynı sırada: (gerçek pozitif oranı, ortalama tahmin)."""
    predicted, positive, _ = calibration_table(y_true, y_prob, n_bins, strategy, pos_label)
    return positive, predicted


def expected_calibration_error(
    y_true: ArrayLike,
    y_prob: ArrayLike,
    n_bins: int = 10,
    strategy: str = "uniform",
    pos_label: Any = None,
) -> float:
    """Beklenen kalibrasyon hatası (ECE): kutu büyüklüğüyle ağırlıklı |gerçek oran - tahmin|."""
    predicted, positive, counts = calibration_table(y_true, y_prob, n_bins, strategy, pos_label)
    return float(np.sum(counts * np.abs(positive - predicted)) / counts.sum())
