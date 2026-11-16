"""Ayrım stratejisi: veriye göre doğru eğitim/sınama ayrımını ve çapraz doğrulama katlarını seçer.

  zaman sütunu verildiyse  satırlar zamana göre dizilir; sınama = en yeni %20; katlar
                           TimeSeriesSplit (eğitim hep geçmişte). Gelecekten öğrenip geçmişi
                           tahmin etmek sızıntıdır.
  grup sütunu verildiyse   bir grubun (müşteri, hasta) bütün satırları aynı tarafta kalır;
                           katlar GroupKFold. Yoksa model kişiyi "tanır", başarı şişer.
  sınıflandırma            katmanlı (sınıf oranları her parçada korunur); katlar StratifiedKFold
  regresyon                rastgele; katlar KFold
Katlar YALNIZ eğitim satırları üzerinde kurulur; sınama kümesine model seçimi bitene kadar bakılmaz.
Genişletme: yeni bir strateji için `make_split`'e bir dal ve messages.py'ye açıklama metni ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from ml_temel.ortak.types import Array, IntArray
from ml_temel.secim import (
    GroupKFold,
    KFold,
    StratifiedKFold,
    TimeSeriesSplit,
    train_test_split,
)
from ml_temel.tablo.schema import parse_dates


@dataclass(frozen=True)
class SplitPlan:
    """`order`: satırların kullanılacak sırası; `train`/`test`: bu sıraya göre konumlar."""

    strategy: str
    order: IntArray
    train: IntArray
    test: IntArray
    folds: list[tuple[IntArray, IntArray]]
    dropped: int


def time_values(column: Array) -> Array:
    """Zaman sütununu sıralanabilir sayılara çevirir (tarih → gün, sayı → kendisi)."""
    if column.dtype.kind == "f":
        return column.astype(np.float64)
    days = parse_dates(np.asarray(column, dtype=object), threshold=0.9)
    if days is None:
        raise ValueError(
            "Zaman sütunu tarih (gg.aa.yyyy ya da yyyy-aa-gg) ya da sayı olmalı; tanınamadı."
        )
    return days


def make_split(
    n_rows: int,
    y: Array,
    task: str,
    *,
    time: Array | None,
    groups: Array | None,
    test_size: float,
    folds: int,
    seed: int,
) -> SplitPlan:
    """Stratejiyi seçer ve (sıra, eğitim, sınama, katlar) üretir."""
    order = np.arange(n_rows)
    dropped = 0
    if time is not None:
        valid = np.isfinite(time)
        dropped = int((~valid).sum())
        order = np.flatnonzero(valid)[np.argsort(time[valid], kind="stable")]
        n_test = int(np.ceil(test_size * order.size))
        train, test = np.arange(order.size - n_test), np.arange(order.size - n_test, order.size)
        splitter: Any = TimeSeriesSplit(n_splits=folds)
        strategy = "zaman"
    elif groups is not None:
        positions = np.arange(n_rows)
        train, test = train_test_split(
            positions, test_size=test_size, random_state=seed, groups=groups
        )
        n_groups = np.unique(groups[train]).size
        splitter = GroupKFold(n_splits=max(2, min(folds, n_groups)))
        strategy = "grup"
    elif task == "siniflandirma":
        positions = np.arange(n_rows)
        train, test = train_test_split(
            positions, test_size=test_size, random_state=seed, stratify=y
        )
        splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=seed)
        strategy = "katmanli"
    else:
        positions = np.arange(n_rows)
        train, test = train_test_split(positions, test_size=test_size, random_state=seed)
        splitter = KFold(n_splits=folds, shuffle=True, random_state=seed)
        strategy = "rastgele"
    train, test = np.sort(train), np.sort(test)
    rows = order[train]
    train_groups = None if groups is None else groups[rows]
    fold_list = [
        (np.asarray(a), np.asarray(b))
        for a, b in splitter.split(np.zeros(rows.size), y[rows], train_groups)
    ]
    return SplitPlan(strategy, order, train, test, fold_list, dropped)
