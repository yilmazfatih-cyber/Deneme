"""Rastgele orman: birçok karar ağacının ortalaması (RandomForestClassifier / Regressor).

Fikir: tek bir derin ağaç veriyi ezberler (yüksek varyans). Her ağacı (1) satırların yerine
koyarak çekilmiş bir örneklemiyle (bootstrap) ve (2) her düğümde özelliklerin rastgele bir
altkümesiyle kurarsak ağaçlar birbirinden farklılaşır; ortalamaları çok daha kararlıdır.
Sınıflandırmada ağaçların olasılıkları, regresyonda tahminleri ortalanır.

Bootstrap, satırları çoğaltmak yerine "kaç kez çekildi" sayısını örnek ağırlığı yaparak uygulanır.
Hiç çekilmeyen satırlar o ağaç için torba dışıdır (out-of-bag, OOB): `oob_score=True` ile her satır
yalnız onu görmeyen ağaçlarla tahmin edilip ücretsiz bir doğrulama puanı hesaplanır.
Ağaçlar `_cart.py` ile kurulur (eksik değer desteklenmez; önce doldurun).
Genişletme: Extra-Trees gibi bir tür için `_cart._best_splits` yerine rastgele eşik seçen bir
kurucu yazın.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.klasik._cart import build_cart, dense_ranks
from ml_temel.klasik._tree_structure import Tree
from ml_temel.klasik.logistic import class_weights
from ml_temel.klasik.tree import (
    DecisionTreeClassifier,
    DecisionTreeRegressor,
    classification_stats,
    regression_stats,
)
from ml_temel.olcut.regression import r2_score
from ml_temel.ortak.base import BaseEstimator, ClassifierMixin, RegressorMixin
from ml_temel.ortak.types import Array, ArrayLike, Seed
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


class _ForestBase(BaseEstimator):
    """Ortak: bootstrap örneklemleri, ağaçların kurulması, OOB toplama."""

    trees_: list[Tree]
    _tree_class: type[Any] = DecisionTreeClassifier

    def __init__(
        self,
        n_estimators: int = 100,
        criterion: str = "gini",
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = "sqrt",
        bootstrap: bool = True,
        oob_score: bool = False,
        max_samples: float | None = None,
        random_state: Seed = None,
    ) -> None:
        self.n_estimators = n_estimators
        self.criterion = criterion
        self.max_depth = max_depth
        self.min_samples_split = min_samples_split
        self.min_samples_leaf = min_samples_leaf
        self.max_features = max_features
        self.bootstrap = bootstrap
        self.oob_score = oob_score
        self.max_samples = max_samples
        self.random_state = random_state

    def _grow(self, data: Array, stats: Array) -> Array:
        """Ağaçları kurar; OOB için (satır × değer) tahmin toplamını ve sayısını döndürür."""
        if self.n_estimators < 1:
            raise ValueError(f"n_estimators en az 1 olmalı; verilen: {self.n_estimators}")
        if self.oob_score and not self.bootstrap:
            raise ValueError("oob_score=True yalnız bootstrap=True ile kullanılabilir.")
        settings = self._tree_class(
            criterion=self.criterion,
            max_depth=self.max_depth,
            min_samples_split=self.min_samples_split,
            min_samples_leaf=self.min_samples_leaf,
            max_features=self.max_features,
        )._settings(data.shape[1])
        n_samples = data.shape[0]
        draws = n_samples
        if self.max_samples is not None:
            draws = max(1, round(self.max_samples * n_samples))
        rng = make_rng(self.random_state)
        width = 1 if self.criterion == "squared_error" else stats.shape[1]
        oob_sum = np.zeros((n_samples, width))
        oob_count = np.zeros(n_samples)
        ranks = dense_ranks(data)  # alt kümelerde de sırayı korur: bir kez hesaplanır
        self.trees_ = []
        for _ in range(self.n_estimators):
            tree_rng = np.random.default_rng(rng.integers(2**63))
            if self.bootstrap:
                counts = np.bincount(tree_rng.integers(0, n_samples, draws), minlength=n_samples)
            else:
                counts = np.ones(n_samples, dtype=np.int64)
            in_bag = np.flatnonzero(counts)
            in_stats = stats[in_bag] * counts[in_bag, None]
            tree = build_cart(data[in_bag], in_stats, settings, tree_rng, ranks[in_bag])
            self.trees_.append(tree)
            if self.oob_score:
                out = np.flatnonzero(counts == 0)
                if out.size:
                    oob_sum[out] += tree.predict(data[out])
                    oob_count[out] += 1
        self.n_features_in_ = data.shape[1]
        self.feature_importances_ = np.mean(
            [tree.feature_importances(data.shape[1]) for tree in self.trees_], axis=0
        )
        total = float(self.feature_importances_.sum())
        if total > 0:
            self.feature_importances_ = self.feature_importances_ / total
        with np.errstate(invalid="ignore", divide="ignore"):
            return oob_sum / oob_count[:, None]

    def _mean_prediction(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "trees_")
        data = check_array(X)
        check_n_features(self, data)
        total = self.trees_[0].predict(data)
        for tree in self.trees_[1:]:
            total = total + tree.predict(data)
        mean: Array = total / len(self.trees_)
        return mean


class RandomForestClassifier(_ForestBase, ClassifierMixin):
    """Sınıflandırma ormanı; varsayılan: 100 ağaç, düğüm başına √(özellik sayısı) aday."""

    _tree_class = DecisionTreeClassifier

    def __init__(
        self,
        n_estimators: int = 100,
        criterion: str = "gini",
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = "sqrt",
        bootstrap: bool = True,
        oob_score: bool = False,
        max_samples: float | None = None,
        class_weight: Any = None,
        random_state: Seed = None,
    ) -> None:
        super().__init__(
            n_estimators,
            criterion,
            max_depth,
            min_samples_split,
            min_samples_leaf,
            max_features,
            bootstrap,
            oob_score,
            max_samples,
            random_state,
        )
        self.class_weight = class_weight

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        self.classes_, codes = encode_labels(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        weights = weights * class_weights(codes, len(self.classes_), self.class_weight)
        oob = self._grow(data, classification_stats(codes, len(self.classes_), weights))
        if self.oob_score:
            seen = np.isfinite(oob).all(axis=1)
            self.oob_decision_function_ = oob
            self.oob_score_ = float(np.mean(oob[seen].argmax(axis=1) == codes[seen]))
        return self

    def predict_proba(self, X: ArrayLike) -> Array:
        mean = self._mean_prediction(X)
        return mean / mean.sum(axis=1, keepdims=True)

    def predict(self, X: ArrayLike) -> Array:
        labels: Array = self.classes_[self.predict_proba(X).argmax(axis=1)]
        return labels


class RandomForestRegressor(_ForestBase, RegressorMixin):
    """Regresyon ormanı; varsayılan: 100 ağaç, düğüm başına bütün özellikler (scikit-learn gibi)."""

    _tree_class = DecisionTreeRegressor

    def __init__(
        self,
        n_estimators: int = 100,
        criterion: str = "squared_error",
        max_depth: int | None = None,
        min_samples_split: int = 2,
        min_samples_leaf: int = 1,
        max_features: Any = 1.0,
        bootstrap: bool = True,
        oob_score: bool = False,
        max_samples: float | None = None,
        random_state: Seed = None,
    ) -> None:
        super().__init__(
            n_estimators,
            criterion,
            max_depth,
            min_samples_split,
            min_samples_leaf,
            max_features,
            bootstrap,
            oob_score,
            max_samples,
            random_state,
        )

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y)
        target = check_regression_target(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        oob = self._grow(data, regression_stats(target, weights))
        if self.oob_score:
            seen = np.isfinite(oob[:, 0])
            self.oob_prediction_ = oob[:, 0]
            self.oob_score_ = r2_score(target[seen], oob[seen, 0])
        return self

    def predict(self, X: ArrayLike) -> Array:
        prediction: Array = self._mean_prediction(X)[:, 0]
        return prediction
