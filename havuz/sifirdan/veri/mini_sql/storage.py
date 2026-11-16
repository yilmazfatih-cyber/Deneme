"""Bellek içi tablolar ve dizinler; kısıtlar (NOT NULL, UNIQUE, PRIMARY KEY) burada denetlenir.

- Satırlar `rowid → tuple` sözlüğündedir; tarama rowid sırasıyladır (SQLite gibi).
- `INTEGER PRIMARY KEY` sütunu rowid'in kendisidir; NULL verilirse en büyük rowid + 1 atanır.
- Dizin: NULL olmayan anahtarların sıralı [(sıralama_anahtarı, rowid)] listesi; `bisect` ile
  eşitlik ve aralık araması. UNIQUE/PRIMARY KEY sütunları otomatik bir tekil dizin alır.
- Deyim atomikliği: `snapshot()`/`restore()`; bir kısıt bozulursa deyimin bütün etkisi geri alınır.

Genişletme: çok sütunlu dizin → anahtarı değer demetinin `sort_key` demeti yapın; `lookup_*` aynı
kalır.
"""

from __future__ import annotations

import bisect
from collections.abc import Iterator
from dataclasses import dataclass, field

from .errors import ConstraintError, SqlError
from .syntax import Value
from .values import apply_affinity, sort_key

Row = tuple[Value, ...]
SortKey = tuple[int, Value]
_TOP = float("inf")  # bir anahtarın bütün rowid'lerinden büyük


@dataclass(frozen=True)
class ColumnInfo:
    name: str
    type_name: str
    affinity: str
    primary_key: bool = False
    not_null: bool = False
    unique: bool = False
    default: Value = None


@dataclass
class Index:
    name: str
    table: str
    column: int  # tablodaki sütun konumu
    column_name: str
    unique: bool
    entries: list[tuple[SortKey, int]] = field(default_factory=list)

    def insert(self, value: Value, rowid: int) -> None:
        if value is not None:
            bisect.insort(self.entries, (sort_key(value), rowid))

    def remove(self, value: Value, rowid: int) -> None:
        if value is not None:
            position = bisect.bisect_left(self.entries, (sort_key(value), rowid))
            del self.entries[position]

    def lookup_eq(self, value: Value) -> list[int]:
        if value is None:
            return []
        key = sort_key(value)
        lo = bisect.bisect_left(self.entries, (key,))
        hi = bisect.bisect_right(self.entries, (key, _TOP))
        return [rowid for _, rowid in self.entries[lo:hi]]

    def lookup_range(
        self, low: Value | None, low_inclusive: bool, high: Value | None, high_inclusive: bool
    ) -> list[int]:
        """[low, high] aralığındaki rowid'ler (None = sınırsız), anahtar sırasıyla."""
        start, end = 0, len(self.entries)
        if low is not None:
            key = sort_key(low)
            start = (
                bisect.bisect_left(self.entries, (key,))
                if low_inclusive
                else bisect.bisect_right(self.entries, (key, _TOP))
            )
        if high is not None:
            key = sort_key(high)
            end = (
                bisect.bisect_right(self.entries, (key, _TOP))
                if high_inclusive
                else bisect.bisect_left(self.entries, (key,))
            )
        return [rowid for _, rowid in self.entries[start:end]]


class Table:
    def __init__(self, name: str, columns: list[ColumnInfo]) -> None:
        self.name = name
        self.columns = columns
        self.rows: dict[int, Row] = {}
        self.indexes: dict[str, Index] = {}
        self.rowid_column: int | None = None
        for position, column in enumerate(columns):
            # SQLite: yalnız tam olarak "INTEGER PRIMARY KEY" yazılan sütun rowid'in takma adıdır.
            if column.primary_key and column.type_name.lower() == "integer":
                self.rowid_column = position
        for position, column in enumerate(columns):
            needs_index = column.unique or (column.primary_key and position != self.rowid_column)
            if needs_index:
                self.add_index(f"oto_{name}_{column.name}", position, unique=True)

    def column_position(self, name: str) -> int:
        for position, column in enumerate(self.columns):
            if column.name == name:
                return position
        raise SqlError(f"{self.name} tablosunda '{name}' sütunu yok.")

    def add_index(self, name: str, position: int, unique: bool) -> Index:
        index = Index(name, self.name, position, self.columns[position].name, unique)
        for rowid, row in self.rows.items():
            if unique and index.lookup_eq(row[position]):
                raise ConstraintError(
                    f"UNIQUE dizini kurulamıyor: {self.name} yinelenen değer içeriyor"
                )
            index.insert(row[position], rowid)
        self.indexes[name] = index
        return index

    def scan(self) -> Iterator[tuple[int, Row]]:
        for rowid in sorted(self.rows):
            yield rowid, self.rows[rowid]

    # ── Değiştirme ──────────────────────────────────────────────────────────────────────────────

    def _prepare(self, values: list[Value]) -> Row:
        prepared: list[Value] = []
        for position, (column, value) in enumerate(zip(self.columns, values, strict=True)):
            converted = apply_affinity(value, column.affinity)
            if converted is None and column.not_null and position != self.rowid_column:
                raise ConstraintError(f"NOT NULL kısıtı ihlal edildi: {self.name}.{column.name}")
            prepared.append(converted)
        return tuple(prepared)

    def _check_unique(self, row: Row, rowid: int) -> None:
        for index in self.indexes.values():
            if index.unique and any(other != rowid for other in index.lookup_eq(row[index.column])):
                column = self.columns[index.column].name
                raise ConstraintError(f"UNIQUE kısıtı ihlal edildi: {self.name}.{column}")

    def insert(self, values: list[Value]) -> int:
        row = self._prepare(values)
        if self.rowid_column is not None and row[self.rowid_column] is not None:
            rowid = row[self.rowid_column]
            if not isinstance(rowid, int):
                raise ConstraintError(
                    f"{self.name}: INTEGER PRIMARY KEY tamsayı olmalı ({rowid!r})"
                )
            if rowid in self.rows:
                column = self.columns[self.rowid_column].name
                raise ConstraintError(f"UNIQUE kısıtı ihlal edildi: {self.name}.{column}")
        else:
            rowid = max(self.rows, default=0) + 1
            if self.rowid_column is not None:
                row = (*row[: self.rowid_column], rowid, *row[self.rowid_column + 1 :])
        self._check_unique(row, rowid)
        self.rows[rowid] = row
        for index in self.indexes.values():
            index.insert(row[index.column], rowid)
        return rowid

    def update(self, rowid: int, values: list[Value]) -> None:
        old = self.rows[rowid]
        row = self._prepare(values)
        new_rowid = rowid
        if self.rowid_column is not None:
            candidate = row[self.rowid_column]
            if not isinstance(candidate, int):
                raise ConstraintError(
                    f"{self.name}: INTEGER PRIMARY KEY tamsayı olmalı ({candidate!r})"
                )
            if candidate != rowid and candidate in self.rows:
                column = self.columns[self.rowid_column].name
                raise ConstraintError(f"UNIQUE kısıtı ihlal edildi: {self.name}.{column}")
            new_rowid = candidate
        for index in self.indexes.values():
            index.remove(old[index.column], rowid)
        del self.rows[rowid]
        self._check_unique(row, new_rowid)
        self.rows[new_rowid] = row
        for index in self.indexes.values():
            index.insert(row[index.column], new_rowid)

    def delete(self, rowid: int) -> None:
        row = self.rows.pop(rowid)
        for index in self.indexes.values():
            index.remove(row[index.column], rowid)

    def snapshot(self) -> tuple[dict[int, Row], dict[str, list[tuple[SortKey, int]]]]:
        return dict(self.rows), {name: list(index.entries) for name, index in self.indexes.items()}

    def restore(self, state: tuple[dict[int, Row], dict[str, list[tuple[SortKey, int]]]]) -> None:
        self.rows = state[0]
        for name, entries in state[1].items():
            self.indexes[name].entries = entries
