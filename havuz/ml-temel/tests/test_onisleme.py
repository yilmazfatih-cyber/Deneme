"""Ölçekleyici, doldurucu ve kodlayıcılar: scikit-learn ile karşılaştırma + uç durumlar."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.onisleme import (
    MinMaxScaler,
    OneHotEncoder,
    OrdinalEncoder,
    SimpleImputer,
    StandardScaler,
)
from ml_temel.ortak import NotFittedError

skp = pytest.importorskip("sklearn.preprocessing", reason="karşılaştırma için scikit-learn gerekir")


@pytest.fixture
def numeric() -> np.ndarray:
    rng = np.random.default_rng(0)
    X = rng.standard_normal((60, 4)) * [1.0, 10.0, 0.1, 5.0] + [0.0, 50.0, -3.0, 7.0]
    X[:, 3] = 7.0  # sabit sütun
    return X


def test_scalers_match_sklearn(numeric: np.ndarray) -> None:
    train, test = numeric[:40], numeric[40:]
    for ours, theirs in (
        (StandardScaler(), skp.StandardScaler()),
        (MinMaxScaler(feature_range=(-1.0, 2.0)), skp.MinMaxScaler(feature_range=(-1.0, 2.0))),
    ):
        np.testing.assert_allclose(ours.fit_transform(train), theirs.fit_transform(train))
        transformed = ours.transform(test)
        np.testing.assert_allclose(transformed, theirs.transform(test))
        np.testing.assert_allclose(ours.inverse_transform(transformed), test)


def test_scaler_learns_only_from_fit_data_and_tolerates_nan(numeric: np.ndarray) -> None:
    scaler = StandardScaler().fit(numeric[:40])
    np.testing.assert_allclose(scaler.mean_, numeric[:40].mean(axis=0))
    assert scaler.scale_[3] == 1.0  # sabit sütunda sıfıra bölme yok
    with_nan = numeric.copy()
    with_nan[0, 0] = np.nan
    out = StandardScaler().fit_transform(with_nan)
    assert np.isnan(out[0, 0])
    np.testing.assert_allclose(np.nanmean(out[:, 0]), 0.0, atol=1e-12)
    assert np.isfinite(StandardScaler().fit_transform(np.full((3, 1), np.nan)[:, :0])).all()
    with pytest.raises(NotFittedError, match="fit"):
        StandardScaler().transform(numeric)
    with pytest.raises(ValueError, match="sütunla eğitildi"):
        scaler.transform(numeric[:, :2])
    with pytest.raises(ValueError, match="2 boyutlu"):
        scaler.fit(numeric[:, 0])


@pytest.mark.parametrize("strategy", ["mean", "median", "most_frequent", "constant"])
def test_imputer_matches_sklearn_on_numeric_data(strategy: str) -> None:
    sk_impute = pytest.importorskip("sklearn.impute")
    rng = np.random.default_rng(1)
    X = np.round(rng.standard_normal((50, 3)) * 3)
    X[rng.random((50, 3)) < 0.2] = np.nan
    kwargs = {"fill_value": -1.0} if strategy == "constant" else {}
    ours = SimpleImputer(strategy=strategy, add_indicator=True, **kwargs)
    theirs = sk_impute.SimpleImputer(strategy=strategy, add_indicator=True, **kwargs)
    np.testing.assert_allclose(ours.fit_transform(X[:35]), theirs.fit_transform(X[:35]))
    np.testing.assert_allclose(ours.transform(X[35:]), theirs.transform(X[35:]))


def test_imputer_on_categories_and_empty_columns() -> None:
    X = np.array([["a", None], ["b", None], ["a", None], [None, None]], dtype=object)
    filled = SimpleImputer(strategy="most_frequent").fit_transform(X)
    assert filled[:, 0].tolist() == ["a", "b", "a", "a"]
    assert filled[:, 1].tolist() == ["(eksik)"] * 4  # tümü eksik sütun atılmaz
    constant = SimpleImputer(strategy="constant", fill_value="yok").fit_transform(X)
    assert constant[3].tolist() == ["yok", "yok"]
    all_nan = SimpleImputer().fit_transform(np.array([[np.nan, 1.0], [np.nan, 3.0]]))
    np.testing.assert_allclose(all_nan, [[0.0, 1.0], [0.0, 3.0]])
    with pytest.raises(ValueError, match="most_frequent"):
        SimpleImputer(strategy="mean").fit(X)
    with pytest.raises(ValueError, match="strategy"):
        SimpleImputer(strategy="ortalama").fit(np.zeros((2, 2)))


def test_one_hot_matches_sklearn_and_ignores_unknown() -> None:
    X = np.array([["İzmir", "A"], ["Ankara", "B"], ["İzmir", "B"], ["Iğdır", "A"]], dtype=object)
    new = np.array([["İzmir", "A"], ["Bursa", "B"]], dtype=object)
    ours = OneHotEncoder().fit(X)
    theirs = skp.OneHotEncoder(handle_unknown="ignore", sparse_output=False).fit(X)
    np.testing.assert_array_equal(ours.transform(X), theirs.transform(X))
    np.testing.assert_array_equal(ours.transform(new), theirs.transform(new))
    assert ours.get_feature_names_out(["şehir", "sınıf"]) == list(
        theirs.get_feature_names_out(["şehir", "sınıf"])
    )
    assert ours.transform(new)[1, :3].sum() == 0.0  # bilinmeyen şehir: sıfır satırı
    with pytest.raises(ValueError, match="görülmemiş kategori"):
        OneHotEncoder(handle_unknown="error").fit(X).transform(new)


def test_one_hot_missing_infrequent_and_drop() -> None:
    column = np.array(["a"] * 6 + ["b"] * 3 + ["c", "d", None], dtype=object).reshape(-1, 1)
    grouped = OneHotEncoder(min_frequency=2).fit(column)
    assert grouped.get_feature_names_out(["x"]) == ["x_a", "x_b", "x_(diğer)"]
    out = grouped.transform(column)
    np.testing.assert_array_equal(out.sum(axis=0), [6, 3, 2])
    assert out[-1].sum() == 0.0  # eksik değer hiçbir kategoriye girmez
    capped = OneHotEncoder(max_categories=2).fit(column)
    assert capped.get_feature_names_out(["x"]) == ["x_a", "x_(diğer)"]
    binary = np.array([["e"], ["h"], ["e"]], dtype=object)
    assert OneHotEncoder(drop="if_binary").fit_transform(binary).ravel().tolist() == [0, 1, 0]
    assert OneHotEncoder(drop="first").fit(column).get_feature_names_out(["x"]) == [
        "x_b",
        "x_c",
        "x_d",
    ]
    numeric = OneHotEncoder().fit_transform(np.array([[1.0], [2.0], [np.nan], [1.0]]))
    np.testing.assert_array_equal(numeric, [[1, 0], [0, 1], [0, 0], [1, 0]])


def test_ordinal_encoder_matches_sklearn_and_round_trips() -> None:
    X = np.array([["kış", "x"], ["yaz", "y"], ["bahar", "x"], ["yaz", None]], dtype=object)
    new = np.array([["yaz", "x"], ["güz", "y"]], dtype=object)
    ours = OrdinalEncoder().fit(X)
    theirs = skp.OrdinalEncoder(handle_unknown="use_encoded_value", unknown_value=-1).fit(X[:3])
    np.testing.assert_array_equal(ours.transform(X[:3]), theirs.transform(X[:3]))
    encoded_new = ours.transform(new)
    np.testing.assert_array_equal(encoded_new, [[2.0, 0.0], [-1.0, 1.0]])
    assert np.isnan(ours.transform(X)[3, 1])  # eksik → NaN
    decoded = ours.inverse_transform(encoded_new)
    assert decoded.tolist() == [["yaz", "x"], [None, "y"]]
    with pytest.raises(ValueError, match="görülmemiş"):
        OrdinalEncoder(handle_unknown="error").fit(X).transform(new)
