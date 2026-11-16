"""ColumnTransformer: farklı sütunlara farklı ön işleme uygular ve sonuçları yan yana dizer.

Fikir: gerçek tablolarda sütun türleri karışıktır. Sayısal sütunlar doldurulup ölçeklenir,
kategori sütunları tek-sıcak kodlanır, metin sütunu TF-IDF'e girer:

    ColumnTransformer([
        ("sayisal", make_pipeline(SimpleImputer(strategy="median"), StandardScaler()), ["yas"]),
        ("kategori", OneHotEncoder(), ["sehir"]),
        ("metin", TfidfVectorizer(max_features=500), "yorum"),   # tek ad → 1 boyutlu sütun
    ])

Girdi: `Table` (sütunlar adla seçilir) ya da 2 boyutlu numpy dizisi (sütunlar numarayla seçilir).
Sütunlar LİSTE olarak verilirse dönüştürücü 2 boyutlu matris alır; TEK ad/numara verilirse
1 boyutlu dizi alır (metin vektörleyiciler bunu ister). Çıktı tek bir float64 matristir.
Genişletme: yeni bir seçim türü için `_select` fonksiyonuna dal ekleyin.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Self

import numpy as np

from ml_temel.onisleme.pipeline import NamedSteps
from ml_temel.ortak.table import Table
from ml_temel.ortak.types import Array
from ml_temel.ortak.validation import check_is_fitted

Columns = str | int | Sequence[str] | Sequence[int]
Transformer = tuple[str, Any, Columns]


def _select(X: Any, columns: Columns) -> Any:
    """Seçilen sütunlar: liste → 2B matris, tek ad/numara → 1B dizi."""
    single = isinstance(columns, (str, int, np.integer))
    if isinstance(X, Table):
        if single:
            return X[str(columns)]
        names = [str(column) for column in columns]  # type: ignore[union-attr]
        numeric = all(X[name].dtype.kind in "fiub" for name in names)
        return X.to_matrix(names) if numeric else X.to_object_matrix(names)
    array = np.asarray(X)
    if array.ndim != 2:
        raise ValueError(
            f"ColumnTransformer `Table` ya da 2 boyutlu dizi ister; verilen biçim {array.shape}."
        )
    try:
        return array[:, columns]  # type: ignore[index]
    except IndexError as error:
        raise ValueError(
            f"Sütun seçimi {columns!r} geçersiz: numpy dizisinde sütunlar numarayla "
            f"(0..{array.shape[1] - 1}) seçilir. Adla seçmek için veriyi `Table` olarak verin."
        ) from error


def _as_matrix(output: Any, name: str) -> Array:
    matrix = np.asarray(output)
    if matrix.ndim == 1:
        matrix = matrix.reshape(-1, 1)
    try:
        return matrix.astype(np.float64)
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"'{name}' dönüştürücüsünün çıktısı sayısal değil ({error}). Kategori sütunlarının "
            "sonuna bir kodlayıcı (OneHotEncoder / OrdinalEncoder) ekleyin."
        ) from error


class ColumnTransformer(NamedSteps):
    """`transformers`: (ad, dönüştürücü, sütunlar) üçlüleri; dönüştürücü "passthrough" olabilir."""

    _steps_attribute = "transformers"

    def __init__(self, transformers: Sequence[Transformer]) -> None:
        self.transformers = transformers

    def _named(self) -> list[tuple[str, Any]]:
        return [(name, transformer) for name, transformer, _ in self.transformers]

    def fit(self, X: Any, y: Any = None) -> Self:
        self.fit_transform(X, y)
        return self

    def fit_transform(self, X: Any, y: Any = None) -> Array:
        if not self.transformers:
            raise ValueError(
                "ColumnTransformer en az bir (ad, dönüştürücü, sütunlar) üçlüsü ister."
            )
        self._check_names()
        blocks: list[Array] = []
        self.output_slices_: dict[str, slice] = {}
        start = 0
        for name, transformer, columns in self.transformers:
            selected = _select(X, columns)
            if isinstance(transformer, str):
                if transformer != "passthrough":
                    raise ValueError(
                        f"'{name}': dönüştürücü yerine yalnız 'passthrough' yazılabilir."
                    )
                block = _as_matrix(selected, name)
            else:
                block = _as_matrix(transformer.fit_transform(selected, y), name)
            blocks.append(block)
            self.output_slices_[name] = slice(start, start + block.shape[1])
            start += block.shape[1]
        return np.hstack(blocks)

    def transform(self, X: Any) -> Array:
        check_is_fitted(self, "output_slices_")
        blocks: list[Array] = []
        for name, transformer, columns in self.transformers:
            selected = _select(X, columns)
            output = selected if isinstance(transformer, str) else transformer.transform(selected)
            block = _as_matrix(output, name)
            expected = self.output_slices_[name]
            if block.shape[1] != expected.stop - expected.start:
                raise ValueError(
                    f"'{name}' eğitimde {expected.stop - expected.start} sütun üretmişti; "
                    f"şimdi {block.shape[1]} sütun üretti."
                )
            blocks.append(block)
        return np.hstack(blocks)

    def get_feature_names_out(self) -> list[str]:
        """Çıktı sütun adları: `ad__özellik`. Dönüştürücü ad veremiyorsa `ad__0, ad__1…`."""
        check_is_fitted(self, "output_slices_")
        names: list[str] = []
        for name, transformer, columns in self.transformers:
            width = self.output_slices_[name].stop - self.output_slices_[name].start
            single = isinstance(columns, (str, int, np.integer))
            inputs = [str(columns)] if single else [str(c) for c in columns]  # type: ignore[union-attr]
            final = transformer.steps[-1][1] if hasattr(transformer, "steps") else transformer
            produced: list[str] | None = None
            if hasattr(final, "get_feature_names_out"):
                try:
                    produced = list(final.get_feature_names_out(inputs))
                except (TypeError, ValueError):
                    produced = None
            if produced is None or len(produced) != width:
                produced = inputs if len(inputs) == width else [str(i) for i in range(width)]
            names.extend(f"{name}__{feature}" for feature in produced)
        return names
