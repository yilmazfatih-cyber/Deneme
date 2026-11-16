"""Doğrusal regresyon ve Ridge (L2 cezalı doğrusal regresyon).

Fikir: y ≈ X·w + b. En küçük kareler, hataların kareleri toplamını en aza indiren w'yu bulur.
Kesme terimi (b) için veri önce ortalamasına çekilir (merkezleme); böylece b cezalanmaz ve
w = argmin ||Xc·w - yc||², b = ȳ - x̄·w olur.

  LinearRegression  `lstsq` (SVD) ile: sütunlar birbirinin kopyası olsa bile (tekil matris)
                    en küçük normlu çözümü verir, patlamaz.
  Ridge             (XcᵀXc + αI)·w = Xcᵀyc. α > 0 matrisi her zaman çözülebilir kılar ve büyük
                    katsayıları cezalandırır (çoklu doğrusallıkta kararlı). Sütun sayısı satır
                    sayısından büyükse eşdeğer "çift" (dual) biçim çözülür: w = Xcᵀ(XcXcᵀ + αI)⁻¹yc.

Özellikler farklı ölçekteyse Ridge'den önce `StandardScaler` kullanın (ceza ölçeğe duyarlıdır).
Genişletme: Lasso gibi başka bir ceza için `_optimize.minimize_lbfgs` ile yeni sınıf yazın.
"""

from __future__ import annotations

from typing import Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, RegressorMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_regression_target,
    check_sample_weight,
    check_X_y,
)


def center_data(
    X: Array, y: Array, weights: Array, fit_intercept: bool
) -> tuple[Array, Array, Array, float]:
    """Ağırlıklı ortalamaya çeker ve satırları √ağırlık ile ölçekler: (Xc, yc, x̄, ȳ)."""
    if fit_intercept:
        x_mean = np.average(X, axis=0, weights=weights)
        y_mean = float(np.average(y, weights=weights))
    else:
        x_mean, y_mean = np.zeros(X.shape[1]), 0.0
    root = np.sqrt(weights)
    return (X - x_mean) * root[:, None], (y - y_mean) * root, x_mean, y_mean


class _LinearBase(BaseEstimator, RegressorMixin):
    """Ortak `predict`: X·w + b."""

    coef_: Array
    intercept_: float

    def predict(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "coef_")
        data = check_array(X)
        check_n_features(self, data)
        prediction: Array = data @ self.coef_ + self.intercept_
        return prediction


class LinearRegression(_LinearBase):
    """Sıradan en küçük kareler (cezasız)."""

    def __init__(self, fit_intercept: bool = True) -> None:
        self.fit_intercept = fit_intercept

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        target = check_regression_target(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        Xc, yc, x_mean, y_mean = center_data(data, target, weights, self.fit_intercept)
        coef, _, rank, singular = np.linalg.lstsq(Xc, yc, rcond=None)
        self.coef_ = coef
        self.intercept_ = y_mean - float(x_mean @ coef)
        self.rank_ = int(rank)
        self.singular_ = singular
        self.n_features_in_ = data.shape[1]
        return self


class Ridge(_LinearBase):
    """L2 cezalı en küçük kareler: ||y - Xw - b||² + α·||w||² (b cezalanmaz)."""

    def __init__(self, alpha: float = 1.0, fit_intercept: bool = True) -> None:
        self.alpha = alpha
        self.fit_intercept = fit_intercept

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        if self.alpha < 0:
            raise ValueError(f"alpha negatif olamaz; verilen: {self.alpha}")
        data, target = check_X_y(X, y)
        target = check_regression_target(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        Xc, yc, x_mean, y_mean = center_data(data, target, weights, self.fit_intercept)
        n_samples, n_features = Xc.shape
        if self.alpha == 0.0:
            coef = np.linalg.lstsq(Xc, yc, rcond=None)[0]
        elif n_features <= n_samples:  # birincil biçim: p×p sistem
            gram = Xc.T @ Xc
            gram[np.diag_indices_from(gram)] += self.alpha
            coef = np.linalg.solve(gram, Xc.T @ yc)
        else:  # çift biçim: n×n sistem (geniş veride daha ucuz)
            kernel = Xc @ Xc.T
            kernel[np.diag_indices_from(kernel)] += self.alpha
            coef = Xc.T @ np.linalg.solve(kernel, yc)
        self.coef_ = coef
        self.intercept_ = y_mean - float(x_mean @ coef)
        self.n_features_in_ = n_features
        return self
