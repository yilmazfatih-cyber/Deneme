"""Kalibrasyon: izotonik, Platt ve CalibratedClassifierCV — scikit-learn ile aynı katlarla."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.klasik import (
    CalibratedClassifierCV,
    GaussianNB,
    IsotonicRegression,
    LogisticRegression,
    SigmoidCalibration,
)
from ml_temel.klasik.calibration import pava
from ml_temel.olcut import brier_score_loss, expected_calibration_error
from ml_temel.secim import StratifiedKFold

sklearn = pytest.importorskip("sklearn", reason="karşılaştırma için scikit-learn gerekir")
from sklearn import calibration as sk_calibration  # noqa: E402
from sklearn import isotonic as sk_isotonic  # noqa: E402
from sklearn import linear_model as sk_linear  # noqa: E402
from sklearn import naive_bayes as sk_nb  # noqa: E402


def test_pava_known_example() -> None:
    np.testing.assert_allclose(pava(np.array([1.0, 3.0, 2.0, 4.0]), np.ones(4)), [1, 2.5, 2.5, 4])
    np.testing.assert_allclose(pava(np.array([3.0, 1.0]), np.array([1.0, 3.0])), [1.5, 1.5])
    increasing = np.array([0.1, 0.2, 0.9])
    np.testing.assert_allclose(pava(increasing, np.ones(3)), increasing)


@pytest.mark.parametrize("increasing", [True, False])
def test_isotonic_regression_matches_sklearn(increasing: bool) -> None:
    rng = np.random.default_rng(0)
    x = np.round(rng.uniform(0, 10, 300), 1)  # eşit x değerleri de var
    y = (1 if increasing else -1) * np.log1p(x) + rng.standard_normal(300) * 0.5
    weights = rng.uniform(0.5, 2.0, 300)
    ours = IsotonicRegression(increasing=increasing).fit(x, y, sample_weight=weights)
    theirs = sk_isotonic.IsotonicRegression(increasing=increasing, out_of_bounds="clip")
    theirs.fit(x, y, sample_weight=weights)
    grid = np.linspace(-1, 11, 500)
    np.testing.assert_allclose(ours.predict(grid), theirs.predict(grid), atol=1e-10)
    outside = IsotonicRegression(out_of_bounds="nan").fit(x, y).predict([-5.0, 5.0])
    assert np.isnan(outside[0]) and np.isfinite(outside[1])


def test_sigmoid_calibration_matches_sklearn() -> None:
    from sklearn.calibration import _SigmoidCalibration

    rng = np.random.default_rng(1)
    scores = rng.standard_normal(400) * 3
    y = (rng.random(400) < 1 / (1 + np.exp(-0.7 * scores + 0.4))).astype(int)
    ours = SigmoidCalibration().fit(scores, y)
    theirs = _SigmoidCalibration().fit(scores, y)
    assert ours.a_ == pytest.approx(theirs.a_, abs=1e-4)
    assert ours.b_ == pytest.approx(theirs.b_, abs=1e-4)
    np.testing.assert_allclose(ours.predict(scores), theirs.predict(scores), atol=1e-5)


def calibration_data(seed: int = 2, classes: int = 2) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((600, 4))
    X[:, 1] = X[:, 0] + 0.1 * rng.standard_normal(600)  # NB'nin bağımsızlık varsayımını boz
    logits = X @ rng.standard_normal((4, classes)) * 2
    y = np.array([rng.choice(classes, p=np.exp(z) / np.exp(z).sum()) for z in logits])
    return X, y


@pytest.mark.parametrize("method", ["sigmoid", "isotonic"])
@pytest.mark.parametrize("ensemble", [True, False])
def test_calibrated_classifier_matches_sklearn_with_same_folds(method: str, ensemble: bool) -> None:
    X, y = calibration_data()
    folds = list(StratifiedKFold(4, shuffle=True, random_state=0).split(X, y))
    ours = CalibratedClassifierCV(
        LogisticRegression(tol=1e-10), method, cv=folds, ensemble=ensemble
    )
    theirs = sk_calibration.CalibratedClassifierCV(
        sk_linear.LogisticRegression(tol=1e-10, max_iter=5000),
        method=method,
        cv=folds,
        ensemble=ensemble,
    )
    ours.fit(X, y)
    theirs.fit(X, y)
    test = np.random.default_rng(3).standard_normal((200, 4))
    np.testing.assert_allclose(ours.predict_proba(test), theirs.predict_proba(test), atol=2e-4)


def test_calibration_multiclass_matches_sklearn() -> None:
    X, y = calibration_data(4, classes=3)
    folds = list(StratifiedKFold(3, shuffle=True, random_state=1).split(X, y))
    ours = CalibratedClassifierCV(GaussianNB(), "isotonic", cv=folds).fit(X, y)
    theirs = sk_calibration.CalibratedClassifierCV(sk_nb.GaussianNB(), method="isotonic", cv=folds)
    theirs.fit(X, y)
    np.testing.assert_allclose(ours.predict_proba(X), theirs.predict_proba(X), atol=1e-8)


def test_calibration_improves_an_overconfident_model() -> None:
    X_all, y_all = calibration_data(5)  # aynı dağılım: önce üret, sonra böl
    X, y, X_test, y_test = X_all[:400], y_all[:400], X_all[400:], y_all[400:]
    raw = GaussianNB().fit(X, y)
    calibrated = CalibratedClassifierCV(GaussianNB(), "sigmoid", cv=5).fit(X, y)
    raw_p, cal_p = raw.predict_proba(X_test)[:, 1], calibrated.predict_proba(X_test)[:, 1]
    assert expected_calibration_error(y_test, cal_p) < expected_calibration_error(y_test, raw_p)
    assert brier_score_loss(y_test, cal_p) < brier_score_loss(y_test, raw_p)
