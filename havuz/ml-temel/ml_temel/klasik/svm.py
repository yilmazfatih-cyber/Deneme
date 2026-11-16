"""Doğrusal destek vektör makinesi (LinearSVC): kare menteşe kayıplı, L2 cezalı.

Fikir: sınıfları ayıran düzlemi, iki taraftaki en yakın noktalardan olabildiğince uzak (geniş
"pay") olacak biçimde seçer. Pay içine düşen ya da yanlış taraftaki her nokta ceza öder:

    ½·||w||² + C · Σ max(0, 1 - yᵢ·(w·xᵢ + b))²        yᵢ ∈ {-1, +1}

Kare menteşe kaybı türevlenebilir olduğundan L-BFGS ile çözülür. scikit-learn'deki (liblinear)
gibi kesme terimi de cezalandırılır (`intercept_scaling` sütunu üzerinden). Çok sınıfta her sınıf
için bire-karşı-hepsi bir düzlem öğrenilir. Olasılık vermez: gerekiyorsa `CalibratedClassifierCV`.
Özellikleri ölçekleyin (`StandardScaler`); yoksa yakınsama yavaşlar.
Genişletme: menteşe yerine başka bir kayıp için `_objective`'i kopyalayıp değiştirin.
"""

from __future__ import annotations

import warnings
from typing import Any, Self

import numpy as np

from ml_temel.klasik._optimize import minimize_lbfgs
from ml_temel.ortak.base import BaseEstimator, ClassifierMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_X_y,
    encode_labels,
)


def _objective(X: Array, signs: Array, C: float) -> Any:
    """Ölçeklenmiş amaç: [½||w||² + C·Σ kayıp] / (C·n); gradyan ölçeği veri boyundan bağımsız."""
    scale = C * X.shape[0]

    def objective(w: Array) -> tuple[float, Array]:
        margin = 1.0 - signs * (X @ w)
        active = np.maximum(margin, 0.0)
        value = (0.5 * float(w @ w) + C * float(active @ active)) / scale
        grad = (w - 2.0 * C * (X.T @ (active * signs))) / scale
        return value, grad

    return objective


class LinearSVC(BaseEstimator, ClassifierMixin):
    """Kare menteşe kayıplı doğrusal SVM (scikit-learn `LinearSVC` ile aynı amaç)."""

    def __init__(
        self,
        C: float = 1.0,
        fit_intercept: bool = True,
        intercept_scaling: float = 1.0,
        max_iter: int = 1000,
        tol: float = 1e-6,
    ) -> None:
        self.C = C
        self.fit_intercept = fit_intercept
        self.intercept_scaling = intercept_scaling
        self.max_iter = max_iter
        self.tol = tol

    def _design(self, X: Array) -> Array:
        if not self.fit_intercept:
            return X
        return np.column_stack([X, np.full(X.shape[0], self.intercept_scaling)])

    def fit(self, X: ArrayLike, y: ArrayLike) -> Self:
        if self.C <= 0:
            raise ValueError(f"C pozitif olmalı; verilen: {self.C}")
        data, target = check_X_y(X, y)
        self.classes_, codes = encode_labels(target)
        n_classes = len(self.classes_)
        if n_classes < 2:
            raise ValueError("Sınıflandırma için hedefte en az 2 sınıf olmalı.")
        design = self._design(data)
        targets = [1] if n_classes == 2 else list(range(n_classes))
        weights = []
        for positive in targets:
            signs = np.where(codes == positive, 1.0, -1.0)
            result = minimize_lbfgs(
                _objective(design, signs, self.C),
                np.zeros(design.shape[1]),
                tol=self.tol,
                max_iter=self.max_iter,
            )
            if not result.converged:
                warnings.warn(
                    "LinearSVC yakınsamadı; özellikleri ölçekleyin ya da max_iter'ı artırın.",
                    UserWarning,
                    stacklevel=2,
                )
            weights.append(result.x)
        stacked = np.vstack(weights)
        n_features = data.shape[1]
        self.coef_ = stacked[:, :n_features]
        self.intercept_ = (
            stacked[:, n_features] * self.intercept_scaling
            if self.fit_intercept
            else np.zeros(len(stacked))
        )
        self.n_features_in_ = n_features
        return self

    def decision_function(self, X: ArrayLike) -> Array:
        """Düzleme işaretli uzaklık (ölçeksiz): ikili → (n,), çok sınıflı → (n, K)."""
        check_is_fitted(self, "coef_")
        data = check_array(X)
        check_n_features(self, data)
        scores: Array = data @ self.coef_.T + self.intercept_
        return scores[:, 0] if scores.shape[1] == 1 else scores

    def predict(self, X: ArrayLike) -> Array:
        scores = self.decision_function(X)
        codes = (scores > 0).astype(np.int64) if scores.ndim == 1 else scores.argmax(axis=1)
        labels: Array = self.classes_[codes]
        return labels
