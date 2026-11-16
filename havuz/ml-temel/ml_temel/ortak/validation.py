"""Girdi doğrulama: dışarıdan gelen her dizi burada denetlenir ve tek biçime getirilir.

Her tahminleyicinin `fit`/`predict` yöntemi işe bu fonksiyonlarla başlar; böylece yanlış biçimli
veri, modelin derinlerinde anlaşılmaz bir numpy hatası yerine burada, ne yapılacağını söyleyen
Türkçe bir iletiyle durur. (Tek çalışma zamanı bağımlılığı numpy olduğu için Pydantic yerine
elle doğrulama yapılır; gerekçe: docs/KARARLAR.md K02.)

Kim kullanır: `klasik`, `onisleme`, `secim`, `olcut`, `tablo`.
Genişletme: yeni bir ortak denetim gerekiyorsa buraya fonksiyon olarak ekleyin.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.types import Array, ArrayLike, IntArray, Seed


class NotFittedError(ValueError, AttributeError):
    """`fit` çağrılmadan `predict`/`transform` çağrıldığında fırlatılır."""


def make_rng(random_state: Seed) -> np.random.Generator:
    """Tohumdan (ya da hazır bir üreteçten) numpy rastgele üreteci kurar."""
    if isinstance(random_state, np.random.Generator):
        return random_state
    return np.random.default_rng(random_state)


def check_array(
    X: ArrayLike,
    *,
    name: str = "X",
    ensure_2d: bool = True,
    allow_nan: bool = False,
    min_samples: int = 1,
) -> Array:
    """Girdiyi float64 numpy dizisine çevirir; biçim ve sonluluk denetimi yapar."""
    try:
        array = np.asarray(X, dtype=np.float64)
    except (TypeError, ValueError) as error:
        raise ValueError(
            f"{name} sayıya çevrilemedi ({error}). Metin/kategori sütunlarını önce "
            "`OneHotEncoder` ya da `OrdinalEncoder` ile sayıya çevirin."
        ) from error
    if ensure_2d:
        if array.ndim == 1:
            raise ValueError(
                f"{name} 2 boyutlu olmalı (satır × sütun); 1 boyutlu dizi verildi. Tek özellik "
                "için `X.reshape(-1, 1)`, tek satır için `X.reshape(1, -1)` kullanın."
            )
        if array.ndim != 2:
            raise ValueError(f"{name} 2 boyutlu olmalı; verilen biçim {array.shape}.")
    if array.shape[0] < min_samples:
        raise ValueError(f"{name} en az {min_samples} satır içermeli; verilen: {array.shape[0]}.")
    if np.isinf(array).any():
        raise ValueError(f"{name} içinde sonsuz (inf) değer var; veriyi temizleyin.")
    if not allow_nan and np.isnan(array).any():
        raise ValueError(
            f"{name} içinde eksik değer (NaN) var. Önce `SimpleImputer` ile doldurun ya da "
            "eksik değeri kendisi işleyen `GradientBoostingClassifier/Regressor` kullanın."
        )
    return array


def column_or_1d(y: ArrayLike, *, name: str = "y") -> Array:
    """Hedefi 1 boyutlu diziye çevirir ((n, 1) biçimini de kabul eder); dtype'a dokunmaz."""
    array = np.asarray(y)
    if array.ndim == 2 and array.shape[1] == 1:
        array = array[:, 0]
    if array.ndim != 1:
        raise ValueError(f"{name} 1 boyutlu olmalı; verilen biçim {array.shape}.")
    return array


def check_consistent_length(*arrays: Any) -> None:
    """Bütün dizilerin satır sayısı aynı mı?"""
    lengths = {num_rows(array) for array in arrays if array is not None}
    if len(lengths) > 1:
        raise ValueError(
            f"Dizilerin satır sayıları farklı: {sorted(lengths)}. X ile y (ve varsa grup/ağırlık) "
            "aynı sayıda satır içermeli."
        )


def check_X_y(  # noqa: N802 - scikit-learn ile aynı ad
    X: ArrayLike, y: ArrayLike, *, allow_nan: bool = False
) -> tuple[Array, Array]:
    """`fit(X, y)` girişi: X → 2B float64, y → 1B (dtype korunur), uzunluklar eşit."""
    X_checked = check_array(X, allow_nan=allow_nan)
    y_checked = column_or_1d(y)
    check_consistent_length(X_checked, y_checked)
    return X_checked, y_checked


def check_regression_target(y: Array) -> Array:
    """Regresyon hedefini float64'e çevirir; NaN/inf içermemeli."""
    try:
        target = np.asarray(y, dtype=np.float64)
    except (TypeError, ValueError) as error:
        raise ValueError(
            "Regresyon hedefi sayısal olmalı. Hedef kategoriyse sınıflandırıcı kullanın."
        ) from error
    if not np.isfinite(target).all():
        raise ValueError("Hedef (y) içinde eksik ya da sonsuz değer var; o satırları çıkarın.")
    return target


def encode_labels(y: Array) -> tuple[Array, IntArray]:
    """Sınıf etiketlerini 0..K-1 numaralarına çevirir: (sıralı sınıflar, numaralar)."""
    if y.dtype.kind == "f" and np.isnan(y).any():
        raise ValueError("Hedef (y) içinde eksik değer var; o satırları çıkarın.")
    classes, encoded = np.unique(y, return_inverse=True)
    return classes, encoded.astype(np.int64)


def check_sample_weight(sample_weight: ArrayLike | None, n_samples: int) -> Array:
    """Örnek ağırlıklarını denetler; verilmemişse hepsi 1."""
    if sample_weight is None:
        return np.ones(n_samples)
    weights = np.asarray(sample_weight, dtype=np.float64)
    if weights.shape != (n_samples,):
        raise ValueError(f"sample_weight biçimi ({n_samples},) olmalı; verilen {weights.shape}.")
    if (weights < 0).any() or not np.isfinite(weights).all():
        raise ValueError("sample_weight negatif ya da sonsuz olamaz.")
    return weights


def check_is_fitted(estimator: Any, attribute: str) -> None:
    """Model eğitilmiş mi? (`attribute`, `fit` sırasında atanan bir alan adıdır: `coef_` gibi.)"""
    if not hasattr(estimator, attribute):
        raise NotFittedError(
            f"{type(estimator).__name__} henüz eğitilmedi. Önce `fit(...)` çağırın."
        )


def check_n_features(estimator: Any, X: Array) -> None:
    """Tahmin verisinin sütun sayısı eğitimdekiyle aynı mı?"""
    expected = getattr(estimator, "n_features_in_", None)
    if expected is not None and X.shape[1] != expected:
        raise ValueError(
            f"{type(estimator).__name__} {expected} sütunla eğitildi; verilen veri "
            f"{X.shape[1]} sütunlu. Eğitimdeki ön işleme adımlarının aynısını uygulayın "
            "(en kolayı: ön işleme + modeli tek bir `Pipeline` içinde tutmak)."
        )


def num_rows(X: Any) -> int:
    """Satır sayısı: numpy dizisi, liste ya da `Table` için."""
    if hasattr(X, "shape"):
        return int(X.shape[0])
    return len(X)


def take_rows(X: Any, rows: IntArray) -> Any:
    """Verilen satırları seçer: numpy dizisi, `Table` (kendi `take` yöntemi) ya da liste."""
    if hasattr(X, "take_rows"):
        return X.take_rows(rows)
    if isinstance(X, np.ndarray):
        return X[rows]
    if isinstance(X, (list, tuple)):
        return [X[int(i)] for i in rows]
    raise TypeError(
        f"Satır seçimi desteklenmeyen veri türü: {type(X).__name__}. numpy dizisi, liste ya da "
        "`ml_temel.ortak.Table` verin."
    )
