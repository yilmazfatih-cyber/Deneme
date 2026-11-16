"""Ayrım ve çapraz doğrulama: sızıntı olmadığını KANITLAYAN testler + scikit-learn kıyası."""

from __future__ import annotations

from typing import Any, Self

import numpy as np
import pytest

from ml_temel.ortak import BaseEstimator, ClassifierMixin, Table, TransformerMixin
from ml_temel.secim import (
    GridSearchCV,
    GroupKFold,
    KFold,
    ParameterGrid,
    StratifiedKFold,
    TimeSeriesSplit,
    cross_val_predict,
    cross_val_score,
    cross_validate,
    train_test_split,
)


def assert_partition(splits: list[tuple[np.ndarray, np.ndarray]], n_samples: int) -> None:
    """Her satır tam bir kez sınamada; eğitim ile sınama hiç kesişmiyor; birleşimi tüm veri."""
    counted = np.zeros(n_samples, dtype=int)
    for train, test in splits:
        assert np.intersect1d(train, test).size == 0
        assert train.size + test.size == n_samples
        counted[test] += 1
    np.testing.assert_array_equal(counted, 1)


@pytest.mark.parametrize("shuffle", [False, True])
def test_kfold_is_a_partition_with_balanced_sizes(shuffle: bool) -> None:
    X = np.zeros((23, 2))
    splits = list(KFold(5, shuffle=shuffle, random_state=0).split(X))
    assert_partition(splits, 23)
    assert sorted(test.size for _, test in splits) == [4, 4, 5, 5, 5]
    again = list(KFold(5, shuffle=shuffle, random_state=0).split(X))
    for (_, a), (_, b) in zip(splits, again, strict=True):
        np.testing.assert_array_equal(a, b)


def test_kfold_matches_sklearn_without_shuffle() -> None:
    sk = pytest.importorskip("sklearn.model_selection")
    X = np.zeros((17, 1))
    for ours, theirs in zip(KFold(4).split(X), sk.KFold(4).split(X), strict=True):
        np.testing.assert_array_equal(ours[1], theirs[1])


def test_stratified_kfold_preserves_class_ratios() -> None:
    rng = np.random.default_rng(0)
    y = rng.permutation(np.repeat(["a", "b", "c"], [60, 25, 9]))
    splits = list(StratifiedKFold(4, shuffle=True, random_state=1).split(y, y))
    assert_partition(splits, y.size)
    for _, test in splits:
        counts = {label: int((y[test] == label).sum()) for label in "abc"}
        assert counts["a"] == 15
        assert counts["b"] in (6, 7)
        assert counts["c"] in (2, 3)
    assert max(t.size for _, t in splits) - min(t.size for _, t in splits) <= 1
    with pytest.warns(UserWarning, match="Kat sayısını azaltın"):
        list(StratifiedKFold(3).split(np.zeros(7), [0, 0, 0, 0, 0, 1, 1]))


def test_group_kfold_never_splits_a_group() -> None:
    rng = np.random.default_rng(0)
    groups = rng.integers(0, 17, size=200)
    splits = list(GroupKFold(4).split(np.zeros(200), groups=groups))
    assert_partition(splits, 200)
    for train, test in splits:
        assert np.intersect1d(groups[train], groups[test]).size == 0
    sizes = [test.size for _, test in splits]
    assert max(sizes) - min(sizes) <= 20  # açgözlü dengeleme
    with pytest.raises(ValueError, match="groups"):
        list(GroupKFold(3).split(np.zeros(10)))
    with pytest.raises(ValueError, match="farklı grup sayısından"):
        list(GroupKFold(5).split(np.zeros(6), groups=[1, 1, 2, 2, 3, 3]))


@pytest.mark.parametrize(
    "kwargs", [{}, {"gap": 3}, {"test_size": 4}, {"max_train_size": 10, "gap": 1}]
)
def test_time_series_split_never_looks_into_the_future(kwargs: dict[str, int]) -> None:
    sk = pytest.importorskip("sklearn.model_selection")
    X = np.zeros((47, 1))
    ours = list(TimeSeriesSplit(4, **kwargs).split(X))
    theirs = list(sk.TimeSeriesSplit(4, **kwargs).split(X))
    previous_start = -1
    for (train, test), (sk_train, sk_test) in zip(ours, theirs, strict=True):
        assert train.max() + kwargs.get("gap", 0) < test.min()  # eğitim hep geçmişte
        assert test.min() > previous_start
        previous_start = int(test.min())
        np.testing.assert_array_equal(train, sk_train)
        np.testing.assert_array_equal(test, sk_test)
    with pytest.raises(ValueError, match="yetmiyor"):
        list(TimeSeriesSplit(10).split(np.zeros((5, 1))))


def test_train_test_split_basic_and_stratified() -> None:
    X = np.arange(100).reshape(50, 2)
    y = np.repeat([0, 1], [40, 10])
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
    assert X_tr.shape == (40, 2)
    assert X_te.shape == (10, 2)
    assert y_te.sum() == 2  # %20 pozitif oranı korunur
    assert y_tr.sum() == 8
    np.testing.assert_array_equal(np.sort(np.concatenate([X_tr[:, 0], X_te[:, 0]])), X[:, 0])
    np.testing.assert_array_equal(X_tr[:, 0] // 2 >= 40, y_tr == 1)  # X ile y birlikte taşındı
    same = train_test_split(X, y, test_size=0.2, random_state=0, stratify=y)
    np.testing.assert_array_equal(same[1], X_te)
    with pytest.raises(ValueError, match="en az 2 örnek"):
        train_test_split(X, stratify=np.r_[np.zeros(49), 1])


def test_train_test_split_keeps_groups_and_time_order() -> None:
    groups = np.repeat(np.arange(20), 5)
    X = np.arange(100)
    g_tr, g_te = train_test_split(groups, test_size=0.25, random_state=0, groups=groups)
    assert np.intersect1d(g_tr, g_te).size == 0
    assert 20 <= g_te.size <= 30
    past, future = train_test_split(X, test_size=0.2, shuffle=False)
    np.testing.assert_array_equal(past, np.arange(80))
    np.testing.assert_array_equal(future, np.arange(80, 100))


def test_train_test_split_accepts_tables_and_lists() -> None:
    table = Table({"yaş": np.arange(10.0), "şehir": np.array(list("abcdefghij"), dtype=object)})
    labels = list("xxxxxyyyyy")
    t_tr, t_te, l_tr, l_te = train_test_split(table, labels, test_size=3, random_state=0)
    assert isinstance(t_tr, Table)
    assert len(t_tr) == 7
    assert len(t_te) == 3
    assert [labels[int(i)] for i in t_te["yaş"]] == l_te
    assert len(l_tr) == 7


class SpyScaler(BaseEstimator, TransformerMixin):
    """Hangi satırlarla `fit` edildiğini kaydeden dönüştürücü (ilk sütun satır kimliğidir)."""

    seen: list[np.ndarray] = []  # noqa: RUF012 - testte bilerek sınıf düzeyinde ortak kayıt

    def fit(self, X: np.ndarray, y: Any = None) -> Self:
        SpyScaler.seen.append(np.sort(X[:, 0].astype(int)))
        self.mean_ = X.mean(axis=0)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        return X - self.mean_


class SpyModel(BaseEstimator, ClassifierMixin):
    """Ön işlemeyi kendi içinde `fit` eden en küçük "Pipeline"; tahmini hep çoğunluk sınıfıdır."""

    def __init__(self, shift: float = 0.0) -> None:
        self.shift = shift

    def fit(self, X: np.ndarray, y: np.ndarray) -> Self:
        self.scaler_ = SpyScaler().fit(X)
        values, counts = np.unique(y, return_counts=True)
        self.classes_ = values
        self.majority_ = values[int(np.argmax(counts))]
        self.trained_on_ = np.sort(X[:, 0].astype(int))
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        leaked = np.intersect1d(self.trained_on_, X[:, 0].astype(int))
        assert leaked.size == 0, "sınama satırı eğitimde görülmüş: sızıntı!"
        return np.full(X.shape[0], self.majority_)


def test_cross_validate_fits_preprocessing_only_on_training_rows() -> None:
    SpyScaler.seen = []
    X = np.column_stack([np.arange(40), np.random.default_rng(0).standard_normal(40)])
    y = np.repeat([0, 1], 20)
    splitter = StratifiedKFold(4, shuffle=True, random_state=0)
    result = cross_validate(SpyModel(), X, y, cv=splitter, return_estimator=True)
    assert len(SpyScaler.seen) == 4
    for (train, test), fitted_rows in zip(splitter.split(X, y), SpyScaler.seen, strict=True):
        np.testing.assert_array_equal(fitted_rows, np.sort(train))  # tam olarak eğitim satırları
        assert np.intersect1d(fitted_rows, test).size == 0
    assert len(result["estimator"]) == 4
    assert result["test_score"].shape == (4,)
    np.testing.assert_allclose(result["test_score"], 0.5)


def test_cross_validate_groups_and_multiple_metrics() -> None:
    X = np.column_stack([np.arange(60), np.zeros(60)])
    y = np.tile([0, 1], 30)
    groups = np.repeat(np.arange(12), 5)
    result = cross_validate(
        SpyModel(),
        X,
        y,
        groups=groups,
        cv=GroupKFold(3),
        scoring=["accuracy", "balanced_accuracy"],
    )
    assert set(result) >= {"test_accuracy", "test_balanced_accuracy", "fit_time", "score_time"}
    np.testing.assert_allclose(result["test_balanced_accuracy"], 0.5)
    scores = cross_val_score(SpyModel(), X, y, cv=3)
    assert scores.shape == (3,)


def test_cross_val_predict_is_out_of_fold() -> None:
    X = np.column_stack([np.arange(30), np.zeros(30)])
    y = np.repeat([0, 1, 2], 10)
    predicted = cross_val_predict(SpyModel(), X, y, cv=StratifiedKFold(5))
    assert predicted.shape == (30,)  # SpyModel.predict içindeki assert sızıntıyı yakalardı
    with pytest.raises(ValueError, match="tam bir kez"):
        cross_val_predict(SpyModel(), X, y, cv=TimeSeriesSplit(3))


def test_parameter_grid_and_grid_search() -> None:
    grid = ParameterGrid({"b": [1, 2], "a": ["x"]})
    assert list(grid) == [{"a": "x", "b": 1}, {"a": "x", "b": 2}]
    assert len(ParameterGrid([{"a": [1, 2]}, {"b": [3]}])) == 3
    with pytest.raises(ValueError, match="liste olmalı"):
        ParameterGrid({"a": 5})  # type: ignore[dict-item]

    class Threshold(BaseEstimator, ClassifierMixin):
        def __init__(self, cut: float = 0.0) -> None:
            self.cut = cut

        def fit(self, X: np.ndarray, y: np.ndarray) -> Self:
            self.classes_ = np.unique(y)
            return self

        def predict(self, X: np.ndarray) -> np.ndarray:
            return (X[:, 0] > self.cut).astype(int)

    X = np.linspace(-1, 1, 60).reshape(-1, 1)
    y = (X[:, 0] > 0.3).astype(int)
    search = GridSearchCV(Threshold(), {"cut": [-0.5, 0.0, 0.3, 0.8]}, cv=3).fit(X, y)
    assert search.best_params_ == {"cut": 0.3}
    assert search.best_score_ == 1.0
    assert search.cv_results_["rank_test_score"][2] == 1
    assert search.score(X, y) == 1.0
    np.testing.assert_array_equal(search.predict(X), y)
    nested = cross_validate(search, X, y, cv=3, return_train_score=True)  # iç içe çapraz doğrulama
    assert set(nested) >= {"test_score", "train_score"}
    np.testing.assert_allclose(nested["train_score"], 1.0)
    with pytest.raises(ValueError, match="geçersiz parametre"):
        GridSearchCV(Threshold(), {"yok": [1]}, cv=3).fit(X, y)
