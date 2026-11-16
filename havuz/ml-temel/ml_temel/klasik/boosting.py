"""Histogram tabanlı gradyan artırma: HistGradientBoostingRegressor / Classifier.

Fikir: modeli küçük ağaçların toplamı olarak adım adım kurarız. Her adımda o anki tahminin
kaybının gradyanı (g) ve ikinci türevi (h) hesaplanır; yeni ağaç bu "hataları" düzeltmeye
çalışır (Newton adımı) ve katkısı `learning_rate` ile küçültülerek eklenir:

    ham_tahmin ← ham_tahmin + öğrenme_oranı · ağaç(x)

  regresyon        kare hata: g = tahmin - y, h = 1; başlangıç = ortalama
  ikili sınıflama  log-kayıp: p = σ(ham), g = p - y, h = p(1 - p); başlangıç = log(oran)
  çok sınıflı      softmax log-kayıp; her adımda sınıf başına bir ağaç

Ağaçlar `_hist_grower.py` ile kutulanmış veride büyütülür (hızlı). Eksik değerler (NaN)
doğrudan desteklenir: her bölmede eksiklerin hangi tarafa gideceği öğrenilir.
Erken durdurma (`early_stopping`): eğitim verisinin bir kısmı ayrılır, o kısımdaki kayıp
`n_iter_no_change` adımdır iyileşmiyorsa durulur ("auto": 10 000 satırdan büyük veride açık).
Parametre adları ve varsayılanları scikit-learn'ün aynı adlı sınıflarıyla aynıdır.
Genişletme: yeni bir kayıp için `_Loss` alt sınıfı yazıp `_make_loss`'a ekleyin.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.klasik._binning import BinMapper
from ml_temel.klasik._hist_grower import GrowerSettings, HistogramBuilder, grow_tree
from ml_temel.klasik._tree_structure import Tree
from ml_temel.klasik.logistic import log1p_exp, sigmoid, softmax_rows
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

_EPS = float(np.finfo(np.float64).eps)


class _Loss:
    """Kayıp ailesi: başlangıç tahmini, gradyan/hessian ve ortalama kayıp. `y`: (n, K) hedef."""

    constant_hessian = False

    def baseline(self, y: Array, weights: Array) -> Array:
        raise NotImplementedError

    def gradients(self, y: Array, raw: Array, weights: Array) -> tuple[Array, Array | None]:
        raise NotImplementedError

    def loss(self, y: Array, raw: Array, weights: Array) -> float:
        raise NotImplementedError


class _SquaredError(_Loss):
    constant_hessian = True

    def baseline(self, y: Array, weights: Array) -> Array:
        return np.array([np.average(y[:, 0], weights=weights)])

    def gradients(self, y: Array, raw: Array, weights: Array) -> tuple[Array, Array | None]:
        unweighted = bool(np.all(weights == 1.0))
        hess = None if unweighted else np.repeat(weights[:, None], raw.shape[1], axis=1)
        return (raw - y) * weights[:, None], hess

    def loss(self, y: Array, raw: Array, weights: Array) -> float:
        return float(np.average(0.5 * (y[:, 0] - raw[:, 0]) ** 2, weights=weights))


class _BinaryLogLoss(_Loss):
    def baseline(self, y: Array, weights: Array) -> Array:
        rate = float(np.clip(np.average(y[:, 0], weights=weights), _EPS, 1.0 - _EPS))
        return np.array([np.log(rate / (1.0 - rate))])

    def gradients(self, y: Array, raw: Array, weights: Array) -> tuple[Array, Array | None]:
        p = sigmoid(raw)
        return (p - y) * weights[:, None], p * (1.0 - p) * weights[:, None]

    def loss(self, y: Array, raw: Array, weights: Array) -> float:
        return float(np.average(log1p_exp(raw[:, 0]) - y[:, 0] * raw[:, 0], weights=weights))


class _MultinomialLogLoss(_Loss):
    def baseline(self, y: Array, weights: Array) -> Array:
        rates = np.clip(np.average(y, axis=0, weights=weights), _EPS, 1.0 - _EPS)
        logs = np.log(rates)
        return logs - logs.mean()

    def gradients(self, y: Array, raw: Array, weights: Array) -> tuple[Array, Array | None]:
        p = softmax_rows(raw)
        return (p - y) * weights[:, None], p * (1.0 - p) * weights[:, None]

    def loss(self, y: Array, raw: Array, weights: Array) -> float:
        peak = raw.max(axis=1, keepdims=True)
        log_norm = peak[:, 0] + np.log(np.exp(raw - peak).sum(axis=1))
        return float(np.average(log_norm - (raw * y).sum(axis=1), weights=weights))


def _make_loss(kind: str, n_classes: int) -> _Loss:
    if kind == "regression":
        return _SquaredError()
    return _BinaryLogLoss() if n_classes == 2 else _MultinomialLogLoss()


class _HistGBBase(BaseEstimator):
    """Ortak eğitim döngüsü; alt sınıflar hedefi (n, K) biçimine çevirip `_boost`'u çağırır."""

    _baseline: Array
    _trees: list[list[Tree]]

    def __init__(
        self,
        learning_rate: float = 0.1,
        max_iter: int = 100,
        max_leaf_nodes: int | None = 31,
        max_depth: int | None = None,
        min_samples_leaf: int = 20,
        l2_regularization: float = 0.0,
        max_bins: int = 255,
        early_stopping: Any = "auto",
        validation_fraction: float = 0.1,
        n_iter_no_change: int = 10,
        tol: float = 1e-7,
        random_state: Seed = None,
    ) -> None:
        self.learning_rate = learning_rate
        self.max_iter = max_iter
        self.max_leaf_nodes = max_leaf_nodes
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.l2_regularization = l2_regularization
        self.max_bins = max_bins
        self.early_stopping = early_stopping
        self.validation_fraction = validation_fraction
        self.n_iter_no_change = n_iter_no_change
        self.tol = tol
        self.random_state = random_state

    def _settings(self) -> GrowerSettings:
        if self.learning_rate <= 0 or self.max_iter < 1:
            raise ValueError("learning_rate > 0 ve max_iter ≥ 1 olmalı.")
        if self.max_leaf_nodes is not None and self.max_leaf_nodes < 2:
            raise ValueError("max_leaf_nodes en az 2 olmalı (ya da None).")
        return GrowerSettings(
            max_leaf_nodes=self.max_leaf_nodes,
            max_depth=self.max_depth,
            min_samples_leaf=self.min_samples_leaf,
            l2_regularization=self.l2_regularization,
            shrinkage=self.learning_rate,
        )

    def _validation_rows(self, n_rows: int, strata: IntArray | None, rng: Any) -> IntArray:
        use = self.early_stopping
        if use == "auto":
            use = n_rows > 10_000
        if not use:
            return np.empty(0, dtype=np.int64)
        from ml_temel.secim.split import train_test_split  # döngüsel içe aktarmayı önler

        rows = np.arange(n_rows)
        return np.asarray(
            train_test_split(
                rows, test_size=self.validation_fraction, random_state=rng, stratify=strata
            )[1]
        )

    def _should_stop(self, scores: list[float]) -> bool:
        reference = self.n_iter_no_change + 1
        if len(scores) < reference:
            return False
        return not any(score > scores[-reference] + self.tol for score in scores[-reference + 1 :])

    def _boost(
        self, X: Array, Y: Array, weights: Array, loss: _Loss, strata: IntArray | None
    ) -> None:
        settings = self._settings()
        rng = make_rng(self.random_state)
        validation = self._validation_rows(X.shape[0], strata, rng)
        train = np.setdiff1d(np.arange(X.shape[0]), validation)
        X_train, Y_train, w_train = X[train], Y[train], weights[train]
        mapper = BinMapper(self.max_bins, random_state=rng).fit(X_train)
        binned = mapper.transform(X_train)
        builder = HistogramBuilder(binned, self.max_bins + 1)
        has_missing = (binned == mapper.missing_bin).any(axis=0)
        self._baseline = loss.baseline(Y_train, w_train)
        raw = np.tile(self._baseline, (train.size, 1))
        raw_val = np.tile(self._baseline, (validation.size, 1))
        scores = (
            [-loss.loss(Y[validation], raw_val, weights[validation])] if validation.size else []
        )
        self._trees = []
        for _ in range(self.max_iter):
            grad, hess = loss.gradients(Y_train, raw, w_train)
            step: list[Tree] = []
            for k in range(raw.shape[1]):
                hess_k = None if hess is None else hess[:, k]
                tree, leaves = grow_tree(builder, mapper, grad[:, k], hess_k, settings, has_missing)
                for rows, value in leaves:
                    raw[rows, k] += value
                if validation.size:
                    raw_val[:, k] += tree.predict(X[validation])[:, 0]
                step.append(tree)
            self._trees.append(step)
            if validation.size:
                scores.append(-loss.loss(Y[validation], raw_val, weights[validation]))
                if self._should_stop(scores):
                    break
        self.validation_score_ = np.asarray(scores)
        self.n_iter_ = len(self._trees)
        self.n_features_in_ = X.shape[1]
        gains = np.zeros(X.shape[1])
        for step_trees in self._trees:
            for tree in step_trees:
                gains += tree.feature_importances(X.shape[1]) * float(tree.gain.sum())
        self.feature_importances_ = gains / gains.sum() if gains.sum() > 0 else gains

    def _raw_predict(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "_trees")
        data = check_array(X, allow_nan=True)
        check_n_features(self, data)
        raw = np.tile(self._baseline, (data.shape[0], 1))
        for step in self._trees:
            for k, tree in enumerate(step):
                raw[:, k] += tree.predict(data)[:, 0]
        return raw


class HistGradientBoostingRegressor(_HistGBBase, RegressorMixin):
    """Kare hata kayıplı gradyan artırma regresyonu."""

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y, allow_nan=True)
        target = check_regression_target(target)
        weights = check_sample_weight(sample_weight, data.shape[0])
        self._boost(data, target[:, None], weights, _make_loss("regression", 1), None)
        return self

    def predict(self, X: ArrayLike) -> Array:
        prediction: Array = self._raw_predict(X)[:, 0]
        return prediction


class HistGradientBoostingClassifier(_HistGBBase, ClassifierMixin):
    """Log-kayıplı gradyan artırma sınıflandırması (ikili ve çok sınıflı)."""

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        data, target = check_X_y(X, y, allow_nan=True)
        self.classes_, codes = encode_labels(target)
        n_classes = len(self.classes_)
        if n_classes < 2:
            raise ValueError("Sınıflandırma için hedefte en az 2 sınıf olmalı.")
        weights = check_sample_weight(sample_weight, data.shape[0])
        if n_classes == 2:
            Y = codes[:, None].astype(np.float64)
        else:
            Y = np.zeros((codes.size, n_classes))
            Y[np.arange(codes.size), codes] = 1.0
        self._boost(data, Y, weights, _make_loss("classification", n_classes), codes)
        return self

    def decision_function(self, X: ArrayLike) -> Array:
        """Ham skorlar: ikili → (n,) log-oran, çok sınıflı → (n, K)."""
        raw = self._raw_predict(X)
        return raw[:, 0] if raw.shape[1] == 1 else raw

    def predict_proba(self, X: ArrayLike) -> Array:
        raw = self._raw_predict(X)
        if raw.shape[1] == 1:
            positive = sigmoid(raw[:, 0])
            return np.column_stack([1.0 - positive, positive])
        return softmax_rows(raw)

    def predict(self, X: ArrayLike) -> Array:
        labels: Array = self.classes_[self.predict_proba(X).argmax(axis=1)]
        return labels
