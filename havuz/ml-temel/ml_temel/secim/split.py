"""Eğitim / sınama ayrımı: `train_test_split`.

Fikir: modelin başarısı, eğitimde HİÇ görmediği satırlarda ölçülür. Sınama kümesi baştan ayrılır
ve model seçimi bitene kadar ona bakılmaz.

scikit-learn'deki işlevin aynısı; iki ek kolaylık:
  groups=...      aynı gruptaki satırlar aynı tarafa düşer (grup sızıntısına karşı)
  shuffle=False   son `test_size` kadar satır sınama olur — zaman sıralı veride doğru olan budur
Girdi olarak numpy dizisi, liste ya da `Table` verilebilir.
Genişletme: yeni bir ayrım kuralı için `_group_split`'i örnek alın.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from ml_temel.ortak.types import ArrayLike, IntArray, Seed
from ml_temel.ortak.validation import (
    check_consistent_length,
    column_or_1d,
    make_rng,
    num_rows,
    take_rows,
)


def _test_count(n_samples: int, test_size: float | int) -> int:
    if isinstance(test_size, float):
        if not 0.0 < test_size < 1.0:
            raise ValueError(
                f"test_size oran olarak (0, 1) aralığında olmalı; verilen: {test_size}"
            )
        count = int(np.ceil(test_size * n_samples))
    else:
        count = int(test_size)
    if not 0 < count < n_samples:
        raise ValueError(
            f"{n_samples} satırdan {count} tanesi sınamaya ayrılamaz; hem eğitimde hem sınamada "
            "en az bir satır kalmalı."
        )
    return count


def _stratified_split(labels: ArrayLike, n_test: int, rng: np.random.Generator) -> IntArray:
    """Her sınıftan orantılı sayıda sınama satırı seçer (en büyük kalan yöntemiyle yuvarlar)."""
    y = column_or_1d(labels, name="stratify")
    classes, encoded, counts = np.unique(y, return_inverse=True, return_counts=True)
    if int(np.min(counts)) < 2:
        rare = classes[int(np.argmin(counts))]
        raise ValueError(
            f"Katmanlı ayrım için her sınıftan en az 2 örnek gerekir; '{rare}' sınıfında "
            f"{int(np.min(counts))} tane var. O sınıfı çıkarın/birleştirin ya da stratify vermeyin."
        )
    exact = counts * n_test / y.shape[0]
    per_class = np.floor(exact).astype(np.int64)
    remainder = n_test - int(per_class.sum())
    for code in np.argsort(-(exact - per_class), kind="stable")[:remainder]:
        per_class[code] += 1
    per_class = np.clip(per_class, 0, counts - 1)  # her sınıftan eğitimde de örnek kalsın
    test: list[IntArray] = []
    for code in range(len(classes)):
        members = rng.permutation(np.flatnonzero(encoded == code))
        test.append(members[: per_class[code]])
    return np.concatenate(test)


def _group_split(groups: ArrayLike, n_test: int, rng: np.random.Generator) -> IntArray:
    """Karıştırılmış grupları, sınama boyu `n_test`'e ulaşana kadar bütün olarak sınamaya koyar."""
    group_ids = column_or_1d(groups, name="groups")
    unique, encoded, counts = np.unique(group_ids, return_inverse=True, return_counts=True)
    if len(unique) < 2:
        raise ValueError("Gruplu ayrım için en az 2 farklı grup gerekir.")
    order = rng.permutation(len(unique))
    taken = np.cumsum(counts[order])
    n_groups = int(np.searchsorted(taken, n_test)) + 1
    n_groups = min(max(n_groups, 1), len(unique) - 1)
    return np.flatnonzero(np.isin(encoded, order[:n_groups]))


def train_test_split(
    *arrays: Any,
    test_size: float | int = 0.25,
    random_state: Seed = None,
    shuffle: bool = True,
    stratify: ArrayLike | None = None,
    groups: ArrayLike | None = None,
) -> list[Any]:
    """Her girdi için [eğitim, sınama] parçalarını sırayla döndürür: X_tr, X_te, y_tr, y_te, ..."""
    if not arrays:
        raise ValueError("En az bir dizi verin: train_test_split(X, y, ...).")
    check_consistent_length(*arrays, stratify, groups)
    n_samples = num_rows(arrays[0])
    n_test = _test_count(n_samples, test_size)
    rng = make_rng(random_state)
    if not shuffle:
        if stratify is not None or groups is not None:
            raise ValueError("shuffle=False iken stratify/groups kullanılamaz (sıra korunur).")
        test = np.arange(n_samples - n_test, n_samples)
    elif groups is not None:
        if stratify is not None:
            raise ValueError("stratify ve groups birlikte kullanılamaz; yalnız `groups` verin.")
        test = _group_split(groups, n_test, rng)
    elif stratify is not None:
        test = _stratified_split(stratify, n_test, rng)
    else:
        test = rng.permutation(n_samples)[:n_test]
    is_test = np.zeros(n_samples, dtype=bool)
    is_test[test] = True
    train_rows, test_rows = np.flatnonzero(~is_test), np.flatnonzero(is_test)
    if shuffle:
        train_rows, test_rows = rng.permutation(train_rows), rng.permutation(test_rows)
    parts: list[Any] = []
    for array in arrays:
        parts.extend([take_rows(array, train_rows), take_rows(array, test_rows)])
    return parts
