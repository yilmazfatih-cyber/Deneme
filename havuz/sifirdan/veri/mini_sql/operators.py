"""Yürütücü işleçleri (volcano / yineleyici modeli): her işleç alt işlecinden satır çeker, satır
verir.

Her işlecin `rows()` üreteci "sıradaki satırı ver" (next) çağrısıdır; zincirin en üstü çekildikçe
aşağıya doğru tek tek satır akar. `Sort`, `Aggregate`, `Distinct` ve birleşmelerin sağ tarafı
girdiyi toplar (materialize). `describe()` EXPLAIN satırını üretir.

Genişletme: yeni işleç → `Operator`'dan türeyin, `rows`/`describe`/`children` yazın, planner'da
kullanın.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Iterator

from .compile import Evaluator, Row
from .functions import AGGREGATES, Aggregator
from .storage import Index, Table
from .syntax import Value
from .values import sort_key, truth


class Operator(ABC):
    @abstractmethod
    def rows(self) -> Iterator[Row]:
        """Satırları sırayla üretir."""

    @abstractmethod
    def describe(self) -> str:
        """EXPLAIN'de görünen tek satırlık açıklama."""

    def children(self) -> list[Operator]:
        return []


class OneRow(Operator):
    """FROM'suz SELECT için tek, boş satır (`SELECT 1 + 1`)."""

    def rows(self) -> Iterator[Row]:
        yield ()

    def describe(self) -> str:
        return "OneRow"


class SeqScan(Operator):
    def __init__(self, table: Table, alias: str) -> None:
        self.table, self.alias = table, alias

    def rows(self) -> Iterator[Row]:
        for _, row in self.table.scan():
            yield row

    def describe(self) -> str:
        name = self.table.name
        return f"SeqScan {name}" + (f" AS {self.alias}" if self.alias != name else "")


class IndexScan(Operator):
    """Dizinden aday rowid'leri bulur. Koşulun tamamı yine üstteki Filter'da denetlenir."""

    def __init__(self, table: Table, alias: str, index: Index, lookup: IndexLookup) -> None:
        self.table, self.alias, self.index, self.lookup = table, alias, index, lookup

    def rows(self) -> Iterator[Row]:
        seen: set[int] = set()
        for rowid in self.lookup.rowids(self.index):
            if rowid not in seen and rowid in self.table.rows:
                seen.add(rowid)
                yield self.table.rows[rowid]

    def describe(self) -> str:
        return f"IndexScan {self.table.name} USING {self.index.name} ({self.lookup.text})"


class IndexLookup:
    """Dizin araması: eşitlik değerleri ya da [alt, üst] aralığı."""

    def __init__(
        self,
        text: str,
        equals: list[Value] | None = None,
        low: tuple[Value, bool] | None = None,
        high: tuple[Value, bool] | None = None,
    ) -> None:
        self.text, self.equals, self.low, self.high = text, equals, low, high

    def rowids(self, index: Index) -> list[int]:
        if self.equals is not None:
            return [rowid for value in self.equals for rowid in index.lookup_eq(value)]
        low, low_inclusive = self.low if self.low else (None, True)
        high, high_inclusive = self.high if self.high else (None, True)
        return index.lookup_range(low, low_inclusive, high, high_inclusive)


class Filter(Operator):
    def __init__(self, child: Operator, predicate: Evaluator, text: str) -> None:
        self.child, self.predicate, self.text = child, predicate, text

    def rows(self) -> Iterator[Row]:
        for row in self.child.rows():
            if truth(self.predicate(row)) == 1:  # NULL ve 0 elenir
                yield row

    def describe(self) -> str:
        return f"Filter {self.text}"

    def children(self) -> list[Operator]:
        return [self.child]


class NestedLoopJoin(Operator):
    """Sol her satır için sağın bütün satırları denenir. LEFT: eşi yoksa sağ taraf NULL."""

    def __init__(
        self, left: Operator, right: Operator, kind: str, condition: Evaluator | None, text: str
    ) -> None:
        self.left, self.right, self.kind, self.condition, self.text = (
            left, right, kind, condition, text,
        )  # fmt: skip
        self.right_width = 0

    def rows(self) -> Iterator[Row]:
        right_rows = list(self.right.rows())  # sağ taraf bir kez okunur (blok iç içe döngü)
        empty = (None,) * self.right_width
        for left_row in self.left.rows():
            matched = False
            for right_row in right_rows:
                row = left_row + right_row
                if self.condition is None or truth(self.condition(row)) == 1:
                    matched = True
                    yield row
            if self.kind == "left" and not matched:
                yield left_row + empty

    def describe(self) -> str:
        on = f" ON {self.text}" if self.text else ""
        return f"NestedLoopJoin {self.kind.upper()}{on}"

    def children(self) -> list[Operator]:
        return [self.left, self.right]


class HashJoin(Operator):
    """Eşitlik birleşmesi: sağ taraf anahtarına göre sözlüğe konur, sol satırlar sözlükte aranır."""

    def __init__(
        self,
        left: Operator,
        right: Operator,
        kind: str,
        keys: tuple[Evaluator, Evaluator],
        residual: Evaluator | None,
        text: str,
    ) -> None:
        self.left, self.right, self.kind, self.keys, self.residual, self.text = (
            left, right, kind, keys, residual, text,
        )  # fmt: skip
        self.right_width = 0

    def rows(self) -> Iterator[Row]:
        left_key, right_key = self.keys
        buckets: dict[Value, list[Row]] = {}
        for right_row in self.right.rows():
            key = right_key(right_row)
            # NULL hiçbir şeye eşit değildir. 3 ile 3.0 Python'da aynı sözlük anahtarıdır; metin ile
            # sayı ayrı kalır: bu, SQL eşitliğiyle (values.compare) birebir aynıdır.
            if key is not None:
                buckets.setdefault(key, []).append(right_row)
        empty = (None,) * self.right_width
        for left_row in self.left.rows():
            key = left_key(left_row)
            matched = False
            for right_row in [] if key is None else buckets.get(key, []):
                row = left_row + right_row
                if self.residual is None or truth(self.residual(row)) == 1:
                    matched = True
                    yield row
            if self.kind == "left" and not matched:
                yield left_row + empty

    def describe(self) -> str:
        return f"HashJoin {self.kind.upper()} ON {self.text}"

    def children(self) -> list[Operator]:
        return [self.left, self.right]


class Aggregate(Operator):
    """Gruplama: çıktı satırı = gruplama değerleri + kümeleme sonuçları. GROUP BY yoksa tek grup."""

    def __init__(
        self,
        child: Operator,
        groups: list[Evaluator],
        aggregates: list[tuple[str, Evaluator | None, bool]],  # (ad, argüman, distinct)
        text: str,
    ) -> None:
        self.child, self.groups, self.aggregates, self.text = child, groups, aggregates, text

    def rows(self) -> Iterator[Row]:
        states: dict[tuple[Value, ...], tuple[list[Aggregator], list[set[Value]]]] = {}
        for row in self.child.rows():
            key = tuple(group(row) for group in self.groups)
            if key not in states:
                states[key] = (
                    [AGGREGATES[n]() for n, _, _ in self.aggregates],
                    [set() for _ in self.aggregates],
                )
            accumulators, seen = states[key]
            for position, (_, argument, distinct) in enumerate(self.aggregates):
                value: Value = 1 if argument is None else argument(row)  # count(*): her satır
                if value is None or (distinct and value in seen[position]):
                    continue
                if distinct:
                    seen[position].add(value)
                accumulators[position].step(value)
        if not states and not self.groups:  # GROUP BY'sız boş girdi: yine tek satır
            states[()] = ([AGGREGATES[n]() for n, _, _ in self.aggregates], [])
        for key in sorted(states, key=lambda k: [sort_key(v) for v in k]):
            yield key + tuple(acc.result() for acc in states[key][0])

    def describe(self) -> str:
        return f"Aggregate {self.text}"

    def children(self) -> list[Operator]:
        return [self.child]


class Project(Operator):
    def __init__(self, child: Operator, exprs: list[Evaluator], text: str) -> None:
        self.child, self.exprs, self.text = child, exprs, text

    def rows(self) -> Iterator[Row]:
        for row in self.child.rows():
            yield tuple(expr(row) for expr in self.exprs)

    def describe(self) -> str:
        return f"Project {self.text}"

    def children(self) -> list[Operator]:
        return [self.child]


class Distinct(Operator):
    def __init__(self, child: Operator) -> None:
        self.child = child

    def rows(self) -> Iterator[Row]:
        seen: set[Row] = set()
        for row in self.child.rows():
            if row not in seen:  # NULL'lar birbirine eşit sayılır (SQL DISTINCT kuralı)
                seen.add(row)
                yield row

    def describe(self) -> str:
        return "Distinct"

    def children(self) -> list[Operator]:
        return [self.child]


class Sort(Operator):
    def __init__(self, child: Operator, keys: list[tuple[int, bool]], text: str) -> None:
        self.child, self.keys, self.text = child, keys, text

    def rows(self) -> Iterator[Row]:
        rows = list(self.child.rows())
        for position, descending in reversed(self.keys):  # kararlı sıralama: sondan başa
            rows.sort(key=_column_key(position), reverse=descending)
        yield from rows

    def describe(self) -> str:
        return f"Sort {self.text}"

    def children(self) -> list[Operator]:
        return [self.child]


def _column_key(position: int) -> Callable[[Row], tuple[int, Value]]:
    return lambda row: sort_key(row[position])


class Limit(Operator):
    def __init__(self, child: Operator, limit: int | None, offset: int) -> None:
        self.child, self.limit, self.offset = child, limit, offset

    def rows(self) -> Iterator[Row]:
        if self.limit == 0:
            return
        produced = 0
        for position, row in enumerate(self.child.rows()):
            if position < self.offset:
                continue
            yield row
            produced += 1
            if self.limit is not None and produced >= self.limit:
                return  # alt işleçten bir satır bile fazla çekilmez

    def describe(self) -> str:
        return f"Limit {'∞' if self.limit is None else self.limit} OFFSET {self.offset}"

    def children(self) -> list[Operator]:
        return [self.child]


def explain_lines(root: Operator, depth: int = 0) -> list[str]:
    lines = ["  " * depth + root.describe()]
    for child in root.children():
        lines += explain_lines(child, depth + 1)
    return lines
