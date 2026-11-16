"""Zaman serisi tabanları (bilinen çözümler), geriye dönük sınama ve sentetik veri üreteçleri."""

from __future__ import annotations

from typing import Self

import numpy as np
import pytest

from ml_temel import veri
from ml_temel.zaman import ExponentialSmoothing, SeasonalNaive, backtest


def test_seasonal_naive_repeats_the_last_season() -> None:
    model = SeasonalNaive(season_length=3).fit([1.0, 2.0, 3.0, 4.0, 5.0, 6.0])
    np.testing.assert_allclose(model.predict(7), [4, 5, 6, 4, 5, 6, 4])
    np.testing.assert_allclose(SeasonalNaive().fit([5.0, 7.0]).predict(2), [7, 7])
    with pytest.raises(ValueError, match="eksik"):
        SeasonalNaive().fit([1.0, np.nan])


def test_exponential_smoothing_known_cases() -> None:
    np.testing.assert_allclose(ExponentialSmoothing().fit(np.full(20, 4.2)).predict(3), 4.2)
    simple = ExponentialSmoothing(alpha=0.5).fit([10.0, 20.0, 10.0])
    # düzey: 10 → 0.5·20 + 0.5·10 = 15 → 0.5·10 + 0.5·15 = 12.5
    np.testing.assert_allclose(simple.predict(2), [12.5, 12.5])
    line = 3.0 + 2.0 * np.arange(30)
    holt = ExponentialSmoothing(trend=True).fit(line)
    np.testing.assert_allclose(holt.predict(3), [63.0, 65.0, 67.0], atol=1e-6)
    pattern = np.tile([0.0, 5.0, 1.0, 9.0], 10) + 100.0
    seasonal = ExponentialSmoothing(seasonal_periods=4).fit(pattern)
    np.testing.assert_allclose(seasonal.predict(4), [100, 105, 101, 109], atol=1e-6)


def test_backtest_never_shows_the_future() -> None:
    seen_lengths: list[int] = []

    class Spy:
        def fit(self, y: np.ndarray) -> Self:
            seen_lengths.append(len(y))
            self.last = float(y[-1])
            return self

        def predict(self, horizon: int) -> np.ndarray:
            return np.full(horizon, self.last)

    series = np.arange(20.0)
    result = backtest(Spy, series, initial=10, horizon=3, step=2)
    np.testing.assert_array_equal(result.origins, [10, 12, 14, 16])
    assert seen_lengths == [10, 12, 14, 16]  # her başlangıçta yalnız geçmiş
    np.testing.assert_allclose(result.errors, -np.tile([1.0, 2.0, 3.0], (4, 1)))
    assert result.mae == pytest.approx(2.0)
    np.testing.assert_allclose(result.mae_by_horizon, [1.0, 2.0, 3.0])
    with pytest.raises(ValueError, match="kısa"):
        backtest(Spy, series, initial=19, horizon=3)


def test_holt_winters_beats_naive_on_seasonal_trend() -> None:
    rng = np.random.default_rng(0)
    t = np.arange(160)
    y = 10 + 0.05 * t + 3 * np.sin(2 * np.pi * t / 7) + 0.3 * rng.standard_normal(160)
    naive = backtest(lambda: SeasonalNaive(1), y, initial=100, horizon=7, step=7)
    winters = backtest(
        lambda: ExponentialSmoothing(trend=True, seasonal_periods=7),
        y,
        initial=100,
        horizon=7,
        step=7,
    )
    assert winters.mae < 0.5 * naive.mae


def test_generators_are_seeded_and_shaped() -> None:
    a, b = veri.make_moons(100, random_state=1), veri.make_moons(100, random_state=1)
    np.testing.assert_array_equal(a[0], b[0])
    assert a[0].shape == (100, 2)
    assert set(a[1].tolist()) == {0, 1}
    X, y = veri.make_blobs(90, centers=3, n_features=4, random_state=0)
    assert X.shape == (90, 4)
    assert y.max() == 2
    X, y, coef = veri.make_regression(50, 3, noise=0.0, random_state=0)
    np.testing.assert_allclose(X @ coef, y)
    images, labels = veri.make_shapes(30, size=10, random_state=0)
    assert images.shape == (30, 1, 10, 10)
    assert set(labels.tolist()) <= {0, 1, 2}
    churn = veri.make_churn_table(300, random_state=0)
    assert churn.shape == (300, 13)
    assert set(churn["kayip"].tolist()) == {"evet", "hayır"}
    assert np.isnan(churn["memnuniyet"]).any()
    X, y = veri.make_classification(200, 6, n_informative=2, n_classes=3, random_state=0)
    assert X.shape == (200, 6)
    assert len(np.unique(y)) == 3
    circles = veri.make_circles(40, random_state=0)
    assert circles[0].shape == (40, 2)
