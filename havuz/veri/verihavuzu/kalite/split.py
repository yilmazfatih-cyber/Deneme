"""Sızıntısız ayırma: zamana göre, gruba göre ve katmanlı (etiket oranlarını koruyan) ayırma.

Neden önemli: rastgele ayırmada aynı müşterinin satırları hem eğitime hem teste düşer ya da
gelecekteki satırlar eğitime girer; model sınavda "kopya çeker", başarı olduğundan iyi görünür.
  - ``time_split``    : eğitimdeki en geç zaman < testteki en erken zaman (+ isteğe bağlı boşluk).
  - ``group_split``   : bir grubun (ör. müşteri) bütün satırları aynı tarafa düşer.
  - ``stratified_split``: her etiketin oranı iki tarafta da korunur.
Hepsi belirlenimcidir (tohum) ve satırların ilk sırasını korur. ``leakage_report`` iki küme
arasında ortak anahtar değerlerini sayar.
Genişletme: yeni bir ayırma için aynı ``SplitResult``ı döndüren bir işlev yazın ve CLI'deki
``ayir`` komutunun ``--yontem`` seçeneklerine ekleyin.
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any

from verihavuzu.calendar_tr import parse_date_tr
from verihavuzu.sentetik.base import Rng

Row = dict[str, Any]


@dataclass
class SplitResult:
    egitim: list[Row]
    test: list[Row]
    bilgi: dict[str, Any] = field(default_factory=dict)


def _moment(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime(value.year, value.month, value.day)
    text = str(value).strip()
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        day = parse_date_tr(text)
        if day is None:
            raise ValueError(f"Zaman okunamadı: {text!r}") from None
        return datetime(day.year, day.month, day.day)


def time_split(
    rows: Sequence[Row],
    time_column: str,
    *,
    test_fraction: float = 0.2,
    cutoff: datetime | None = None,
    gap: timedelta = timedelta(0),
) -> SplitResult:
    """Kesim anından önceki satırlar eğitim, kesim + ``gap`` sonrası test; aradakiler atılır."""
    moments = [_moment(row[time_column]) for row in rows]
    if cutoff is None:
        ordered = sorted(moments)
        cutoff = ordered[min(len(ordered) - 1, int(len(ordered) * (1 - test_fraction)))]
    train = [row for row, m in zip(rows, moments, strict=True) if m < cutoff]
    test = [row for row, m in zip(rows, moments, strict=True) if m >= cutoff + gap]
    info = {
        "yontem": "zaman",
        "kesim": cutoff.isoformat(),
        "bosluk_gun": gap.days,
        "atilan": len(rows) - len(train) - len(test),
    }
    return SplitResult(train, test, info)


def _bucket(seed: int, key: str) -> float:
    digest = hashlib.sha256(f"{seed}:{key}".encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def group_split(
    rows: Sequence[Row], group_column: str, *, test_fraction: float = 0.2, seed: int = 0
) -> SplitResult:
    """Grup anahtarının özeti (hash) ile ayırır: aynı grup her zaman aynı tarafa düşer."""
    train: list[Row] = []
    test: list[Row] = []
    for row in rows:
        (test if _bucket(seed, str(row[group_column])) < test_fraction else train).append(row)
    groups_test = len({str(row[group_column]) for row in test})
    groups_train = len({str(row[group_column]) for row in train})
    info = {
        "yontem": "grup",
        "grup_sutunu": group_column,
        "egitim_grup": groups_train,
        "test_grup": groups_test,
    }
    return SplitResult(train, test, info)


def stratified_split(
    rows: Sequence[Row], label_column: str, *, test_fraction: float = 0.2, seed: int = 0
) -> SplitResult:
    """Her etiketten ``round(n × oran)`` satırı teste ayırır; oranlar iki tarafta korunur."""
    by_label: dict[str, list[int]] = {}
    for index, row in enumerate(rows):
        by_label.setdefault(str(row[label_column]), []).append(index)
    test_indices: set[int] = set()
    for label in sorted(by_label):
        indices = list(by_label[label])
        Rng(seed, f"katman/{label}").shuffle(indices)
        test_indices.update(indices[: round(len(indices) * test_fraction)])
    train = [row for i, row in enumerate(rows) if i not in test_indices]
    test = [row for i, row in enumerate(rows) if i in test_indices]
    counts = {label: len(indices) for label, indices in sorted(by_label.items())}
    return SplitResult(train, test, {"yontem": "katmanli", "etiket_sayilari": counts})


def leakage_report(
    train: Sequence[Row], test: Sequence[Row], key_columns: Sequence[str]
) -> dict[str, Any]:
    """İki kümede de görülen anahtar değerleri (ör. müşteri) — sızıntı belirtisi."""
    report: dict[str, Any] = {}
    for column in key_columns:
        shared = {str(r.get(column)) for r in train} & {str(r.get(column)) for r in test}
        report[column] = {"ortak_deger": len(shared), "ornekler": sorted(shared)[:5]}
    return report
