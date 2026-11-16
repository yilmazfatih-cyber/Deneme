"""Naive Bayes: Gauss (sürekli özellikler) ve çok terimli (sayımlar, ör. kelime sayıları).

Fikir: Bayes kuralı P(sınıf | x) ∝ P(sınıf) · P(x | sınıf). "Saf" (naive) varsayım: sınıf
bilindiğinde özellikler birbirinden bağımsızdır, yani P(x | sınıf) = Πⱼ P(xⱼ | sınıf). Varsayım
çoğu zaman yanlıştır ama model hızlıdır, az veriyle iyi çalışır ve metinde güçlü bir tabandır.
Çarpımlar taşmasın diye her şey log uzayında toplanır; olasılıklar log-sum-exp ile normalleşir.

  GaussianNB     her sınıf ve özellik için ortalama ve varyans; varyansa en büyük özellik
                 varyansının `var_smoothing` katı eklenir (sıfır varyansa karşı).
  MultinomialNB  sınıf başına özellik sayımları; görülmemiş kelime sıfır olasılık almasın diye
                 `alpha` (Laplace) düzgünleştirmesi. Girdi negatif olmamalıdır (sayım, TF-IDF).
Genişletme: Bernoulli NB gibi bir tür için `MultinomialNB`'yi kopyalayıp
`_joint_log_likelihood`'u değiştirin.
"""

from __future__ import annotations

from typing import Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, ClassifierMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_sample_weight,
    check_X_y,
    encode_labels,
)


class _BaseNB(BaseEstimator, ClassifierMixin):
    """Ortak tahmin: log-olabilirliklerden olasılık ve etiket."""

    classes_: Array

    def _joint_log_likelihood(self, X: Array) -> Array:
        raise NotImplementedError

    def _checked(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "classes_")
        data = check_array(X)
        check_n_features(self, data)
        return data

    def predict_log_proba(self, X: ArrayLike) -> Array:
        joint = self._joint_log_likelihood(self._checked(X))
        peak = joint.max(axis=1, keepdims=True)
        log_norm = peak + np.log(np.exp(joint - peak).sum(axis=1, keepdims=True))
        return joint - log_norm

    def predict_proba(self, X: ArrayLike) -> Array:
        return np.exp(self.predict_log_proba(X))

    def predict(self, X: ArrayLike) -> Array:
        joint = self._joint_log_likelihood(self._checked(X))
        labels: Array = self.classes_[joint.argmax(axis=1)]
        return labels


class GaussianNB(_BaseNB):
    """Her sınıfta her özelliğin normal dağıldığını varsayar."""

    def __init__(self, priors: ArrayLike | None = None, var_smoothing: float = 1e-9) -> None:
        self.priors = priors
        self.var_smoothing = var_smoothing

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        weights = check_sample_weight(sample_weight, data.shape[0])
        self.classes_, codes = encode_labels(target)
        n_classes = len(self.classes_)
        self.epsilon_ = self.var_smoothing * float(np.max(np.var(data, axis=0)))
        self.theta_ = np.zeros((n_classes, data.shape[1]))
        self.var_ = np.zeros((n_classes, data.shape[1]))
        self.class_count_ = np.zeros(n_classes)
        for k in range(n_classes):
            members = codes == k
            w = weights[members]
            self.theta_[k] = np.average(data[members], axis=0, weights=w)
            self.var_[k] = np.average((data[members] - self.theta_[k]) ** 2, axis=0, weights=w)
            self.class_count_[k] = w.sum()
        self.var_ += self.epsilon_
        if self.priors is None:
            self.class_prior_ = self.class_count_ / self.class_count_.sum()
        else:
            priors = np.asarray(self.priors, dtype=np.float64)
            if priors.shape != (n_classes,) or not np.isclose(priors.sum(), 1.0):
                raise ValueError(f"priors {n_classes} elemanlı olmalı ve toplamı 1 olmalı.")
            self.class_prior_ = priors
        self.n_features_in_ = data.shape[1]
        return self

    def _joint_log_likelihood(self, X: Array) -> Array:
        log_det = -0.5 * np.log(2.0 * np.pi * self.var_).sum(axis=1)  # (K,)
        squared = ((X[:, None, :] - self.theta_[None]) ** 2 / self.var_[None]).sum(axis=2)
        joint: Array = np.log(self.class_prior_) + log_det - 0.5 * squared
        return joint


class MultinomialNB(_BaseNB):
    """Sayım verisi (kelime sayıları, TF-IDF) için çok terimli Naive Bayes."""

    def __init__(self, alpha: float = 1.0, fit_prior: bool = True) -> None:
        self.alpha = alpha
        self.fit_prior = fit_prior

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        if (data < 0).any():
            raise ValueError(
                "MultinomialNB negatif değer kabul etmez (sayım ya da TF-IDF bekler). "
                "StandardScaler kullandıysanız yerine MinMaxScaler deneyin ya da GaussianNB seçin."
            )
        weights = check_sample_weight(sample_weight, data.shape[0])
        self.classes_, codes = encode_labels(target)
        n_classes = len(self.classes_)
        one_hot = np.zeros((data.shape[0], n_classes))
        one_hot[np.arange(data.shape[0]), codes] = weights
        self.feature_count_ = one_hot.T @ data
        self.class_count_ = one_hot.sum(axis=0)
        smoothed = self.feature_count_ + self.alpha
        self.feature_log_prob_ = np.log(smoothed) - np.log(smoothed.sum(axis=1, keepdims=True))
        if self.fit_prior:
            self.class_log_prior_ = np.log(self.class_count_) - np.log(self.class_count_.sum())
        else:
            self.class_log_prior_ = np.full(n_classes, -np.log(n_classes))
        self.n_features_in_ = data.shape[1]
        return self

    def _joint_log_likelihood(self, X: Array) -> Array:
        if (X < 0).any():
            raise ValueError("MultinomialNB negatif değer kabul etmez.")
        joint: Array = X @ self.feature_log_prob_.T + self.class_log_prior_
        return joint
