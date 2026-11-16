"""Karar ağacı, rastgele orman, gradyan artırma ve izolasyon ormanı.

Ağaçlar: bölme araması kaba kuvvetle, küçük derinlikte yapı scikit-learn ile birebir; derin
ağaçlarda ölçüm düzeyinde karşılaştırma (eşit kazançlı bölmelerde seçim sırası farklı olabilir).
"""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.klasik import (
    DecisionTreeClassifier,
    DecisionTreeRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    IsolationForest,
    RandomForestClassifier,
    RandomForestRegressor,
)
from ml_temel.klasik._cart import PROXIES, CartSettings, _best_splits, dense_ranks

sklearn = pytest.importorskip("sklearn", reason="karşılaştırma için scikit-learn gerekir")
from sklearn import ensemble as sk_ensemble  # noqa: E402
from sklearn import tree as sk_tree  # noqa: E402
from sklearn.metrics import r2_score, roc_auc_score  # noqa: E402


def table_data(n: int = 600, seed: int = 0) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = np.round(rng.standard_normal((n, 6)), 1)
    signal = X[:, 0] + X[:, 1] ** 2 - X[:, 2] * X[:, 3]
    y_class = (signal + 0.3 * rng.standard_normal(n) > 0.5).astype(int)
    y_reg = 2 * X[:, 0] + np.sin(2 * X[:, 1]) + 0.1 * rng.standard_normal(n)
    return X, y_class, y_reg


def test_split_search_matches_brute_force() -> None:
    rng = np.random.default_rng(1)
    X = np.round(rng.standard_normal((200, 3)), 1)
    stats = np.eye(2)[rng.integers(0, 2, 200)]
    rows = rng.permutation(200)[:150]
    node = rng.integers(0, 5, 150)
    totals = np.column_stack([np.bincount(node, c, minlength=5) for c in stats[rows].T])
    counts = np.bincount(node, minlength=5)
    settings = CartSettings("gini", None, 2, 1, 3, 0.0)
    gain, feature, threshold = _best_splits(
        X, dense_ranks(X), stats, rows, node, totals, counts, settings, rng
    )
    for a in range(5):
        members = rows[node == a]
        best = -np.inf
        for f in range(3):
            values = np.unique(X[members, f])
            for cut in (values[:-1] + values[1:]) / 2:
                left = stats[members[X[members, f] <= cut]].sum(0)
                right = stats[members[X[members, f] > cut]].sum(0)
                score = (
                    PROXIES["gini"](left) + PROXIES["gini"](right) - PROXIES["gini"](left + right)
                )
                best = max(best, score)
        assert gain[a] == pytest.approx(best)
        left = stats[members[X[members, feature[a]] <= threshold[a]]].sum(0)
        right = stats[members[X[members, feature[a]] > threshold[a]]].sum(0)
        assert PROXIES["gini"](left) + PROXIES["gini"](right) - PROXIES["gini"](
            left + right
        ) == pytest.approx(gain[a])


@pytest.mark.parametrize("criterion", ["gini", "entropy"])
def test_shallow_classifier_tree_is_identical_to_sklearn(criterion: str) -> None:
    X, y, _ = table_data()
    ours = DecisionTreeClassifier(criterion=criterion, max_depth=4).fit(X, y)
    theirs = sk_tree.DecisionTreeClassifier(criterion=criterion, max_depth=4, random_state=0)
    theirs.fit(X, y)
    test = np.round(np.random.default_rng(9).standard_normal((300, 6)), 1)
    np.testing.assert_allclose(ours.predict_proba(test), theirs.predict_proba(test), atol=1e-12)
    # entropide bir düğümde iki özellik TAM aynı kazancı veriyor: biz düşük numaralıyı, scikit-learn
    # rastgele özellik sırasıyla diğerini seçiyor. Tahminler yine aynı; önemler biraz kayıyor.
    tolerance = 1e-9 if criterion == "gini" else 0.02
    np.testing.assert_allclose(
        ours.feature_importances_, theirs.feature_importances_, atol=tolerance
    )
    assert ours.get_n_leaves() == theirs.get_n_leaves()
    assert ours.get_depth() == theirs.get_depth()


def test_deep_trees_match_sklearn_in_size_and_quality() -> None:
    X, y, y_reg = table_data(900, seed=2)
    X_test, y_test, y_reg_test = table_data(600, seed=3)
    ours = DecisionTreeClassifier(min_samples_leaf=3).fit(X, y)
    theirs = sk_tree.DecisionTreeClassifier(min_samples_leaf=3, random_state=0).fit(X, y)
    assert ours.get_n_leaves() == theirs.get_n_leaves()
    assert abs(ours.score(X_test, y_test) - theirs.score(X_test, y_test)) < 0.03
    ours_r = DecisionTreeRegressor(max_depth=8, min_samples_leaf=5).fit(X, y_reg)
    theirs_r = sk_tree.DecisionTreeRegressor(max_depth=8, min_samples_leaf=5, random_state=0)
    theirs_r.fit(X, y_reg)
    assert ours_r.get_n_leaves() == theirs_r.get_n_leaves()
    assert abs(ours_r.score(X_test, y_reg_test) - theirs_r.score(X_test, y_reg_test)) < 0.03


def test_tree_memorizes_training_data_and_respects_limits() -> None:
    X, y, y_reg = table_data(300, seed=4)
    unique_rows = np.unique(X, axis=0).shape[0] == X.shape[0]
    full = DecisionTreeClassifier(random_state=0).fit(X, y)
    if unique_rows:
        assert full.score(X, y) == 1.0
    stump = DecisionTreeRegressor(max_depth=1).fit(X, y_reg)
    assert stump.get_n_leaves() == 2
    leafy = DecisionTreeClassifier(min_samples_leaf=40).fit(X, y)
    counts = np.bincount(leafy.apply(X))
    assert counts[counts > 0].min() >= 40
    weighted = DecisionTreeClassifier(max_depth=2).fit(X, y, sample_weight=np.where(y, 5.0, 1.0))
    assert weighted.predict_proba(X)[:, 1].mean() > full.predict_proba(X)[:, 1].mean()
    with pytest.raises(ValueError, match="NaN"):
        DecisionTreeClassifier().fit(np.where(X > 2, np.nan, X), y)


def test_random_forest_quality_oob_and_seed() -> None:
    X, y, y_reg = table_data(800, seed=5)
    X_test, y_test, y_reg_test = table_data(800, seed=6)
    ours = RandomForestClassifier(n_estimators=40, oob_score=True, random_state=0).fit(X, y)
    theirs = sk_ensemble.RandomForestClassifier(n_estimators=40, random_state=0).fit(X, y)
    auc_ours = roc_auc_score(y_test, ours.predict_proba(X_test)[:, 1])
    auc_theirs = roc_auc_score(y_test, theirs.predict_proba(X_test)[:, 1])
    assert abs(auc_ours - auc_theirs) < 0.02
    assert abs(ours.oob_score_ - ours.score(X_test, y_test)) < 0.05  # OOB dürüst bir kestirimdir
    assert ours.feature_importances_.sum() == pytest.approx(1.0)
    assert int(np.argmax(ours.feature_importances_)) in (0, 1)
    again = RandomForestClassifier(n_estimators=40, oob_score=True, random_state=0).fit(X, y)
    np.testing.assert_array_equal(again.predict_proba(X_test), ours.predict_proba(X_test))
    ours_r = RandomForestRegressor(n_estimators=30, random_state=0, oob_score=True).fit(X, y_reg)
    theirs_r = sk_ensemble.RandomForestRegressor(n_estimators=30, random_state=0).fit(X, y_reg)
    r2_ours = r2_score(y_reg_test, ours_r.predict(X_test))
    r2_theirs = r2_score(y_reg_test, theirs_r.predict(X_test))
    assert abs(r2_ours - r2_theirs) < 0.02
    assert ours_r.oob_score_ > 0.8


def missing_data(n: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    rng = np.random.default_rng(seed)
    X = rng.standard_normal((n, 8))
    X[rng.random(X.shape) < 0.05] = np.nan
    clean = np.nan_to_num(X)
    y = 2 * clean[:, 0] + np.sin(3 * clean[:, 1]) + 1.5 * np.isnan(X[:, 2])
    return X, y + 0.3 * rng.standard_normal(n)


def test_gradient_boosting_regressor_matches_sklearn_with_missing_values() -> None:
    X, y = missing_data(2000, 0)
    X_test, y_test = missing_data(1000, 1)
    kwargs = {"max_iter": 60, "early_stopping": False, "random_state": 0}
    ours = HistGradientBoostingRegressor(**kwargs).fit(X, y)
    theirs = sk_ensemble.HistGradientBoostingRegressor(**kwargs).fit(X, y)
    r2_ours, r2_theirs = (
        r2_score(y_test, ours.predict(X_test)),
        r2_score(y_test, theirs.predict(X_test)),
    )
    assert r2_ours == pytest.approx(r2_theirs, abs=0.01)
    assert r2_ours > 0.9
    assert np.corrcoef(ours.predict(X_test), theirs.predict(X_test))[0, 1] > 0.995
    assert ours.n_iter_ == 60


@pytest.mark.parametrize("classes", [2, 3])
def test_gradient_boosting_classifier_matches_sklearn(classes: int) -> None:
    X, y = missing_data(2000, 2)
    X_test, y_test = missing_data(1000, 3)
    cuts = np.quantile(y, np.linspace(0, 1, classes + 1)[1:-1])
    labels, labels_test = np.digitize(y, cuts), np.digitize(y_test, cuts)
    kwargs = {"max_iter": 40, "early_stopping": False, "random_state": 0}
    ours = HistGradientBoostingClassifier(**kwargs).fit(X, labels)
    theirs = sk_ensemble.HistGradientBoostingClassifier(**kwargs).fit(X, labels)
    p_ours, p_theirs = ours.predict_proba(X_test), theirs.predict_proba(X_test)
    assert np.abs(p_ours - p_theirs).mean() < 0.02
    assert (
        abs((p_ours.argmax(1) == labels_test).mean() - (p_theirs.argmax(1) == labels_test).mean())
        < 0.02
    )
    np.testing.assert_allclose(p_ours.sum(axis=1), 1.0)
    if classes == 2:
        assert ours.decision_function(X_test).shape == (1000,)


def test_gradient_boosting_early_stopping_and_limits() -> None:
    X, y = missing_data(3000, 4)
    model = HistGradientBoostingRegressor(
        max_iter=500, learning_rate=0.3, early_stopping=True, n_iter_no_change=5, random_state=0
    ).fit(X, y)
    assert model.n_iter_ < 500
    assert len(model.validation_score_) == model.n_iter_ + 1  # +1: başlangıç tahmini
    stumps = HistGradientBoostingRegressor(max_iter=5, max_depth=1, early_stopping=False).fit(X, y)
    assert all(step[0].n_leaves == 2 for step in stumps._trees)
    constant = HistGradientBoostingRegressor(max_iter=3).fit(X, np.full(3000, 7.0))
    np.testing.assert_allclose(constant.predict(X[:5]), 7.0)


def test_isolation_forest_finds_planted_outliers() -> None:
    rng = np.random.default_rng(0)
    inliers = rng.standard_normal((500, 3))
    outliers = rng.uniform(5, 8, size=(15, 3)) * rng.choice([-1, 1], size=(15, 3))
    X = np.vstack([inliers, outliers])
    truth = np.r_[np.zeros(500), np.ones(15)]
    ours = IsolationForest(random_state=0).fit(X)
    assert roc_auc_score(truth, -ours.score_samples(X)) > 0.99
    theirs = sk_ensemble.IsolationForest(random_state=0).fit(X)
    assert np.corrcoef(ours.score_samples(X), theirs.score_samples(X))[0, 1] > 0.9
    assert (ours.predict(outliers) == -1).all()
    with_rate = IsolationForest(contamination=0.03, random_state=0).fit(X)
    assert abs((with_rate.predict(X) == -1).mean() - 0.03) < 0.01
