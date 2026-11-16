"""Karar ağaçları: DecisionTreeClassifier ve DecisionTreeRegressor (kesin CART).

Fikir: veriyi "yaş ≤ 42.5 mi?" gibi evet/hayır sorularıyla tekrar tekrar ikiye bölen bir ağaç.
Her bölmede safsızlığı (sınıflandırmada Gini/entropi, regresyonda kare hata) en çok azaltan soru
seçilir. Yapraktaki tahmin, oraya düşen eğitim örneklerinin sınıf oranı ya da ortalamasıdır.
Ağaçlar ölçeklemeye ihtiyaç duymaz, etkileşimleri kendiliğinden yakalar ama tek başına kolayca
aşırı öğrenir: `max_depth` ve `min_samples_leaf` ile sınırlayın ya da ormanı (`forest.py`) kullanın.

Asıl iş `_cart.py`'dedir. Eksik değer (NaN) desteklenmez: önce `SimpleImputer` kullanın ya da
eksik değeri kendisi işleyen `HistGradientBoosting*` modellerini seçin.
Genişletme: yeni bir parametre için `CartSettings`'e alan ekleyip `_settings`'te doldurun.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.klasik._cart import CartSettings, build_cart
from ml_temel.klasik._tree_structure import Tree
from ml_temel.klasik.logistic import class_weights
from ml_temel.ortak.base import BaseEstimator, ClassifierMixin, RegressorMixin
from ml_temel.ortak.types import Array, ArrayLike, IntArray, Seed
from ml_temel.ortak.validation import (
    check_array,
    check_is_fitted,
    check_n_features,
    check_regression_target,
    check_sample_weight,
    check_X_y,
    encode_labels,
    make_rng,
)


def resolve_max_features(max_features: Any, n_features: int) -> int:
    """Düğüm başına denenecek özellik sayısı: None/1.0 → hepsi, "sqrt", "log2", tam sayı, oran."""
    if max_features is None:
        return n_features
    if max_features == "sqrt":
        return max(1, int(np.sqrt(n_features)))
    if max_features == "log2":
        return max(1, int(np.log2(n_features)))
    if isinstance(max_features, (int, np.integer)) and not isinstance(max_features, bool):
        if not 1 <= max_features <= n_features:
            raise ValueError(
                f"max_features 1..{n_features} arasında olmalı; verilen {max_features}"
            )
        return int(max_features)
    if isinstance(max_features, float) and 0.0 < max_features <= 1.0:
        return max(1, int(max_features * n_features))
    raise ValueError(
        "max_features None, 'sqrt', 'log2', pozitif tam sayı ya da (0, 1] arası oran olmalı; "
        f"verilen: {max_features!r}."
    )


def classification_stats(codes: IntArray, n_classes: int, weights: Array) -> Array:
    """Her satır için ağırlıklı tek-sıcak sınıf vektörü (n, K)."""
    stats = np.zeros((codes.shape[0], n_classes))
    stats[np.arange(codes.shape[0]), codes] = weights
    return stats


def regression_stats(target: Array, weights: Array) -> Array:
    """Her satır için (a, a·y, a·y²)."""
    return np.column_stack([weights, weights * target, weights * target * target])


class _TreeBase(BaseEstimator):
    """Ortak ayarlar ve tahmin yardımcıları."""

    tree_: Tree
    _criteria: tuple[str, ...] = ()

    def __init__(
        self,
        criterion: str,
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = None,
        min_impurity_decrease: float = 0.0,
        random_state: Seed = None,
    ) -> None:
        self.criterion = criterion
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.min_samples_leaf = min_samples_leaf
        self.max_features = max_features
        self.min_impurity_decrease = min_impurity_decrease
        self.random_state = random_state

    def _settings(self, n_features: int) -> CartSettings:
        if self.criterion not in self._criteria:
            raise ValueError(
                f"criterion şunlardan biri olmalı: {', '.join(self._criteria)}; "
                f"verilen: '{self.criterion}'."
            )
        if self.min_samples_leaf < 1 or self.min_samples_split < 2:
            raise ValueError("min_samples_leaf ≥ 1 ve min_samples_split ≥ 2 olmalı.")
        return CartSettings(
            criterion=self.criterion,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            max_features=resolve_max_features(self.max_features, n_features),
            min_impurity_decrease=self.min_impurity_decrease,
        )

    def _checked(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "tree_")
        data = check_array(X)
        check_n_features(self, data)
        return data

    def apply(self, X: ArrayLike) -> IntArray:
        """Her satırın düştüğü yaprağın numarası."""
        return self.tree_.apply(self._checked(X))

    def get_depth(self) -> int:
        check_is_fitted(self, "tree_")
        return self.tree_.max_depth

    def get_n_leaves(self) -> int:
        check_is_fitted(self, "tree_")
        return self.tree_.n_leaves


class DecisionTreeClassifier(_TreeBase, ClassifierMixin):
    """Sınıflandırma ağacı (criterion: "gini" ya da "entropy")."""

    _criteria = ("gini", "entropy")

    def __init__(
        self,
        criterion: str = "gini",
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = None,
        min_impurity_decrease: float = 0.0,
        class_weight: Any = None,
        random_state: Seed = None,
    ) -> None:
        super().__init__(
            criterion,
            max_depth,
            min_samples_split,
            min_samples_leaf,
            max_features,
            min_impurity_decrease,
            random_state,
        )
        self.class_weight = class_weight

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        self.classes_, codes = encode_labels(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        weights = weights * class_weights(codes, len(self.classes_), self.class_weight)
        stats = classification_stats(codes, len(self.classes_), weights)
        settings = self._settings(data.shape[1])
        self.tree_ = build_cart(data, stats, settings, make_rng(self.random_state))
        self.n_features_in_ = data.shape[1]
        self.feature_importances_ = self.tree_.feature_importances(data.shape[1])
        return self

    def predict_proba(self, X: ArrayLike) -> Array:
        return self.tree_.predict(self._checked(X))

    def predict(self, X: ArrayLike) -> Array:
        labels: Array = self.classes_[self.predict_proba(X).argmax(axis=1)]
        return labels


class DecisionTreeRegressor(_TreeBase, RegressorMixin):
    """Regresyon ağacı (criterion: "squared_error")."""

    _criteria = ("squared_error",)

    def __init__(
        self,
        criterion: str = "squared_error",
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = None,
        min_impurity_decrease: float = 0.0,
        random_state: Seed = None,
    ) -> None:
        super().__init__(
            criterion,
            max_depth,
            min_samples_split,
            min_samples_leaf,
            max_features,
            min_impurity_decrease,
            random_state,
        )

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        target = check_regression_target(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        settings = self._settings(data.shape[1])
        stats = regression_stats(target, weights)
        self.tree_ = build_cart(data, stats, settings, make_rng(self.random_state))
        self.n_features_in_ = data.shape[1]
        self.feature_importances_ = self.tree_.feature_importances(data.shape[1])
        return self

    def predict(self, X: ArrayLike) -> Array:
        prediction: Array = self.tree_.predict(self._checked(X))[:, 0]
        return prediction
