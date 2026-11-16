"""Olasılık kalibrasyonu: Platt (sigmoid), izotonik regresyon ve CalibratedClassifierCV.

Fikir: birçok model iyi SIRALAR ama olasılıkları yanlış SÖYLER (ağaçlar uçlardan kaçınır, Naive
Bayes aşırı emindir). Kalibrasyon, modelin skorunu s → P(y=1 | s) eşlemesiyle düzeltir. Eşleme,
modelin EĞİTİMDE GÖRMEDİĞİ satırların skorlarıyla öğrenilmelidir; yoksa ezber kalibre edilir.

  sigmoid (Platt)  P = 1 / (1 + exp(A·s + B)); iki parametre, az veride kararlı. Hedefler Platt'ın
                   önerdiği gibi yumuşatılır: (N₊+1)/(N₊+2) ve 1/(N₋+2). Newton yöntemiyle çözülür.
  isotonic         artan, basamaklı bir eşleme (havuzlanmış komşu ihlalleri algoritması, PAVA);
                   esnektir ama ~1000'den az kalibrasyon örneğinde aşırı öğrenir.

`CalibratedClassifierCV(model, method, cv)`: her katta model kat eğitim satırlarıyla eğitilir,
eşleme kat dışı satırlarla öğrenilir. `ensemble=True` (scikit-learn varsayılanı): tahmin, katların
ortalamasıdır. `ensemble=False`: kat dışı skorların hepsiyle tek eşleme + bütün veriyle tek model.
Çok sınıfta her sınıf için bire-karşı-hepsi eşleme öğrenilir ve olasılıklar 1'e normalleştirilir.
Genişletme: yeni bir yöntem (ör. sıcaklık ölçekleme) için `_make_calibrator`'a bir dal ekleyin.
"""

from __future__ import annotations

from typing import Any, Self

import numpy as np

from ml_temel.klasik.logistic import sigmoid
from ml_temel.ortak.base import BaseEstimator, ClassifierMixin, RegressorMixin, clone
from ml_temel.ortak.types import Array, ArrayLike
from ml_temel.ortak.validation import (
    check_consistent_length,
    check_is_fitted,
    check_sample_weight,
    column_or_1d,
    encode_labels,
    take_rows,
)


def pava(values: Array, weights: Array) -> Array:
    """Ağırlıklı en küçük kareler anlamında en yakın ARTAN diziyi bulur (sıralı girdi için)."""
    means: list[float] = []
    totals: list[float] = []
    sizes: list[int] = []
    for value, weight in zip(values.tolist(), weights.tolist(), strict=True):
        means.append(value)
        totals.append(weight)
        sizes.append(1)
        while len(means) > 1 and means[-2] > means[-1]:  # ihlal: son iki bloğu birleştir
            weight_sum = totals[-2] + totals[-1]
            merged = (means[-2] * totals[-2] + means[-1] * totals[-1]) / weight_sum
            means[-2:] = [merged]
            totals[-2:] = [weight_sum]
            sizes[-2:] = [sizes[-2] + sizes[-1]]
    return np.repeat(np.asarray(means), sizes)


class IsotonicRegression(BaseEstimator, RegressorMixin):
    """Tek girdili monoton (artan ya da azalan) basamaklı regresyon; arası doğrusal ara değer."""

    def __init__(
        self,
        increasing: bool = True,
        y_min: float | None = None,
        y_max: float | None = None,
        out_of_bounds: str = "clip",
    ) -> None:
        self.increasing = increasing
        self.y_min = y_min
        self.y_max = y_max
        self.out_of_bounds = out_of_bounds

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        if self.out_of_bounds not in ("clip", "nan"):
            raise ValueError("out_of_bounds 'clip' ya da 'nan' olmalı.")
        x = np.asarray(X, dtype=np.float64).reshape(-1)
        target = np.asarray(y, dtype=np.float64).reshape(-1)
        check_consistent_length(x, target)
        weights = check_sample_weight(sample_weight, x.shape[0])
        unique, inverse = np.unique(x, return_inverse=True)  # eşit x'ler tek noktada birleşir
        weight_sum = np.bincount(inverse, weights=weights)
        mean = np.bincount(inverse, weights=weights * target) / weight_sum
        sign = 1.0 if self.increasing else -1.0
        fitted = sign * pava(sign * mean, weight_sum)
        if self.y_min is not None or self.y_max is not None:
            fitted = np.clip(fitted, self.y_min, self.y_max)
        self.X_thresholds_, self.y_thresholds_ = unique, fitted
        self.X_min_, self.X_max_ = float(unique[0]), float(unique[-1])
        return self

    def predict(self, T: ArrayLike) -> Array:
        check_is_fitted(self, "X_thresholds_")
        t = np.asarray(T, dtype=np.float64).reshape(-1)
        result: Array = np.interp(t, self.X_thresholds_, self.y_thresholds_)
        if self.out_of_bounds == "nan":
            result[(t < self.X_min_) | (t > self.X_max_)] = np.nan
        return result


class SigmoidCalibration(BaseEstimator, RegressorMixin):
    """Platt ölçekleme: P(y=1 | s) = 1 / (1 + exp(a·s + b))."""

    def fit(self, X: ArrayLike, y: ArrayLike, sample_weight: ArrayLike | None = None) -> Self:
        scores = np.asarray(X, dtype=np.float64).reshape(-1)
        target = np.asarray(y, dtype=np.float64).reshape(-1)
        check_consistent_length(scores, target)
        weights = check_sample_weight(sample_weight, scores.shape[0])
        positives = float(weights[target > 0].sum())
        negatives = float(weights[target <= 0].sum())
        smoothed = np.where(
            target > 0, (positives + 1.0) / (positives + 2.0), 1.0 / (negatives + 2.0)
        )
        params = np.array([0.0, np.log((negatives + 1.0) / (positives + 1.0))])
        design = np.column_stack([scores, np.ones_like(scores)])
        for _ in range(100):  # Newton: amaç dışbükey, birkaç adımda yakınsar
            p = sigmoid(-(design @ params))  # P(y=1)
            grad = design.T @ (weights * (smoothed - p))  # z = -(a·s + b) olduğundan işaret ters
            hess = (design * (weights * p * (1.0 - p))[:, None]).T @ design + 1e-12 * np.eye(2)
            step = np.linalg.solve(hess, grad)
            params = params - step
            if float(np.abs(step).max()) < 1e-10:
                break
        self.a_, self.b_ = float(params[0]), float(params[1])
        return self

    def predict(self, T: ArrayLike) -> Array:
        check_is_fitted(self, "a_")
        scores = np.asarray(T, dtype=np.float64).reshape(-1)
        return sigmoid(-(self.a_ * scores + self.b_))


def _make_calibrator(method: str) -> Any:
    if method == "sigmoid":
        return SigmoidCalibration()
    if method == "isotonic":
        return IsotonicRegression(out_of_bounds="clip")
    raise ValueError(f"method 'sigmoid' ya da 'isotonic' olmalı; verilen: '{method}'.")


def response_scores(estimator: Any, X: Any) -> Array:
    """Kalibrasyona girecek skorlar: `decision_function` varsa o, yoksa `predict_proba`.

    İkili sınıflamada (n,), çok sınıflıda (n, K) döner.
    """
    if hasattr(estimator, "decision_function"):
        scores = np.asarray(estimator.decision_function(X), dtype=np.float64)
    else:
        scores = np.asarray(estimator.predict_proba(X), dtype=np.float64)
        if scores.shape[1] == 2:
            scores = scores[:, 1]
    return scores


class CalibratedPair:
    """Eğitilmiş bir model + sınıf başına kalibrasyon eşlemeleri (tek bir katın sonucu)."""

    def __init__(self, estimator: Any, calibrators: list[Any], classes: Array) -> None:
        self.estimator = estimator
        self.calibrators = calibrators
        self.classes = classes

    def predict_proba(self, X: Any) -> Array:
        scores = response_scores(self.estimator, X)
        n_classes = len(self.classes)
        if n_classes == 2:
            positive = self.calibrators[0].predict(scores)
            return np.column_stack([1.0 - positive, positive])
        columns = np.searchsorted(self.classes, self.estimator.classes_)
        probabilities = np.zeros((scores.shape[0], n_classes))
        for position, calibrator in enumerate(self.calibrators):
            probabilities[:, columns[position]] = calibrator.predict(scores[:, position])
        total = probabilities.sum(axis=1, keepdims=True)
        uniform = np.full_like(probabilities, 1.0 / n_classes)
        return np.divide(probabilities, total, out=uniform, where=total > 0)


def fit_calibrators(
    scores: Array, codes: Array, classes: Array, method: str, model_classes: Array
) -> list[Any]:
    """Skorlardan sınıf başına (ikilide tek) eşleme öğrenir."""
    if len(classes) == 2:
        return [_make_calibrator(method).fit(scores, codes == 1)]
    positions = np.searchsorted(classes, model_classes)
    return [
        _make_calibrator(method).fit(scores[:, column], codes == positions[column])
        for column in range(scores.shape[1])
    ]


class CalibratedClassifierCV(BaseEstimator, ClassifierMixin):
    """Bir sınıflandırıcının olasılıklarını çapraz doğrulamayla kalibre eder."""

    def __init__(
        self, estimator: Any, method: str = "sigmoid", cv: Any = 5, ensemble: bool = True
    ) -> None:
        self.estimator = estimator
        self.method = method
        self.cv = cv
        self.ensemble = ensemble

    def fit(self, X: Any, y: ArrayLike) -> Self:
        from ml_temel.secim.splitters import check_cv  # döngüsel içe aktarmayı önler
        from ml_temel.secim.validate import cross_val_predict

        target = column_or_1d(y)
        check_consistent_length(X, target)
        self.classes_, codes = encode_labels(target)
        _make_calibrator(self.method)  # yöntem adını erken denetle
        splitter = check_cv(self.cv, target, classifier=True)
        self.calibrated_classifiers_: list[CalibratedPair] = []
        if self.ensemble:
            for train, test in splitter.split(X, target):
                model = clone(self.estimator).fit(take_rows(X, train), target[train])
                scores = response_scores(model, take_rows(X, test))
                calibrators = fit_calibrators(
                    scores, codes[test], self.classes_, self.method, model.classes_
                )
                self.calibrated_classifiers_.append(
                    CalibratedPair(model, calibrators, self.classes_)
                )
            return self
        method = (
            "decision_function" if hasattr(self.estimator, "decision_function") else "predict_proba"
        )
        scores = cross_val_predict(clone(self.estimator), X, target, cv=splitter, method=method)
        if method == "predict_proba" and scores.shape[1] == 2:
            scores = scores[:, 1]
        model = clone(self.estimator).fit(X, target)
        calibrators = fit_calibrators(scores, codes, self.classes_, self.method, self.classes_)
        self.calibrated_classifiers_.append(CalibratedPair(model, calibrators, self.classes_))
        return self

    def predict_proba(self, X: Any) -> Array:
        check_is_fitted(self, "calibrated_classifiers_")
        total = self.calibrated_classifiers_[0].predict_proba(X)
        for pair in self.calibrated_classifiers_[1:]:
            total = total + pair.predict_proba(X)
        return total / len(self.calibrated_classifiers_)

    def predict(self, X: Any) -> Array:
        labels: Array = self.classes_[self.predict_proba(X).argmax(axis=1)]
        return labels
