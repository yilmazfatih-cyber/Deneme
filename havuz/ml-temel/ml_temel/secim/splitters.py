"""Çapraz doğrulama bölücüleri: K-kat, katmanlı, gruplu ve zaman serisi ayrımları.

Her bölücünün `split(X, y, groups)` yöntemi (eğitim indeksleri, sınama indeksleri) çiftleri üretir.
Doğru bölücüyü seçmek, değerlendirmenin dürüst olmasının yarısıdır:

  KFold            satırlar birbirinden bağımsızsa (regresyon)
  StratifiedKFold  sınıflandırma: her katta sınıf oranları korunur
  GroupKFold       aynı varlığa (müşteri, hasta, cihaz) ait birden çok satır varsa: bir grup ya
                   tümüyle eğitimde ya tümüyle sınamadadır — yoksa model kişiyi "tanır" (sızıntı)
  TimeSeriesSplit  veri zaman sıralıysa: eğitim hep sınamadan ÖNCEdir — geleceği görüp geçmişi
                   tahmin etmek sızıntıdır

Karar tablosu ve örnekler: docs/DEGERLENDIRME.md.
Genişletme: yeni bölücü = `get_n_splits` ve `split` yöntemleri olan sınıf; `KFold`'u kopyalayın.
"""

from __future__ import annotations

import warnings
from collections.abc import Iterator
from typing import Any

import numpy as np

from ml_temel.ortak.base import BaseEstimator
from ml_temel.ortak.types import IntArray, Seed
from ml_temel.ortak.validation import column_or_1d, make_rng, num_rows

Split = tuple[IntArray, IntArray]


def _check_n_splits(n_splits: int, n_samples: int) -> None:
    if n_splits < 2:
        raise ValueError(f"n_splits en az 2 olmalı; verilen: {n_splits}")
    if n_splits > n_samples:
        raise ValueError(
            f"n_splits ({n_splits}) örnek sayısından ({n_samples}) büyük olamaz; daha az kat seçin."
        )


def _splits_from_folds(folds: IntArray, n_splits: int) -> Iterator[Split]:
    """Her satırın kat numarasından (eğitim, sınama) indekslerini üretir."""
    indices = np.arange(folds.shape[0])
    for fold in range(n_splits):
        test = folds == fold
        yield indices[~test], indices[test]


class KFold(BaseEstimator):
    """Veriyi `n_splits` eşit parçaya böler; her parça bir kez sınama kümesi olur."""

    def __init__(self, n_splits: int = 5, shuffle: bool = False, random_state: Seed = None) -> None:
        self.n_splits = n_splits
        self.shuffle = shuffle
        self.random_state = random_state

    def get_n_splits(self) -> int:
        return self.n_splits

    def split(self, X: Any, y: Any = None, groups: Any = None) -> Iterator[Split]:
        n_samples = num_rows(X)
        _check_n_splits(self.n_splits, n_samples)
        indices = np.arange(n_samples)
        if self.shuffle:
            make_rng(self.random_state).shuffle(indices)
        sizes = np.full(self.n_splits, n_samples // self.n_splits)
        sizes[: n_samples % self.n_splits] += 1
        folds = np.empty(n_samples, dtype=np.int64)
        folds[indices] = np.repeat(np.arange(self.n_splits), sizes)
        yield from _splits_from_folds(folds, self.n_splits)


class StratifiedKFold(BaseEstimator):
    """K-kat; her katta her sınıftan (±1 farkla) eşit sayıda örnek bulunur."""

    def __init__(self, n_splits: int = 5, shuffle: bool = False, random_state: Seed = None) -> None:
        self.n_splits = n_splits
        self.shuffle = shuffle
        self.random_state = random_state

    def get_n_splits(self) -> int:
        return self.n_splits

    def split(self, X: Any, y: Any = None, groups: Any = None) -> Iterator[Split]:
        if y is None:
            raise ValueError("StratifiedKFold sınıf etiketlerini (y) ister.")
        labels = column_or_1d(y)
        n_samples = labels.shape[0]
        _check_n_splits(self.n_splits, n_samples)
        classes, encoded, counts = np.unique(labels, return_inverse=True, return_counts=True)
        if int(np.min(counts)) < self.n_splits:
            rare = classes[int(np.argmin(counts))]
            warnings.warn(
                f"En az görülen sınıfta ('{rare}') yalnız {int(np.min(counts))} örnek var; "
                f"n_splits={self.n_splits} iken bazı katlarda bu sınıf bulunmayacak. "
                "Kat sayısını azaltın.",
                UserWarning,
                stacklevel=2,
            )
        rng = make_rng(self.random_state)
        folds = np.empty(n_samples, dtype=np.int64)
        offset = 0
        for code in range(len(classes)):
            members = np.flatnonzero(encoded == code)
            if self.shuffle:
                rng.shuffle(members)
            # Kat numaraları sırayla dağıtılır; `offset` artıkların hep ilk kata yığılmasını önler.
            folds[members] = (offset + np.arange(members.size)) % self.n_splits
            offset += members.size
        yield from _splits_from_folds(folds, self.n_splits)


class GroupKFold(BaseEstimator):
    """K-kat; aynı gruptaki satırlar asla hem eğitimde hem sınamada bulunmaz."""

    def __init__(self, n_splits: int = 5) -> None:
        self.n_splits = n_splits

    def get_n_splits(self) -> int:
        return self.n_splits

    def split(self, X: Any, y: Any = None, groups: Any = None) -> Iterator[Split]:
        if groups is None:
            raise ValueError(
                "GroupKFold `groups` ister: her satırın ait olduğu grubun kimliği "
                "(ör. müşteri numarası)."
            )
        group_ids = column_or_1d(groups, name="groups")
        unique, encoded, counts = np.unique(group_ids, return_inverse=True, return_counts=True)
        if len(unique) < self.n_splits:
            raise ValueError(
                f"n_splits ({self.n_splits}) farklı grup sayısından ({len(unique)}) büyük olamaz."
            )
        # Açgözlü dengeleme: en büyük gruptan başla, her grubu o an en boş kata koy.
        fold_sizes = np.zeros(self.n_splits, dtype=np.int64)
        group_fold = np.empty(len(unique), dtype=np.int64)
        for group in np.argsort(-counts, kind="stable"):
            lightest = int(np.argmin(fold_sizes))
            group_fold[group] = lightest
            fold_sizes[lightest] += counts[group]
        yield from _splits_from_folds(group_fold[encoded], self.n_splits)


class TimeSeriesSplit(BaseEstimator):
    """Genişleyen pencere: eğitim = baştan bir ana kadar, sınama = hemen sonrası.

    Satırlar zaman sırasına DİZİLMİŞ olmalıdır. `gap`: eğitimin sonu ile sınamanın başı arasında
    atlanacak satır (hedef, gelecekteki bir pencereden hesaplanıyorsa sızıntıyı önler).
    """

    def __init__(
        self,
        n_splits: int = 5,
        max_train_size: int | None = None,
        test_size: int | None = None,
        gap: int = 0,
    ) -> None:
        self.n_splits = n_splits
        self.max_train_size = max_train_size
        self.test_size = test_size
        self.gap = gap

    def get_n_splits(self) -> int:
        return self.n_splits

    def split(self, X: Any, y: Any = None, groups: Any = None) -> Iterator[Split]:
        n_samples = num_rows(X)
        if self.n_splits < 2:
            raise ValueError(f"n_splits en az 2 olmalı; verilen: {self.n_splits}")
        test_size = (
            self.test_size if self.test_size is not None else n_samples // (self.n_splits + 1)
        )
        if test_size < 1 or n_samples - self.gap - test_size * self.n_splits <= 0:
            raise ValueError(
                f"{n_samples} satır; {self.n_splits} kat, sınama boyu {test_size} ve boşluk "
                f"{self.gap} için yetmiyor. Kat sayısını ya da sınama boyunu küçültün."
            )
        indices = np.arange(n_samples)
        for test_start in range(n_samples - self.n_splits * test_size, n_samples, test_size):
            train_end = test_start - self.gap
            train_start = 0
            if self.max_train_size is not None:
                train_start = max(0, train_end - self.max_train_size)
            yield indices[train_start:train_end], indices[test_start : test_start + test_size]


def check_cv(cv: Any, y: Any = None, classifier: bool = False) -> Any:
    """Tam sayıyı uygun bölücüye çevirir: sınıflandırmada StratifiedKFold, yoksa KFold."""
    if cv is None:
        cv = 5
    if isinstance(cv, (int, np.integer)):
        return StratifiedKFold(int(cv)) if classifier and y is not None else KFold(int(cv))
    if not hasattr(cv, "split"):
        raise TypeError(
            "cv bir tam sayı ya da `split` yöntemi olan bir bölücü olmalı "
            "(KFold, StratifiedKFold, GroupKFold, TimeSeriesSplit)."
        )
    return cv
