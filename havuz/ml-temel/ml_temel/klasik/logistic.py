"""Lojistik regresyon: ikili ve çok sınıflı (softmax), L2 cezalı, L-BFGS ile.

Fikir: her sınıf için doğrusal bir skor z = X·w + b; ikili durumda P(y=1) = σ(z), çok sınıfta
P(y=k) = softmax(z)ₖ. Amaç, ortalama log-kayıp + ceza (scikit-learn ile aynı ölçek):

    (1/Σa) · Σᵢ aᵢ · logkayıp(i)  +  ||W||² / (2·C·Σa)        a: örnek ağırlığı

C büyüdükçe ceza zayıflar (C = 1/λ). Kesme terimi cezalanmaz. Amaç kesin dışbükeydir; bu yüzden
tek bir en iyi çözüm vardır ve iyi bir en iyileyici scikit-learn ile aynı katsayıyı bulur.
Sayısal kararlılık: log(1 + e^z) ve log-sum-exp taşmasız biçimde hesaplanır.

`class_weight="balanced"`: azınlık sınıfının örnekleri n / (K · nₖ) ağırlık alır.
Genişletme: farklı bir ceza (L1) gerekiyorsa `_objective_*` fonksiyonlarını kopyalayıp değiştirin.
"""

from __future__ import annotations

import warnings
from typing import Any, Self

import numpy as np

from ml_temel.klasik._optimize import minimize_lbfgs
from ml_temel.ortak.base import BaseEstimator, ClassifierMixin
from ml_temel.ortak.types import Array, ArrayLike, IntArray
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_sample_weight,
    check_X_y,
    encode_labels,
)


def class_weights(codes: IntArray, n_classes: int, class_weight: Any) -> Array:
    """Satır başına sınıf ağırlığı: None → 1, "balanced" → n/(K·nₖ), sözlük → {no: ağırlık}."""
    if class_weight is None:
        return np.ones(codes.shape[0])
    if class_weight == "balanced":
        counts = np.bincount(codes, minlength=n_classes)
        per_class = codes.shape[0] / (n_classes * np.maximum(counts, 1))
        return np.asarray(per_class[codes], dtype=np.float64)
    if isinstance(class_weight, dict):
        per_class = np.array([float(class_weight.get(k, 1.0)) for k in range(n_classes)])
        return np.asarray(per_class[codes], dtype=np.float64)
    raise ValueError("class_weight None, 'balanced' ya da {sınıf_no: ağırlık} sözlüğü olmalı.")


def log1p_exp(z: Array) -> Array:
    """log(1 + e^z), büyük |z| değerlerinde taşmadan."""
    return np.maximum(z, 0.0) + np.log1p(np.exp(-np.abs(z)))


def sigmoid(z: Array) -> Array:
    """1 / (1 + e^-z), taşmasız."""
    e = np.exp(-np.abs(z))
    return np.where(z >= 0, 1.0 / (1.0 + e), e / (1.0 + e))


def softmax_rows(z: Array) -> Array:
    """Satır bazında softmax (en büyük değer çıkarılarak)."""
    shifted = np.exp(z - z.max(axis=1, keepdims=True))
    return shifted / shifted.sum(axis=1, keepdims=True)


def _binary_objective(X: Array, y: Array, weights: Array, C: float, fit_intercept: bool) -> Any:
    total = float(weights.sum())
    n_features = X.shape[1]

    def objective(theta: Array) -> tuple[float, Array]:
        coef, intercept = theta[:n_features], (theta[n_features] if fit_intercept else 0.0)
        z = X @ coef + intercept
        loss = float(weights @ (log1p_exp(z) - y * z)) / total
        loss += float(coef @ coef) / (2.0 * C * total)
        residual = weights * (sigmoid(z) - y) / total
        grad = np.empty_like(theta)
        grad[:n_features] = X.T @ residual + coef / (C * total)
        if fit_intercept:
            grad[n_features] = residual.sum()
        return loss, grad

    return objective


def _multinomial_objective(
    X: Array, codes: IntArray, weights: Array, n_classes: int, C: float, fit_intercept: bool
) -> Any:
    total = float(weights.sum())
    n_samples, n_features = X.shape
    width = n_features + (1 if fit_intercept else 0)
    rows = np.arange(n_samples)

    def objective(theta: Array) -> tuple[float, Array]:
        params = theta.reshape(n_classes, width)
        coef = params[:, :n_features]
        z = X @ coef.T + (params[:, n_features] if fit_intercept else 0.0)
        peak = z.max(axis=1, keepdims=True)
        log_norm = peak[:, 0] + np.log(np.exp(z - peak).sum(axis=1))
        loss = float(weights @ (log_norm - z[rows, codes])) / total
        loss += float((coef * coef).sum()) / (2.0 * C * total)
        residual = np.exp(z - log_norm[:, None])
        residual[rows, codes] -= 1.0
        residual *= (weights / total)[:, None]
        grad = np.empty_like(params)
        grad[:, :n_features] = residual.T @ X + coef / (C * total)
        if fit_intercept:
            grad[:, n_features] = residual.sum(axis=0)
        return loss, grad.ravel()

    return objective


class LogisticRegression(BaseEstimator, ClassifierMixin):
    """L2 cezalı lojistik regresyon; iki sınıfta tek katsayı vektörü, K > 2'de K vektör."""

    def __init__(
        self,
        C: float = 1.0,
        fit_intercept: bool = True,
        class_weight: Any = None,
        max_iter: int = 1000,
        tol: float = 1e-6,
    ) -> None:
        self.C = C
        self.fit_intercept = fit_intercept
        self.class_weight = class_weight
        self.max_iter = max_iter
        self.tol = tol

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        if self.C <= 0:
            raise ValueError(f"C pozitif olmalı; verilen: {self.C}")
        data, target = check_X_y(X, y)
        classes, codes = encode_labels(target)
        n_classes = len(classes)
        if n_classes < 2:
            raise ValueError(
                f"Sınıflandırma için en az 2 sınıf gerekir; hedefte yalnız {classes.tolist()} var."
            )
        weights = check_sample_weight(sample_weight, data.shape[0])
        weights = weights * class_weights(codes, n_classes, self.class_weight)
        n_features = data.shape[1]
        width = n_features + (1 if self.fit_intercept else 0)
        if n_classes == 2:
            objective = _binary_objective(
                data, codes.astype(np.float64), weights, self.C, self.fit_intercept
            )
            result = minimize_lbfgs(
                objective, np.zeros(width), tol=self.tol, max_iter=self.max_iter
            )
            params = result.x.reshape(1, width)
        else:
            objective = _multinomial_objective(
                data, codes, weights, n_classes, self.C, self.fit_intercept
            )
            start = np.zeros(n_classes * width)
            result = minimize_lbfgs(objective, start, tol=self.tol, max_iter=self.max_iter)
            params = result.x.reshape(n_classes, width)
        if not result.converged:
            warnings.warn(
                f"LogisticRegression {result.n_iter} adımda yakınsamadı "
                f"(gradyan {result.grad_max:.2e}). Özellikleri `StandardScaler` ile ölçekleyin "
                "ya da max_iter'ı artırın.",
                UserWarning,
                stacklevel=2,
            )
        self.classes_ = classes
        self.coef_ = params[:, :n_features].copy()
        self.intercept_ = (
            params[:, n_features].copy() if self.fit_intercept else np.zeros(len(params))
        )
        self.n_iter_ = result.n_iter
        self.n_features_in_ = n_features
        return self

    def decision_function(self, X: ArrayLike) -> Array:
        """Ham skorlar: ikili → (n,), çok sınıflı → (n, K)."""
        check_is_fitted(self, "coef_")
        data = check_array(X)
        check_n_features(self, data)
        scores: Array = data @ self.coef_.T + self.intercept_
        return scores[:, 0] if scores.shape[1] == 1 else scores

    def predict_proba(self, X: ArrayLike) -> Array:
        """Sınıf olasılıkları (n, K); sütunlar `classes_` sırasındadır."""
        scores = self.decision_function(X)
        if scores.ndim == 1:
            positive = sigmoid(scores)
            return np.column_stack([1.0 - positive, positive])
        return softmax_rows(scores)

    def predict_log_proba(self, X: ArrayLike) -> Array:
        return np.log(np.clip(self.predict_proba(X), 1e-300, None))

    def predict(self, X: ArrayLike) -> Array:
        probabilities = self.predict_proba(X)
        labels: Array = self.classes_[probabilities.argmax(axis=1)]
        return labels
