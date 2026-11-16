"""Aday modeller: her biri kendi ön işlemesiyle birlikte TEK bir `Pipeline`.

Ön işleme hattın içinde olduğu için çapraz doğrulamada her katta yalnız o katın eğitim
satırlarıyla uydurulur (sızıntı yok). Aileye göre ön işleme:

  dogrusal  sayısal: ortanca ile doldur (+ "eksikti" sütunu) → ölçekle; kategori: tek-sıcak
            (seyrekler "(diğer)"de); metin: TF-IDF → lojistik regresyon / Ridge
  orman     sayısal: ortanca ile doldur; kategori: sıralı kod; metin: küçük TF-IDF → rastgele orman
  artirma   sayısal: olduğu gibi (eksikleri model kendisi işler); kategori: sıralı kod (eksik =
            NaN); metin: küçük TF-IDF → histogram gradyan artırma (erken durdurmalı)
Taban çizgisi: çoğunluk sınıfı oranları / ortalama.
Genişletme: yeni bir aday = `CANDIDATES` sözlüğüne (ad → kurucu fonksiyon) bir satır.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from ml_temel.klasik import (
    DummyClassifier,
    DummyRegressor,
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    LogisticRegression,
    RandomForestClassifier,
    RandomForestRegressor,
    Ridge,
)
from ml_temel.onisleme import (
    ColumnTransformer,
    OneHotEncoder,
    OrdinalEncoder,
    Pipeline,
    SimpleImputer,
    StandardScaler,
    TfidfVectorizer,
    make_pipeline,
)


@dataclass(frozen=True)
class FeatureColumns:
    """Hazırlanmış tablodaki model girdileri, türlerine göre."""

    numeric: list[str]
    categorical: list[str]
    text: list[str]


@dataclass(frozen=True)
class BuildOptions:
    task: str
    fast: bool
    random_state: int
    n_rows: int = 0  # eğitim satırı sayısı: büyük veride orman ağaçları küçültülür


BIG_DATA = 20_000  # bu kadar satırdan sonra ormanın her ağacı en çok bu kadar satırla kurulur


def _text_parts(columns: FeatureColumns, max_features: int) -> list[tuple[str, Any, Any]]:
    return [
        (f"metin{position}", TfidfVectorizer(max_features=max_features, sublinear_tf=True), name)
        for position, name in enumerate(columns.text)
    ]


def _linear(columns: FeatureColumns, options: BuildOptions) -> Pipeline:
    parts: list[tuple[str, Any, Any]] = []
    if columns.numeric:
        numeric = make_pipeline(
            SimpleImputer(strategy="median", add_indicator=True), StandardScaler()
        )
        parts.append(("sayisal", numeric, columns.numeric))
    if columns.categorical:
        encoder = OneHotEncoder(min_frequency=5, max_categories=30)
        parts.append(
            (
                "kategori",
                make_pipeline(SimpleImputer(strategy="constant"), encoder),
                columns.categorical,
            )
        )
    parts += _text_parts(columns, 2000)
    model: Any = (
        LogisticRegression(C=1.0, max_iter=3000)
        if options.task == "siniflandirma"
        else Ridge(alpha=1.0)
    )
    return Pipeline([("hazirlik", ColumnTransformer(parts)), ("model", model)])


def _forest(columns: FeatureColumns, options: BuildOptions) -> Pipeline:
    parts: list[tuple[str, Any, Any]] = []
    if columns.numeric:
        parts.append(("sayisal", SimpleImputer(strategy="median"), columns.numeric))
    if columns.categorical:
        encoder = make_pipeline(SimpleImputer(strategy="constant"), OrdinalEncoder())
        parts.append(("kategori", encoder, columns.categorical))
    parts += _text_parts(columns, 100)
    trees = 40 if options.fast else 150
    big = options.n_rows > BIG_DATA  # büyük veride süre: bootstrap boyu ve yaprak boyu sınırlanır
    leaf = 5 if big else 2
    share = BIG_DATA / options.n_rows if big else None
    seed = options.random_state
    model: Any
    if options.task == "siniflandirma":
        model = RandomForestClassifier(
            trees, min_samples_leaf=leaf, max_samples=share, random_state=seed
        )
    else:
        model = RandomForestRegressor(
            trees, min_samples_leaf=leaf, max_features=0.5, max_samples=share, random_state=seed
        )
    return Pipeline([("hazirlik", ColumnTransformer(parts)), ("model", model)])


def _boosting(columns: FeatureColumns, options: BuildOptions) -> Pipeline:
    parts: list[tuple[str, Any, Any]] = []
    if columns.numeric:
        parts.append(("sayisal", "passthrough", columns.numeric))
    if columns.categorical:
        parts.append(("kategori", OrdinalEncoder(), columns.categorical))
    parts += _text_parts(columns, 100)
    kind: Any = (
        HistGradientBoostingClassifier
        if options.task == "siniflandirma"
        else HistGradientBoostingRegressor
    )
    model = kind(  # küçük veride aşırı öğrenmesin: erken durdurma + küçük ağaçlar + L2
        max_iter=100 if options.fast else 300,
        learning_rate=0.06,
        max_leaf_nodes=15,
        l2_regularization=1.0,
        early_stopping=True,
        validation_fraction=0.15,
        n_iter_no_change=15,
        random_state=options.random_state,
    )
    return Pipeline([("hazirlik", ColumnTransformer(parts)), ("model", model)])


CANDIDATES: dict[str, Callable[[FeatureColumns, BuildOptions], Pipeline]] = {
    "dogrusal": _linear,
    "orman": _forest,
    "artirma": _boosting,
    # YENİ ADAY BURAYA
}


def baseline(task: str) -> Any:
    """Hiçbir şey öğrenmeyen karşılaştırma modeli."""
    return DummyClassifier(strategy="prior") if task == "siniflandirma" else DummyRegressor()
