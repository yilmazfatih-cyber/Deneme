"""Kategori kodlayıcılar: OneHotEncoder (tek-sıcak) ve OrdinalEncoder (sıralı tam sayı).

Fikir: modeller sayı ister; "şehir = İzmir" gibi kategoriler sayıya çevrilmelidir.

  OneHotEncoder   her kategoriye 0/1 değerli ayrı bir sütun. Doğrusal modeller, k-NN ve sinir
                  ağları için doğrusu budur (kategoriler arasında sahte bir sıra uydurmaz).
  OrdinalEncoder  her kategoriye bir tam sayı (0, 1, 2…). Ağaç tabanlı modeller için yeterli ve
                  çok kategorili sütunlarda tek-sıcaktan çok daha küçüktür.

Eğitimde görülmemiş kategori: tek-sıcakta tüm sütunlar 0, sıralıda `unknown_value` (-1) olur.
Eksik değer (None/NaN) bir kategori sayılmaz: tek-sıcakta tüm sütunlar 0, sıralıda NaN.
scikit-learn'den fark: `handle_unknown` varsayılanı "error" değil, hoşgörülü olandır.
Genişletme: yeni bir kodlama (ör. hedef kodlama) için `OrdinalEncoder`'ı kopyalayın — ama hedef
kodlama sızıntıya çok açıktır; mutlaka `Pipeline` içinde ve kat içinde uydurun.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Self

import numpy as np

from ml_temel.onisleme.impute import missing_mask
from ml_temel.ortak.base import BaseEstimator, TransformerMixin
from ml_temel.ortak.types import Array, ArrayLike, IntArray
from ml_temel.ortak.validation import check_is_fitted

OTHER_LABEL = "(diğer)"


def _as_2d(X: ArrayLike) -> Array:
    data = np.asarray(X)
    if data.dtype.kind in "US":
        data = data.astype(object)
    if data.ndim != 2:
        raise ValueError(
            f"X 2 boyutlu olmalı (satır × sütun); verilen biçim {data.shape}. "
            "Tek sütun için `X.reshape(-1, 1)` kullanın."
        )
    return data


def _codes(column: Array, categories: Array) -> IntArray:
    """Her değerin `categories` içindeki sırası; listede olmayan ya da eksik değer için -1."""
    codes = np.full(column.shape[0], -1, dtype=np.int64)
    present = ~missing_mask(column)
    if categories.size == 0 or not present.any():
        return codes
    values = column[present]
    try:
        position = np.clip(np.searchsorted(categories, values), 0, categories.size - 1)
        found = categories[position] == values
    except TypeError:  # metin ve sayı karışık sütun: metin olarak karşılaştır
        lookup = {str(category): index for index, category in enumerate(categories.tolist())}
        codes[present] = [lookup.get(str(value), -1) for value in values.tolist()]
        return codes
    codes[present] = np.where(found, position, -1)
    return codes


def _fit_categories(column: Array) -> tuple[Array, IntArray]:
    """Sütundaki (eksik olmayan) kategoriler sıralı olarak ve her birinin görülme sayısı."""
    values = column[~missing_mask(column)]
    try:
        categories, counts = np.unique(values, return_counts=True)
    except TypeError:
        categories, counts = np.unique(values.astype(str), return_counts=True)
        categories = categories.astype(object)
    return categories, counts


class OneHotEncoder(BaseEstimator, TransformerMixin):
    """Her kategori için 0/1 sütunu üretir (yoğun float64 matris).

    `min_frequency` (sayı ya da oran) altında kalan ve `max_categories` sınırını aşan seyrek
    kategoriler tek bir "(diğer)" sütununda toplanır. `drop="first"` her özelliğin ilk sütununu,
    `drop="if_binary"` yalnız iki kategorili özelliklerin ilk sütununu atar.
    """

    def __init__(
        self,
        handle_unknown: str = "ignore",
        min_frequency: float | None = None,
        max_categories: int | None = None,
        drop: str | None = None,
    ) -> None:
        self.handle_unknown = handle_unknown
        self.min_frequency = min_frequency
        self.max_categories = max_categories
        self.drop = drop

    def _frequent(self, counts: IntArray, n_samples: int) -> Array:
        """Kendi sütununu hak eden (seyrek olmayan) kategorilerin maskesi."""
        keep = np.ones(counts.size, dtype=bool)
        if self.min_frequency is not None:
            threshold = self.min_frequency
            if isinstance(threshold, float) and threshold < 1.0:
                threshold = threshold * n_samples
            keep &= counts >= threshold
        n_output = int(keep.sum()) + (0 if keep.all() else 1)
        if self.max_categories is not None and n_output > self.max_categories:
            # "(diğer)" sütunu da bir kategori sayılır: en sık (max_categories - 1) tanesi kalır.
            order = np.argsort(-np.where(keep, counts, -1), kind="stable")
            keep = np.zeros(counts.size, dtype=bool)
            keep[order[: max(self.max_categories - 1, 1)]] = True
        return keep

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        if self.handle_unknown not in ("ignore", "error"):
            raise ValueError("handle_unknown 'ignore' ya da 'error' olmalı.")
        if self.drop not in (None, "first", "if_binary"):
            raise ValueError("drop None, 'first' ya da 'if_binary' olmalı.")
        data = _as_2d(X)
        self.categories_: list[Array] = []
        self._column_of: list[IntArray] = []  # kategori sırası → çıktı sütunu (-1: atıldı)
        self._names: list[list[str]] = []
        for j in range(data.shape[1]):
            categories, counts = _fit_categories(data[:, j])
            keep = self._frequent(counts, data.shape[0])
            labels = [str(category) for category in categories[keep].tolist()]
            column_of = np.full(categories.size, -1, dtype=np.int64)
            column_of[keep] = np.arange(int(keep.sum()))
            if not keep.all():  # seyrekler ortak "(diğer)" sütununa
                column_of[~keep] = len(labels)
                labels.append(OTHER_LABEL)
            if self.drop == "first" or (self.drop == "if_binary" and len(labels) == 2):
                column_of = np.where(column_of == 0, -1, column_of - 1)
                labels = labels[1:]
            self.categories_.append(categories)
            self._column_of.append(column_of)
            self._names.append(labels)
        self.n_features_in_ = data.shape[1]
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "categories_")
        data = _as_2d(X)
        if data.shape[1] != self.n_features_in_:
            raise ValueError(
                f"OneHotEncoder {self.n_features_in_} sütunla eğitildi; verilen veri "
                f"{data.shape[1]} sütunlu."
            )
        blocks: list[Array] = []
        rows = np.arange(data.shape[0])
        for j, categories in enumerate(self.categories_):
            codes = _codes(data[:, j], categories)
            if self.handle_unknown == "error":
                unknown = (codes < 0) & ~missing_mask(data[:, j])
                if unknown.any():
                    example = data[np.flatnonzero(unknown)[0], j]
                    raise ValueError(
                        f"{j}. sütunda eğitimde görülmemiş kategori: {example!r}. "
                        "handle_unknown='ignore' ile bu değerler sıfır satırı olarak kodlanır."
                    )
            target = np.where(codes >= 0, self._column_of[j][np.maximum(codes, 0)], -1)
            block = np.zeros((data.shape[0], len(self._names[j])))
            valid = target >= 0
            block[rows[valid], target[valid]] = 1.0
            blocks.append(block)
        return np.hstack(blocks) if blocks else np.empty((data.shape[0], 0))

    def get_feature_names_out(self, input_features: Sequence[str] | None = None) -> list[str]:
        """Çıktı sütun adları: `özellik_kategori` (ör. `sehir_İzmir`)."""
        check_is_fitted(self, "categories_")
        features = (
            list(input_features)
            if input_features is not None
            else [f"x{j}" for j in range(self.n_features_in_)]
        )
        return [
            f"{feature}_{label}"
            for feature, labels in zip(features, self._names, strict=True)
            for label in labels
        ]


class OrdinalEncoder(BaseEstimator, TransformerMixin):
    """Her kategoriyi sıralı listedeki yerine (0, 1, 2…) çevirir; çıktı float64 matristir."""

    def __init__(
        self,
        handle_unknown: str = "use_encoded_value",
        unknown_value: float = -1.0,
        encoded_missing_value: float = float("nan"),
    ) -> None:
        self.handle_unknown = handle_unknown
        self.unknown_value = unknown_value
        self.encoded_missing_value = encoded_missing_value

    def fit(self, X: ArrayLike, y: Any = None) -> Self:
        if self.handle_unknown not in ("use_encoded_value", "error"):
            raise ValueError("handle_unknown 'use_encoded_value' ya da 'error' olmalı.")
        data = _as_2d(X)
        self.categories_ = [_fit_categories(data[:, j])[0] for j in range(data.shape[1])]
        self.n_features_in_ = data.shape[1]
        return self

    def transform(self, X: ArrayLike) -> Array:
        check_is_fitted(self, "categories_")
        data = _as_2d(X)
        if data.shape[1] != self.n_features_in_:
            raise ValueError(
                f"OrdinalEncoder {self.n_features_in_} sütunla eğitildi; verilen veri "
                f"{data.shape[1]} sütunlu."
            )
        encoded = np.empty(data.shape, dtype=np.float64)
        for j, categories in enumerate(self.categories_):
            codes = _codes(data[:, j], categories)
            missing = missing_mask(data[:, j])
            unknown = (codes < 0) & ~missing
            if unknown.any() and self.handle_unknown == "error":
                example = data[np.flatnonzero(unknown)[0], j]
                raise ValueError(f"{j}. sütunda eğitimde görülmemiş kategori: {example!r}.")
            column = codes.astype(np.float64)
            column[unknown] = self.unknown_value
            column[missing] = self.encoded_missing_value
            encoded[:, j] = column
        return encoded

    def inverse_transform(self, X: ArrayLike) -> Array:
        """Kodları kategori etiketlerine geri çevirir (bilinmeyen/eksik → None)."""
        check_is_fitted(self, "categories_")
        codes = np.asarray(X, dtype=np.float64)
        decoded = np.empty(codes.shape, dtype=object)
        for j, categories in enumerate(self.categories_):
            column = codes[:, j]
            valid = np.isfinite(column) & (column >= 0) & (column < categories.size)
            decoded[:, j] = None
            decoded[valid, j] = categories[column[valid].astype(np.int64)]
        return decoded
