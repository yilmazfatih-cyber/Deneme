"""Pipeline ve ColumnTransformer: zincirleme, parametre adları, kopyalama, Table ile kullanım."""

from __future__ import annotations

import numpy as np
import pytest

from ml_temel.onisleme import (
    ColumnTransformer,
    MinMaxScaler,
    OneHotEncoder,
    Pipeline,
    SimpleImputer,
    StandardScaler,
    TfidfVectorizer,
    make_pipeline,
)
from ml_temel.ortak import NotFittedError, Table, clone


def test_pipeline_applies_training_statistics_to_new_data() -> None:
    train = np.array([[1.0, np.nan], [3.0, 4.0], [5.0, 8.0]])
    test = np.array([[np.nan, 6.0]])
    pipeline = make_pipeline(SimpleImputer(strategy="mean"), StandardScaler())
    transformed = pipeline.fit_transform(train)
    np.testing.assert_allclose(transformed.mean(axis=0), 0.0, atol=1e-12)
    # sınama satırı EĞİTİMİN ortalamasıyla (3) doldurulur ve eğitimin istatistikleriyle ölçeklenir
    np.testing.assert_allclose(pipeline.transform(test), [[0.0, 0.0]], atol=1e-12)
    assert list(pipeline.named_steps) == ["simpleimputer", "standardscaler"]
    with pytest.raises(NotFittedError):
        make_pipeline(StandardScaler()).transform(train)


def test_pipeline_parameters_and_clone() -> None:
    pipeline = Pipeline([("doldur", SimpleImputer()), ("olcek", MinMaxScaler())])
    params = pipeline.get_params()
    assert params["doldur__strategy"] == "mean"
    assert params["olcek__feature_range"] == (0.0, 1.0)
    pipeline.set_params(doldur__strategy="median", olcek=StandardScaler(with_mean=False))
    assert pipeline.named_steps["doldur"].strategy == "median"
    assert isinstance(pipeline.named_steps["olcek"], StandardScaler)
    pipeline.fit(np.array([[1.0], [2.0], [4.0]]))
    copy = clone(pipeline)
    assert copy is not pipeline
    assert copy.named_steps["doldur"] is not pipeline.named_steps["doldur"]
    assert copy.named_steps["doldur"].strategy == "median"
    assert not hasattr(copy.named_steps["olcek"], "scale_")  # kopya eğitilmemiştir
    with pytest.raises(ValueError, match="geçersiz parametre"):
        pipeline.set_params(yok__x=1)
    with pytest.raises(ValueError, match="benzersiz"):
        Pipeline([("a", SimpleImputer()), ("a", StandardScaler())]).fit(np.zeros((2, 1)))
    with pytest.raises(TypeError, match="dönüştürücü değil"):
        Pipeline([("a", object()), ("b", StandardScaler())]).fit(np.zeros((2, 1)))


def make_table() -> Table:
    return Table(
        {
            "yaş": np.array([25.0, np.nan, 40.0, 31.0]),
            "gelir": np.array([10.0, 20.0, 30.0, 40.0]),
            "şehir": np.array(["İzmir", "Ankara", None, "İzmir"], dtype=object),
            "yorum": np.array(["kargo geç", "çok iyi", "iade", "kargo iyi"], dtype=object),
        }
    )


def test_column_transformer_on_table() -> None:
    transformer = ColumnTransformer(
        [
            ("sayisal", make_pipeline(SimpleImputer(strategy="median"), StandardScaler()),
             ["yaş", "gelir"]),
            ("kategori", OneHotEncoder(), ["şehir"]),
            ("metin", TfidfVectorizer(), "yorum"),
            ("ham", "passthrough", ["gelir"]),
        ]
    )  # fmt: skip
    table = make_table()
    out = transformer.fit_transform(table)
    names = transformer.get_feature_names_out()
    assert out.shape == (4, len(names))
    assert names[:4] == ["sayisal__yaş", "sayisal__gelir", "kategori__şehir_Ankara",
                         "kategori__şehir_İzmir"]  # fmt: skip
    assert "metin__kargo" in names
    assert names[-1] == "ham__gelir"
    np.testing.assert_allclose(out[:, -1], table["gelir"])
    np.testing.assert_allclose(out[2, 2:4], 0.0)  # eksik şehir: sıfır satırı
    np.testing.assert_allclose(transformer.transform(table), out)
    one_row = transformer.transform(table.take_rows(np.array([1])))
    np.testing.assert_allclose(one_row, out[1:2])


def test_column_transformer_on_arrays_and_errors() -> None:
    X = np.array([[1.0, 10.0, 0.0], [2.0, 20.0, 1.0], [3.0, 30.0, 0.0]])
    transformer = ColumnTransformer(
        [("olcek", StandardScaler(), [0, 1]), ("ham", "passthrough", [2])]
    )
    out = transformer.fit_transform(X)
    assert out.shape == (3, 3)
    np.testing.assert_allclose(out[:, 2], X[:, 2])
    assert transformer.get_params()["olcek__with_mean"] is True
    copy = clone(transformer).set_params(olcek__with_mean=False)
    assert transformer.transformers[0][1].with_mean is True
    assert copy.transformers[0][1].with_mean is False
    with pytest.raises(ValueError, match="Table"):
        ColumnTransformer([("a", StandardScaler(), ["yaş"])]).fit(X)
    with pytest.raises(KeyError, match="adlı sütun yok"):
        ColumnTransformer([("a", StandardScaler(), ["boy"])]).fit(make_table())
    with pytest.raises(ValueError, match="kodlayıcı"):
        ColumnTransformer([("a", "passthrough", ["şehir"])]).fit(make_table())
