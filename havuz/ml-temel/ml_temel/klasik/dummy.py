"""Taban çizgisi (dummy) modeller: veriye bakmadan tahmin eden "aptal" modeller.

Fikir: bir modelin işe yarayıp yaramadığını anlamanın ilk adımı, onu hiçbir şey öğrenmeyen bir
modelle karşılaştırmaktır. %95'i "kalmadı" olan bir veride hep "kalmadı" demek %95 doğruluk
verir; modeliniz %94 ise hiçbir şey öğrenmemiştir. `tablo` aracı her raporda bunu gösterir.

  DummyClassifier  strategy="prior": olasılık olarak sınıf oranlarını, etiket olarak en sık sınıfı
                   verir; "most_frequent": en sık sınıfa olasılık 1 verir.
  DummyRegressor   strategy="mean" (ortalama) ya da "median" (ortanca).
Genişletme: yeni bir strateji için `fit` içine bir dal ekleyin.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.ortak.base import BaseEstimator, ClassifierMixin, RegressorMixin
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import (
    check_consistent_length,
    check_is_fitted,
    check_regression_target,
    check_sample_weight,
    column_or_1d,
    encode_labels,
    num_rows,
)


class DummyClassifier(BaseEstimator, ClassifierMixin):
    """Girdiye bakmadan sınıf oranlarını (ya da en sık sınıfı) tahmin eder."""

    def __init__(self, strategy: str = "prior") -> None:
        self.strategy = strategy

    def fit(self, X: Any, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        if self.strategy not in ("prior", "most_frequent"):
            raise ValueError("strategy 'prior' ya da 'most_frequent' olmalı.")
        target = column_or_1d(y)
        check_consistent_length(X, target)
        weights = check_sample_weight(sample_weight, target.shape[0])
        self.classes_, codes = encode_labels(target)
        counts = np.bincount(codes, weights=weights, minlength=len(self.classes_))
        self.class_prior_ = counts / counts.sum()
        return self

    def predict_proba(self, X: Any) -> Array:
        check_is_fitted(self, "class_prior_")
        n = num_rows(X)
        if self.strategy == "prior":
            return np.tile(self.class_prior_, (n, 1))
        probabilities = np.zeros((n, len(self.classes_)))
        probabilities[:, int(np.argmax(self.class_prior_))] = 1.0
        return probabilities

    def predict(self, X: Any) -> Array:
        check_is_fitted(self, "class_prior_")
        labels: Array = np.repeat(self.classes_[int(np.argmax(self.class_prior_))], num_rows(X))
        return labels


class DummyRegressor(BaseEstimator, RegressorMixin):
    """Girdiye bakmadan eğitim hedefinin ortalamasını (ya da ortancasını) tahmin eder."""

    def __init__(self, strategy: str = "mean") -> None:
        self.strategy = strategy

    def fit(self, X: Any, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        if self.strategy not in ("mean", "median"):
            raise ValueError("strategy 'mean' ya da 'median' olmalı.")
        target = check_regression_target(column_or_1d(y))
        check_consistent_length(X, target)
        weights = check_sample_weight(sample_weight, target.shape[0])
        if self.strategy == "mean":
            self.constant_ = float(np.average(target, weights=weights))
        else:
            self.constant_ = float(np.median(target))
        return self

    def predict(self, X: Any) -> Array:
        check_is_fitted(self, "constant_")
        return np.full(num_rows(X), self.constant_)
