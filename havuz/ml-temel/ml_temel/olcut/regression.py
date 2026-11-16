"""Regresyon ölçütleri: RMSE, MAE, R² (ve MSE, MAPE).

  RMSE  √ortalama(hata²)   hedefle aynı birimde; büyük hataları daha ağır sayar
  MAE   ortalama(|hata|)   aynı birimde; aykırı değerlere daha dayanıklı, "tipik hata" olarak okunur
  R²    1 - Σhata² / Σ(y - ortalama)²   1 = kusursuz, 0 = hep ortalamayı söylemek kadar iyi,
        negatif = ortalamadan bile kötü
  MAPE  ortalama(|hata| / |y|)   yüzde hata; y sıfıra yakınsa anlamsızlaşır

Genişletme: yeni ölçüt için `mean_absolute_error`'ı kopyalayın ve `scorers.py`'ye kaydedin.
"""

from __future__ import annotations

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_consistent_length


def _targets(y_true: ArrayLike, y_pred: ArrayLike) -> tuple[Array, Array]:
    true = np.asarray(y_true, dtype=np.float64).reshape(-1)
    pred = np.asarray(y_pred, dtype=np.float64).reshape(-1)
    check_consistent_length(true, pred)
    if true.shape[0] == 0:
        raise ValueError("Ölçüt hesaplamak için en az bir örnek gerekir.")
    if not (np.isfinite(true).all() and np.isfinite(pred).all()):
        raise ValueError("y_true / y_pred içinde NaN ya da sonsuz değer var.")
    return true, pred


def mean_squared_error(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Ortalama kare hata (birimi hedefin karesidir; raporlarda RMSE daha okunaklıdır)."""
    true, pred = _targets(y_true, y_pred)
    return float(np.mean((true - pred) ** 2))


def root_mean_squared_error(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Kök ortalama kare hata (RMSE)."""
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))


def mean_absolute_error(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Ortalama mutlak hata (MAE)."""
    true, pred = _targets(y_true, y_pred)
    return float(np.mean(np.abs(true - pred)))


def mean_absolute_percentage_error(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Ortalama mutlak yüzde hata (oran olarak: 0.12 = %12). Sıfıra yakın hedeflerde kullanmayın."""
    true, pred = _targets(y_true, y_pred)
    scale = np.maximum(np.abs(true), float(np.finfo(np.float64).eps))
    return float(np.mean(np.abs(true - pred) / scale))


def r2_score(y_true: ArrayLike, y_pred: ArrayLike) -> float:
    """Belirleme katsayısı R². Hedef sabitse: kusursuz tahmin 1.0, değilse 0.0."""
    true, pred = _targets(y_true, y_pred)
    residual = float(np.sum((true - pred) ** 2))
    total = float(np.sum((true - true.mean()) ** 2))
    if total == 0.0:
        return 1.0 if residual == 0.0 else 0.0
    return 1.0 - residual / total
