"""Ölçütler: scikit-learn ile karşılaştırma + elle hesaplanmış küçük örnekler + önyükleme."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel import olcut

skm = pytest.importorskip("sklearn.metrics", reason="karşılaştırma için scikit-learn gerekir")


@pytest.fixture
def binary() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(0)
    y = rng.integers(0, 2, size=400)
    score = np.round(np.clip(0.35 * y + rng.random(400) * 0.7, 0, 1), 2)  # yuvarlama: eşit skorlar
    return y, score, (score > 0.5).astype(int)


@pytest.fixture
def multiclass() -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rng = np.random.default_rng(1)
    labels = np.array(["elma", "armut", "çilek", "ıhlamur"])
    y = labels[rng.integers(0, 4, size=300)]
    pred = np.where(rng.random(300) < 0.6, y, labels[rng.integers(0, 4, size=300)])
    proba = rng.dirichlet(np.ones(4), size=300)
    return y, pred, proba


def test_classification_metrics_match_sklearn_binary(binary: tuple) -> None:
    y, _, pred = binary
    assert olcut.accuracy_score(y, pred) == pytest.approx(skm.accuracy_score(y, pred))
    np.testing.assert_array_equal(olcut.confusion_matrix(y, pred), skm.confusion_matrix(y, pred))
    for name in ("precision_score", "recall_score", "f1_score"):
        ours, theirs = getattr(olcut, name), getattr(skm, name)
        assert ours(y, pred) == pytest.approx(theirs(y, pred))
        assert ours(y, pred, pos_label=0) == pytest.approx(theirs(y, pred, pos_label=0))
    assert olcut.balanced_accuracy_score(y, pred) == pytest.approx(
        skm.balanced_accuracy_score(y, pred)
    )


@pytest.mark.parametrize("average", ["macro", "micro", "weighted"])
def test_classification_metrics_match_sklearn_multiclass(multiclass: tuple, average: str) -> None:
    y, pred, _ = multiclass
    for name in ("precision_score", "recall_score", "f1_score"):
        ours = getattr(olcut, name)(y, pred, average=average)
        theirs = getattr(skm, name)(y, pred, average=average)
        assert ours == pytest.approx(theirs)
    np.testing.assert_array_equal(olcut.confusion_matrix(y, pred), skm.confusion_matrix(y, pred))
    ours_all = olcut.precision_recall_fscore_support(y, pred)
    theirs_all = skm.precision_recall_fscore_support(y, pred)
    for a, b in zip(ours_all, theirs_all, strict=True):
        np.testing.assert_allclose(a, b)


def test_confusion_matrix_by_hand_and_label_order() -> None:
    y = ["kedi", "kedi", "köpek", "köpek", "köpek"]
    pred = ["kedi", "köpek", "köpek", "köpek", "kedi"]
    np.testing.assert_array_equal(olcut.confusion_matrix(y, pred), [[1, 1], [1, 2]])
    np.testing.assert_array_equal(
        olcut.confusion_matrix(y, pred, labels=["köpek", "kedi"]), [[2, 1], [1, 1]]
    )
    assert olcut.precision_score(y, pred, pos_label="köpek") == pytest.approx(2 / 3)
    assert olcut.recall_score(y, pred, pos_label="kedi") == pytest.approx(1 / 2)


def test_binary_average_errors_are_helpful(multiclass: tuple) -> None:
    y, pred, _ = multiclass
    with pytest.raises(ValueError, match="pos_label"):
        olcut.f1_score(y, pred)
    with pytest.raises(ValueError, match="iki sınıflı"):
        olcut.f1_score(y, pred, pos_label="elma")
    with pytest.raises(ValueError, match="satır sayıları"):
        olcut.accuracy_score([1, 0], [1])
    assert olcut.precision_score([0, 0], [0, 0], pos_label=0) == 1.0
    assert olcut.precision_score([0, 1], [0, 0]) == 0.0  # hiç pozitif tahmin yok → zero_division


def test_ranking_metrics_match_sklearn(binary: tuple) -> None:
    y, score, _ = binary
    assert olcut.roc_auc_score(y, score) == pytest.approx(skm.roc_auc_score(y, score))
    assert olcut.average_precision_score(y, score) == pytest.approx(
        skm.average_precision_score(y, score)
    )
    for ours, theirs in zip(
        olcut.roc_curve(y, score), skm.roc_curve(y, score, drop_intermediate=False), strict=True
    ):
        np.testing.assert_allclose(ours, theirs)
    for ours, theirs in zip(
        olcut.precision_recall_curve(y, score), skm.precision_recall_curve(y, score), strict=True
    ):
        np.testing.assert_allclose(ours, theirs)
    labels = np.where(y == 1, "evet", "hayır")
    assert olcut.roc_auc_score(labels, score, pos_label="evet") == pytest.approx(
        skm.roc_auc_score(y, score)
    )


def test_roc_auc_known_values_and_multiclass(multiclass: tuple) -> None:
    assert olcut.roc_auc_score([0, 0, 1, 1], [0.1, 0.2, 0.8, 0.9]) == 1.0
    assert olcut.roc_auc_score([0, 0, 1, 1], [0.9, 0.8, 0.2, 0.1]) == 0.0
    assert olcut.roc_auc_score([0, 1, 0, 1], [0.5, 0.5, 0.5, 0.5]) == 0.5  # hepsi eşit skor
    y, _, proba = multiclass
    assert olcut.roc_auc_score(y, proba) == pytest.approx(
        skm.roc_auc_score(y, proba, multi_class="ovr", average="macro")
    )
    with pytest.raises(ValueError, match="tek sınıf"):
        olcut.roc_auc_score([1, 1, 1], [0.2, 0.5, 0.9])


def test_probability_metrics_match_sklearn(binary: tuple, multiclass: tuple) -> None:
    y, score, _ = binary
    assert olcut.log_loss(y, score) == pytest.approx(skm.log_loss(y, score))
    assert olcut.brier_score_loss(y, score) == pytest.approx(skm.brier_score_loss(y, score))
    ym, _, proba = multiclass
    assert olcut.log_loss(ym, proba) == pytest.approx(skm.log_loss(ym, proba))
    assert np.isfinite(olcut.log_loss([0, 1], [1.0, 0.0]))  # kırpma: log(0) yok
    sk_curve = pytest.importorskip("sklearn.calibration").calibration_curve
    for strategy in ("uniform", "quantile"):
        ours = olcut.calibration_curve(y, score, n_bins=8, strategy=strategy)
        theirs = sk_curve(y, score, n_bins=8, strategy=strategy)
        np.testing.assert_allclose(ours[0], theirs[0])
        np.testing.assert_allclose(ours[1], theirs[1])


def test_expected_calibration_error_by_hand() -> None:
    y = [0, 0, 1, 1, 1, 0, 1, 1]
    prob = [0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.9]
    # iki kutu: tahmin 0.1 → gerçek 0.5 (fark 0.4); tahmin 0.9 → gerçek 0.75 (fark 0.15)
    assert olcut.expected_calibration_error(y, prob, n_bins=10) == pytest.approx(0.275)
    perfect_prob = np.repeat([0.25, 0.75], 400)
    perfect_y = np.concatenate([np.repeat([1, 0], [100, 300]), np.repeat([1, 0], [300, 100])])
    assert olcut.expected_calibration_error(perfect_y, perfect_prob) == pytest.approx(0.0)
    with pytest.raises(ValueError, match="0 ile 1"):
        olcut.brier_score_loss([0, 1], [0.2, 1.4])


def test_regression_metrics_match_sklearn() -> None:
    rng = np.random.default_rng(2)
    y = rng.standard_normal(200) * 10 + 50
    pred = y + rng.standard_normal(200) * 3
    assert olcut.mean_squared_error(y, pred) == pytest.approx(skm.mean_squared_error(y, pred))
    assert olcut.root_mean_squared_error(y, pred) == pytest.approx(
        skm.root_mean_squared_error(y, pred)
    )
    assert olcut.mean_absolute_error(y, pred) == pytest.approx(skm.mean_absolute_error(y, pred))
    assert olcut.r2_score(y, pred) == pytest.approx(skm.r2_score(y, pred))
    assert olcut.mean_absolute_percentage_error(y, pred) == pytest.approx(
        skm.mean_absolute_percentage_error(y, pred)
    )
    assert olcut.r2_score([3.0, 3.0], [3.0, 3.0]) == 1.0
    assert olcut.r2_score([3.0, 3.0], [1.0, 2.0]) == 0.0
    assert olcut.r2_score([1.0, 2.0, 3.0], [2.0, 2.0, 2.0]) == pytest.approx(0.0)
    with pytest.raises(ValueError, match="NaN"):
        olcut.mean_absolute_error([1.0, np.nan], [1.0, 2.0])


def test_bootstrap_ci_is_seeded_and_brackets_the_estimate(binary: tuple) -> None:
    y, score, _ = binary
    first = olcut.bootstrap_ci(olcut.roc_auc_score, y, score, n_resamples=300, stratify=True)
    again = olcut.bootstrap_ci(olcut.roc_auc_score, y, score, n_resamples=300, stratify=True)
    assert first == again
    assert first.low < first.estimate < first.high
    assert first.estimate == pytest.approx(olcut.roc_auc_score(y, score))
    assert "GA" in str(first)
    small = olcut.bootstrap_ci(olcut.roc_auc_score, y[:60], score[:60], n_resamples=300)
    assert small.high - small.low > first.high - first.low  # az veri → geniş aralık


def test_bootstrap_ci_for_difference_and_groups() -> None:
    rng = np.random.default_rng(3)
    y = rng.standard_normal(300)
    good, bad = y + rng.standard_normal(300) * 0.5, y + rng.standard_normal(300) * 2.0

    def gain(true: np.ndarray, a: np.ndarray, b: np.ndarray) -> float:
        return olcut.mean_absolute_error(true, b) - olcut.mean_absolute_error(true, a)

    result = olcut.bootstrap_ci(gain, y, good, bad, n_resamples=300)
    assert result.low > 0  # iyi model güvenle daha iyi

    groups = np.repeat(np.arange(30), 10)
    group_error = np.repeat(rng.standard_normal(30) * 3.0, 10)  # hata grup içinde ortak
    pred = y + group_error
    naive = olcut.bootstrap_ci(olcut.mean_absolute_error, y, pred, n_resamples=300)
    clustered = olcut.bootstrap_ci(
        olcut.mean_absolute_error, y, pred, n_resamples=300, groups=groups
    )
    assert clustered.high - clustered.low > 1.5 * (naive.high - naive.low)
    with pytest.raises(ValueError, match="birlikte"):
        olcut.bootstrap_ci(olcut.accuracy_score, [0, 1], [0, 1], stratify=True, groups=[0, 1])


def test_bootstrap_reports_undefined_metric() -> None:
    with pytest.raises(ValueError, match="tek sınıf"):
        olcut.bootstrap_ci(olcut.roc_auc_score, [1, 1, 1, 1], [0.1, 0.2, 0.3, 0.4])


def test_classification_report_mentions_every_class(multiclass: tuple) -> None:
    y, pred, _ = multiclass
    report = olcut.classification_report(y, pred)
    for label in ("elma", "armut", "çilek", "ıhlamur", "makro ort.", "doğruluk"):
        assert label in report


def test_scorer_registry_follows_greater_is_better() -> None:
    class Fixed:
        classes_ = np.array([0, 1])

        def predict(self, X: np.ndarray) -> np.ndarray:
            return (X[:, 0] > 0.5).astype(int)

        def predict_proba(self, X: np.ndarray) -> np.ndarray:
            return np.column_stack([1 - X[:, 0], X[:, 0]])

    X = np.array([[0.1], [0.4], [0.6], [0.9]])
    y = np.array([0, 0, 1, 1])
    assert olcut.get_scorer("accuracy")(Fixed(), X, y) == 1.0
    assert olcut.get_scorer("roc_auc")(Fixed(), X, y) == 1.0
    assert olcut.get_scorer("neg_log_loss")(Fixed(), X, y) < 0
    assert olcut.get_scorer("neg_brier_score")(Fixed(), X, y) == pytest.approx(-0.085)
    with pytest.raises(ValueError, match="Bilinmeyen ölçüt"):
        olcut.get_scorer("dogruluk")
