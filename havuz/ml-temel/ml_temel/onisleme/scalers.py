"""Ölçekleyiciler: StandardScaler (ortalama 0, sapma 1) ve MinMaxScaler ([0, 1] aralığı).

Fikir: "yaş" 20–80, "gelir" 10 000–500 000 arasında değişir. Uzaklığa (k-NN, k-means), gradyana
(lojistik regresyon, sinir ağı) ya da cezaya (ridge) dayanan modeller büyük sayılı sütunu daha
önemli sanır. Ölçekleme sütunları aynı teraziye koyar. Ağaç tabanlı modeller ölçeklemeye
ihtiyaç duymaz.

SIZINTI: ortalama ve sapma yalnız EĞİTİM verisinden öğrenilir (`fit`), sınama verisine aynen
uygulanır (`transform`). Bunu kendiliğinden sağlamak için ölçekleyiciyi `Pipeline` içine koyun.
Eksik değerler (NaN) hesaba katılmaz ve olduğu gibi bırakılır.
Genişletme: yeni ölçekleyici için `MinMaxScaler`'ı kopyalayın.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import check_array, check_is_fitted, check_n_features


def _nan_mean_std(X: Array) -> tuple[Array, Array]:
    """Sütun ortalaması ve standart sapması; NaN'lar sayılmaz, tümü NaN olan sütun (0, 0) verir."""
    present = ~np.isnan(X)
    count = np.maximum(present.sum(axis=0), 1)
    filled = np.where(present, X, 0.0)
    mean = filled.sum(axis=0) / count
    variance = (np.where(present, X - mean, 0.0) ** 2).sum(axis=0) / count
    return mean, np.sqrt(variance)


class StandardScaler(BaseEstimator, TransformerMixin):
    """z = (x - ortalama) / standart sapma. Sabit sütunlar bölünmez (sapma 1 sayılır)."""

    def __init__(self, with_mean: bool = True, with_std: bool = True) -> None:
        self.with_mean = with_mean
        self.with_std = with_std

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        data = check_array(X, allow_nan=True)
        mean, std = _nan_mean_std(data)
        self.n_features_in_ = data.shape[1]
        self.mean_ = mean if self.with_mean else np.zeros(data.shape[1])
        self.var_ = std**2
        self.scale_ = np.where(std > 0, std, 1.0) if self.with_std else np.ones(data.shape[1])
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "scale_")
        data = check_array(X, allow_nan=True)
        check_n_features(self, data)
        return (data - self.mean_) / self.scale_

    def inverse_transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "scale_")
        return check_array(X, allow_nan=True) * self.scale_ + self.mean_


class MinMaxScaler(BaseEstimator, TransformerMixin):
    """Her sütunu eğitimdeki en küçük-en büyük değerine göre `feature_range` aralığına taşır."""

    def __init__(self, feature_range: tuple[float, float] = (0.0, 1.0)) -> None:
        self.feature_range = feature_range

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        low, high = self.feature_range
        if low >= high:
            raise ValueError(
                f"feature_range (alt, üst) ve alt < üst olmalı; verilen {self.feature_range}"
            )
        data = check_array(X, allow_nan=True)
        present = ~np.isnan(data)
        any_present = present.any(axis=0)
        self.data_min_ = np.where(any_present, np.where(present, data, np.inf).min(axis=0), 0.0)
        self.data_max_ = np.where(any_present, np.where(present, data, -np.inf).max(axis=0), 0.0)
        span = self.data_max_ - self.data_min_
        self.scale_ = (high - low) / np.where(span > 0, span, 1.0)
        self.min_ = low - self.data_min_ * self.scale_
        self.n_features_in_ = data.shape[1]
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "scale_")
        data = check_array(X, allow_nan=True)
        check_n_features(self, data)
        return data * self.scale_ + self.min_

    def inverse_transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "scale_")
        return (check_array(X, allow_nan=True) - self.min_) / self.scale_
