"""Doğrusal modeller, lojistik regresyon, doğrusal SVM, taban modeller ve L-BFGS.

Her model rastgele veride scikit-learn ile karşılaştırılır (scikit-learn yoksa atlanır);
ayrıca bilinen çözümlü küçük örnekler sınanır.
"""

from __future__ import annotations

import warnings

import numpy as np
import pytest

from ml_temel.klasik import (
    DummyClassifier,
    DummyRegressor,
    LinearRegression,
    LinearSVC,
    LogisticRegression,
    Ridge,
)
from ml_temel.klasik._optimize import minimize_lbfgs

sk_linear = pytest.importorskip("sklearn.linear_model", reason="karşılaştırma için scikit-learn")


def regression_data(n: int = 120, p: int = 5, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((n, p)) * rng.uniform(0.5, 3.0, p)
    y = X @ rng.standard_normal(p) + 4.0 + 0.3 * rng.standard_normal(n)
    return X, y


def test_lbfgs_minimizes_a_badly_scaled_quadratic() -> None:
    scales = np.array([1.0, 100.0, 0.01])

    def quadratic(x: np.ndarray) -> tuple[float, np.ndarray]:
        diff = x - np.array([1.0, -2.0, 3.0])
        return float((scales * diff**2).sum()), 2.0 * scales * diff

    result = minimize_lbfgs(quadratic, np.zeros(3), tol=1e-10)
    assert result.converged
    np.testing.assert_allclose(result.x, [1.0, -2.0, 3.0], atol=1e-7)


def test_linear_regression_known_solution_and_sklearn() -> None:
    X = np.array([[1.0], [2.0], [3.0], [4.0]])
    model = LinearRegression().fit(X, [3.0, 5.0, 7.0, 9.0])  # y = 2x + 1
    np.testing.assert_allclose(model.coef_, [2.0])
    assert model.intercept_ == pytest.approx(1.0)
    X, y = regression_data()
    weights = np.random.default_rng(1).uniform(0.5, 2.0, X.shape[0])
    ours = LinearRegression().fit(X, y, sample_weight=weights)
    theirs = sk_linear.LinearRegression().fit(X, y, sample_weight=weights)
    np.testing.assert_allclose(ours.coef_, theirs.coef_, rtol=1e-9)
    assert ours.intercept_ == pytest.approx(theirs.intercept_)
    assert ours.score(X, y) == pytest.approx(theirs.score(X, y))


def test_linear_regression_survives_duplicate_columns() -> None:
    X, y = regression_data()
    doubled = np.column_stack([X, X[:, 0]])  # tekil matris
    model = LinearRegression().fit(doubled, y)
    assert model.rank_ == X.shape[1]
    np.testing.assert_allclose(model.predict(doubled), LinearRegression().fit(X, y).predict(X))


@pytest.mark.parametrize(("n", "p"), [(80, 6), (20, 50)])  # birincil ve çift (dual) çözüm
def test_ridge_matches_sklearn(n: int, p: int) -> None:
    X, y = regression_data(n, p)
    for alpha in (0.1, 3.0):
        ours = Ridge(alpha=alpha).fit(X, y)
        theirs = sk_linear.Ridge(alpha=alpha).fit(X, y)
        np.testing.assert_allclose(ours.coef_, theirs.coef_, rtol=1e-6, atol=1e-9)
        assert ours.intercept_ == pytest.approx(theirs.intercept_, rel=1e-6)
    no_intercept = Ridge(alpha=1.0, fit_intercept=False).fit(X, y)
    reference = sk_linear.Ridge(alpha=1.0, fit_intercept=False).fit(X, y)
    np.testing.assert_allclose(no_intercept.coef_, reference.coef_, rtol=1e-6, atol=1e-9)


def classification_data(classes: int, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((300, 4))
    logits = X @ rng.standard_normal((4, classes)) * 1.5
    y = np.array([rng.choice(classes, p=np.exp(z) / np.exp(z).sum()) for z in logits])
    return X, y


@pytest.mark.parametrize("classes", [2, 4])
def test_logistic_regression_matches_sklearn(classes: int) -> None:
    X, y = classification_data(classes)
    labels = np.array(["ağaç", "çiçek", "ırmak", "şehir"])[y]
    for C in (0.05, 1.0):
        ours = LogisticRegression(C=C, tol=1e-9).fit(X, labels)
        theirs = sk_linear.LogisticRegression(C=C, tol=1e-10, max_iter=5000).fit(X, labels)
        np.testing.assert_allclose(ours.coef_, theirs.coef_, atol=1e-5)
        np.testing.assert_allclose(ours.intercept_, theirs.intercept_, atol=1e-5)
        np.testing.assert_allclose(ours.predict_proba(X), theirs.predict_proba(X), atol=1e-6)
        assert (ours.predict(X) == theirs.predict(X)).all()
    assert list(ours.classes_) == sorted(set(labels))


def test_logistic_regression_weights_and_balanced_classes() -> None:
    X, y = classification_data(2, seed=3)
    weights = np.random.default_rng(0).uniform(0.2, 3.0, y.size)
    ours = LogisticRegression(tol=1e-9).fit(X, y, sample_weight=weights)
    theirs = sk_linear.LogisticRegression(tol=1e-10, max_iter=5000).fit(X, y, sample_weight=weights)
    np.testing.assert_allclose(ours.coef_, theirs.coef_, atol=1e-5)
    rare = np.r_[np.zeros(270), np.ones(30)]
    balanced = LogisticRegression(class_weight="balanced").fit(X, rare)
    plain = LogisticRegression().fit(X, rare)
    assert balanced.predict_proba(X)[:, 1].mean() > plain.predict_proba(X)[:, 1].mean() + 0.2


def test_logistic_regression_is_stable_on_separable_data() -> None:
    X = np.array([[-3.0], [-2.0], [-1.0], [1.0], [2.0], [3.0]])
    model = LogisticRegression(C=1e4).fit(X, [0, 0, 0, 1, 1, 1])
    proba = model.predict_proba(X)
    assert np.isfinite(proba).all()
    assert (model.predict(X) == [0, 0, 0, 1, 1, 1]).all()
    with pytest.raises(ValueError, match="en az 2 sınıf"):
        LogisticRegression().fit(X, np.zeros(6))


def test_linear_svc_matches_sklearn() -> None:
    sk_svm = pytest.importorskip("sklearn.svm")
    for classes in (2, 3):
        X, y = classification_data(classes, seed=5)
        ours = LinearSVC(C=0.5, tol=1e-10, max_iter=5000).fit(X, y)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            theirs = sk_svm.LinearSVC(C=0.5, dual=False, tol=1e-10, max_iter=100_000).fit(X, y)
        np.testing.assert_allclose(ours.coef_, theirs.coef_, atol=1e-4)
        np.testing.assert_allclose(ours.intercept_, theirs.intercept_, atol=1e-4)
        assert np.mean(ours.predict(X) == theirs.predict(X)) > 0.99


def test_dummy_models_are_the_honest_baseline() -> None:
    X = np.zeros((6, 2))
    y = np.array(["evet", "hayır", "hayır", "hayır", "evet", "hayır"])
    prior = DummyClassifier().fit(X, y)
    np.testing.assert_allclose(prior.predict_proba(X[:1]), [[1 / 3, 2 / 3]])
    assert (prior.predict(X) == "hayır").all()
    frequent = DummyClassifier(strategy="most_frequent").fit(X, y)
    np.testing.assert_allclose(frequent.predict_proba(X[:1]), [[0.0, 1.0]])
    assert DummyRegressor().fit(X, [1.0, 2.0, 3.0, 4.0, 5.0, 9.0]).predict(X[:2]).tolist() == [4, 4]
    assert DummyRegressor(strategy="median").fit(X, [1.0, 2, 3, 4, 5, 9]).constant_ == 3.5
