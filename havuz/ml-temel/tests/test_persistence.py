"""Model dosyası: kayıtlı her sınıf kaydedilip yüklenince aynı çıktıyı verir; dosya güvenlidir."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np
import pytest

from ml_temel import klasik, onisleme, secim, zaman
from ml_temel.ortak.table import Table
from ml_temel.persistence import ModelFileError, load_model, save_model
from ml_temel.registry import SAVEABLE

RNG = np.random.default_rng(0)
X = RNG.standard_normal((80, 4))
X_MISSING = np.where(RNG.random((80, 4)) < 0.1, np.nan, X)
Y_CLASS = np.where(X[:, 0] + X[:, 1] > 0, "evet", "hayır").astype(object)
Y_REG = X @ np.array([1.0, -2.0, 0.5, 0.0]) + 0.1 * RNG.standard_normal(80)
TEXTS = ["kargo geç geldi", "İade istiyorum", "ürün çok güzel", "IĞDIR'a teslimat"] * 20
CATEGORIES = np.array(
    [["İzmir", "A"], ["Iğdır", "B"], [None, "A"], ["Şırnak", "C"]] * 20, dtype=object
)
TABLE = Table({"sayi": X[:, 0], "sehir": CATEGORIES[:, 0], "yorum": np.array(TEXTS, dtype=object)})

Case = tuple[Callable[[], Any], Callable[[Any], Any]]


def fit_predict(estimator: Any, data: Any = X, target: Any = Y_CLASS) -> Case:
    def build() -> Any:
        return estimator.fit(data, target)

    def output(model: Any) -> Any:
        return model.predict_proba(data) if hasattr(model, "predict_proba") else model.predict(data)

    return build, output


def fit_transform(estimator: Any, data: Any = X) -> Case:
    return (lambda: estimator.fit(data)), (lambda model: model.transform(data))


def splits(splitter: Any) -> Case:
    groups = np.repeat(np.arange(8), 10)

    def output(model: Any) -> Any:
        return [test.tolist() for _, test in model.split(X, np.repeat([0, 1], 40), groups)]

    return (lambda: splitter), output


def forecast(model: Any) -> Case:
    series = np.sin(np.arange(60) / 3.0) + np.arange(60) * 0.1
    return (lambda: model.fit(series)), (lambda fitted: fitted.predict(5))


CASES: dict[str, Case] = {
    "LinearRegression": fit_predict(klasik.LinearRegression(), target=Y_REG),
    "Ridge": fit_predict(klasik.Ridge(), target=Y_REG),
    "LogisticRegression": fit_predict(klasik.LogisticRegression()),
    "LinearSVC": fit_predict(klasik.LinearSVC()),
    "GaussianNB": fit_predict(klasik.GaussianNB()),
    "MultinomialNB": fit_predict(klasik.MultinomialNB(), data=np.abs(X)),
    "KNeighborsClassifier": fit_predict(klasik.KNeighborsClassifier(3)),
    "KNeighborsRegressor": fit_predict(klasik.KNeighborsRegressor(3), target=Y_REG),
    "KMeans": fit_transform(klasik.KMeans(3, random_state=0)),
    "PCA": fit_transform(klasik.PCA(2)),
    "DecisionTreeClassifier": fit_predict(klasik.DecisionTreeClassifier(max_depth=3)),
    "DecisionTreeRegressor": fit_predict(klasik.DecisionTreeRegressor(max_depth=3), target=Y_REG),
    "RandomForestClassifier": fit_predict(klasik.RandomForestClassifier(5, random_state=0)),
    "RandomForestRegressor": fit_predict(
        klasik.RandomForestRegressor(5, random_state=0), target=Y_REG
    ),
    "HistGradientBoostingClassifier": fit_predict(
        klasik.HistGradientBoostingClassifier(max_iter=5), data=X_MISSING
    ),
    "HistGradientBoostingRegressor": fit_predict(
        klasik.HistGradientBoostingRegressor(max_iter=5), data=X_MISSING, target=Y_REG
    ),
    "CalibratedClassifierCV": fit_predict(
        klasik.CalibratedClassifierCV(klasik.LogisticRegression(), "isotonic", cv=3)
    ),
    "IsotonicRegression": fit_predict(klasik.IsotonicRegression(), data=X[:, 0], target=Y_REG),
    "SigmoidCalibration": fit_predict(
        klasik.SigmoidCalibration(), data=X[:, 0], target=(Y_REG > 0).astype(int)
    ),
    "IsolationForest": (
        lambda: klasik.IsolationForest(10, random_state=0).fit(X),
        lambda model: model.score_samples(X),
    ),
    "DummyClassifier": fit_predict(klasik.DummyClassifier()),
    "DummyRegressor": fit_predict(klasik.DummyRegressor(), target=Y_REG),
    "StandardScaler": fit_transform(onisleme.StandardScaler()),
    "MinMaxScaler": fit_transform(onisleme.MinMaxScaler()),
    "SimpleImputer": fit_transform(onisleme.SimpleImputer(add_indicator=True), X_MISSING),
    "OneHotEncoder": fit_transform(onisleme.OneHotEncoder(min_frequency=25), CATEGORIES),
    "OrdinalEncoder": fit_transform(onisleme.OrdinalEncoder(), CATEGORIES),
    "CountVectorizer": fit_transform(onisleme.CountVectorizer(ngram_range=(1, 2)), TEXTS),
    "TfidfVectorizer": fit_transform(
        onisleme.TfidfVectorizer(stop_words=onisleme.TURKISH_STOP_WORDS), TEXTS
    ),
    "HashingVectorizer": fit_transform(onisleme.HashingVectorizer(n_features=32), TEXTS),
    "Pipeline": fit_predict(
        onisleme.make_pipeline(onisleme.StandardScaler(), klasik.LogisticRegression())
    ),
    "ColumnTransformer": fit_transform(
        onisleme.ColumnTransformer(
            [
                ("s", onisleme.StandardScaler(), ["sayi"]),
                ("k", onisleme.OneHotEncoder(), ["sehir"]),
                ("m", onisleme.TfidfVectorizer(), "yorum"),
            ]
        ),
        TABLE,
    ),
    "KFold": splits(secim.KFold(4, shuffle=True, random_state=0)),
    "StratifiedKFold": splits(secim.StratifiedKFold(4)),
    "GroupKFold": splits(secim.GroupKFold(4)),
    "TimeSeriesSplit": splits(secim.TimeSeriesSplit(3)),
    "PredefinedSplits": splits(secim.PredefinedSplits([(np.arange(40), np.arange(40, 80))])),
    "GridSearchCV": fit_predict(
        secim.GridSearchCV(klasik.Ridge(), {"alpha": [0.1, 10.0]}, cv=3), target=Y_REG
    ),
    "SeasonalNaive": forecast(zaman.SeasonalNaive(4)),
    "ExponentialSmoothing": forecast(zaman.ExponentialSmoothing(trend=True)),
}
INTERNAL = {
    "Tree",
    "BinMapper",
    "CalibratedPair",
    "TabularModel",
}  # başka nesnelerin içinde sınanır


def test_every_registered_class_has_a_round_trip_case() -> None:
    missing = sorted(set(SAVEABLE) - set(CASES) - INTERNAL)
    assert not missing, f"tests/test_persistence.py CASES sözlüğüne ekleyin: {missing}"


@pytest.mark.parametrize("name", sorted(CASES))
def test_round_trip_gives_identical_output(name: str, tmp_path: Path) -> None:
    build, output = CASES[name]
    model = build()
    path = save_model(model, tmp_path / "model", metadata={"not": "İğdır ılık", "sayi": np.nan})
    assert path.suffix == ".npz"
    loaded, extra = load_model(path)
    assert type(loaded) is type(model)
    assert extra["not"] == "İğdır ılık"
    assert np.isnan(extra["sayi"])
    expected, actual = output(model), output(loaded)
    if isinstance(expected, list):
        assert actual == expected
    else:
        np.testing.assert_array_equal(np.asarray(actual), np.asarray(expected))
    assert loaded.get_params().keys() == model.get_params().keys()


def test_unregistered_objects_and_functions_are_refused(tmp_path: Path) -> None:
    class Foreign:
        pass

    with pytest.raises(ModelFileError, match="desteklenmiyor"):
        save_model(Foreign(), tmp_path / "a.npz")
    with pytest.raises(ModelFileError, match="tokenizer"):
        save_model(onisleme.CountVectorizer(tokenizer=str.split).fit(TEXTS), tmp_path / "b.npz")


def write_raw(path: Path, meta: dict[str, Any], **arrays: Any) -> Path:
    np.savez(path, __meta__=np.array(json.dumps(meta)), **arrays)
    return path


def test_loading_refuses_unknown_classes_and_strange_files(tmp_path: Path) -> None:
    meta = {"bicim": "ml-temel-model", "surum": 1, "ek": {"__sozluk__": {}}}
    evil = dict(meta, nesne={"__sinif__": "os.system", "alanlar": {}})
    with pytest.raises(ModelFileError, match="bilinmeyen sınıf"):
        load_model(write_raw(tmp_path / "kotu.npz", evil))
    newer = dict(meta, surum=99, nesne=None)
    with pytest.raises(ModelFileError, match="daha yeni"):
        load_model(write_raw(tmp_path / "yeni.npz", newer))
    np.savez(tmp_path / "duz.npz", x=np.arange(3))
    with pytest.raises(ModelFileError, match="model bilgisi yok"):
        load_model(tmp_path / "duz.npz")
    (tmp_path / "metin.npz").write_text("merhaba")
    with pytest.raises(ModelFileError, match="değil"):
        load_model(tmp_path / "metin.npz")
    pickled = dict(meta, nesne={"__dizi__": "a0"})
    path = write_raw(tmp_path / "pickle.npz", pickled, a0=np.array([{"x": 1}], dtype=object))
    with pytest.raises(ValueError, match="allow_pickle"):  # pickle'lı dizi asla açılmaz
        load_model(path)
    with pytest.raises(ModelFileError, match="bulunamadı"):
        load_model(tmp_path / "yok.npz")
