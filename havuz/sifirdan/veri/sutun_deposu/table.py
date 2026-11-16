"""Sütun tabanlı tablo ve aynı sorguyu satır satır çalıştıran başvuru (satır tabanlı) tablo.

Sorgu: `select(where=[("sehir", "==", "İzmir"), ("tutar", ">", 100)], group_by="sehir",
aggregates=[("*", "count"), ("tutar", "sum")])`. Anlam (iki tabloda AYNI):
- Koşullar VE'lenir; işleçler == != < <= > >= ve in (değer listesi). None hiçbir koşula uymaz (değer
  ya da işlenen None ise); karşılaştırılamayan türler (5 < "a") uymaz; metinler kod noktasıyla
  sıralanır.
- count(*) satır sayar; count(sütun) None olmayanları; sum/avg yalnız sayıları (sayı yoksa None;
  ondalık varsa `math.fsum`); min/max None dışındakiler (sayılar metinlerden önce); boş kümede
  count 0, öteki None.
- Gruplu sonuç grup anahtarına göre sıralıdır: None, sayılar, metinler. 1 ile 1.0 ayrı gruptur.

Sütun tablosu "vektörel" çalışır: her koşul bir sütunun TAMAMINI tarar ve 0/1 baytlık bir seçim
maskesi üretir; maskeler büyük tamsayıya çevrilip tek `&` ile VE'lenir; seçilen değerler
`itertools.compress` ile alınır. Süzgeçsiz ve grupsuz sorguda RLE sütunun sayısı ve tamsayı toplamı
tekrar açılmadan bulunur.

Genişletme: blok başına min/max özeti (zone map) tutup koşula hiç uymayan blokları taramadan
atlayın; yeni işleç → `_OPS`, yeni kümeleme → `KINDS` ve `aggregate`.
"""

from __future__ import annotations

import itertools
import math
import operator
from array import array
from collections.abc import Callable, Collection, Sequence
from typing import Any

from .encoding import Column, Plain, Predicate, RunLength, Value, encode

Filter = tuple[str, str, object]  # (sütun, işleç, işlenen)
Aggregate = tuple[str, str]  # (sütun ya da "*", tür)
KINDS = ("count", "sum", "avg", "min", "max")
_LISTS = (list, tuple, set, frozenset)


def _contains(value: Value, options: object) -> bool:
    return isinstance(options, _LISTS) and value in options


_OPS: dict[str, Callable[[Any, Any], object]] = {
    "==": operator.eq, "!=": operator.ne, "<": operator.lt, "<=": operator.le,
    ">": operator.gt, ">=": operator.ge, "in": _contains,
}  # fmt: skip


def predicate(op: str, operand: object) -> Predicate:
    """Tek değeri sınayan işlev (bkz. dosya başı: None ve karşılaştırılamayan türler uymaz)."""
    if op not in _OPS:
        raise ValueError(f"Bilinmeyen işleç '{op}'. Kullanılabilenler: {' '.join(_OPS)}")
    if op == "in" and not isinstance(operand, _LISTS):
        raise ValueError("'in' işleci değer listesi ister, ör. ('sehir', 'in', ['İzmir', 'Bursa'])")
    compare = _OPS[op]

    def test(value: Value) -> bool:
        if value is None or operand is None:
            return False
        try:
            return bool(compare(value, operand))
        except TypeError:  # 5 < "a" gibi: uymaz
            return False

    return test


def aggregate(kind: str, values: Sequence[Value]) -> Value:
    present = [value for value in values if value is not None]
    if kind == "count":
        return len(present)
    if kind in ("sum", "avg"):
        numbers = [value for value in present if isinstance(value, int | float)]
        if not numbers:
            return None
        if kind == "avg":
            return math.fsum(numbers) / len(numbers)
        return math.fsum(numbers) if any(isinstance(n, float) for n in numbers) else sum(numbers)
    if kind in ("min", "max"):
        if not present:
            return None
        return min(present, key=_order) if kind == "min" else max(present, key=_order)
    raise ValueError(f"Bilinmeyen kümeleme '{kind}'. Kullanılabilenler: {' '.join(KINDS)}")


def _order(value: Value) -> tuple[int, Value]:
    """Karışık türler için sıralama anahtarı: None < sayılar < metinler."""
    if value is None:
        return (0, None)
    return (2, value) if isinstance(value, str) else (1, value)


def _group_order(row: tuple[Value, ...]) -> tuple[int, Value]:
    return _order(row[0])


def _validate(
    names: Collection[str], where: Sequence[Filter], group_by: str | None, aggs: Sequence[Aggregate]
) -> list[tuple[str, Predicate]]:
    """Sorguyu denetler (iki tabloda aynı hatalar) ve koşul işlevlerini kurar."""
    for name, kind in aggs:
        if kind not in KINDS or (name == "*" and kind != "count"):
            kinds = " ".join(KINDS)
            raise ValueError(
                f"Geçersiz kümeleme ({name}, {kind}): türler {kinds}; '*' yalnız count"
            )
    used = [name for name, _, _ in where] + [name for name, _ in aggs if name != "*"]
    for name in used + ([] if group_by is None else [group_by]):
        if name not in names:
            raise ValueError(f"Bilinmeyen sütun '{name}'. Sütunlar: {' '.join(names)}")
    return [(name, predicate(op, operand)) for name, op, operand in where]


class ColumnTable:
    """Her sütun ayrı ve kodlanmış saklanır (bkz. encoding.py)."""

    def __init__(self, columns: dict[str, Column], length: int) -> None:
        self.columns = columns
        self.length = length

    @classmethod
    def from_rows(cls, rows: Sequence[dict[str, Value]], names: Sequence[str]) -> ColumnTable:
        """Satırlardan kurar; satırda olmayan sütun None sayılır."""
        return cls({name: encode([row.get(name) for row in rows]) for name in names}, len(rows))

    def select(
        self,
        where: Sequence[Filter] = (),
        group_by: str | None = None,
        aggregates: Sequence[Aggregate] = (("*", "count"),),
    ) -> list[tuple[Value, ...]]:
        mask = self._mask(_validate(self.columns, where, group_by, aggregates))
        if group_by is None and mask is None:
            return [tuple(self._whole(name, kind) for name, kind in aggregates)]
        columns = {name: self._values(name, mask) for name, _ in aggregates if name != "*"}
        if group_by is None:
            selected = self.length if mask is None else mask.count(1)
            return [
                tuple(selected if n == "*" else aggregate(k, columns[n]) for n, k in aggregates)
            ]
        groups: dict[tuple[str, Value], list[int]] = {}
        for position, key in enumerate(self._values(group_by, mask)):
            groups.setdefault((type(key).__name__, key), []).append(position)
        rows = [
            (key, *(_aggregate(name, kind, columns, positions) for name, kind in aggregates))
            for (_, key), positions in groups.items()
        ]
        return sorted(rows, key=_group_order)

    def _mask(self, tests: list[tuple[str, Predicate]]) -> bytes | None:
        """Bütün koşulları sağlayan satırların 0/1 maskesi (koşul yoksa None = hepsi)."""
        combined: int | None = None
        for name, test in tests:
            # bütün sütun tek geçişte: bayt maskesi → büyük tamsayı → tek `&`
            bits = int.from_bytes(self.columns[name].matches(test), "big")
            combined = bits if combined is None else combined & bits
        return None if combined is None else combined.to_bytes(self.length, "big")

    def _values(self, name: str, mask: bytes | None) -> list[Value]:
        column = self.columns[name]
        return list(column) if mask is None else list(itertools.compress(column, mask))

    def _whole(self, name: str, kind: str) -> Value:
        """Süzgeçsiz kümeleme: tür belli düz sütunda C döngüsüyle; RLE sütunda sayı ve tamsayı
        toplamı tekrarlar açılmadan."""
        if name == "*":
            return self.length
        column = self.columns[name]
        if isinstance(column, Plain) and isinstance(column.values, array) and column.values:
            integers = column.values.typecode == "q"
            numbers: Sequence[int | float] = column.values  # yalnız "q" ya da yalnız "d"; None yok
            if kind == "count":
                return len(numbers)
            if kind == "sum":
                return sum(numbers) if integers else math.fsum(numbers)
            if kind == "avg":
                return math.fsum(numbers) / len(numbers)
            return min(numbers) if kind == "min" else max(numbers)
        if isinstance(column, RunLength) and kind in ("count", "sum"):
            runs = [(value, count) for value, count in column.runs if value is not None]
            if kind == "count":
                return sum(count for _, count in runs)
            total = 0
            for value, count in runs:
                if not isinstance(value, int):
                    break  # ondalık ya da metin var: genel yola
                total += value * count
            else:
                return total if runs else None
        return aggregate(kind, list(column))


def _aggregate(
    name: str, kind: str, columns: dict[str, list[Value]], positions: Sequence[int]
) -> Value:
    if name == "*":
        return len(positions)
    values = columns[name]
    return aggregate(kind, [values[i] for i in positions])


class RowTable:
    """Başvuru: her satırı tek tek gezen, aynı anlamı taşıyan satır tabanlı tablo."""

    def __init__(self, rows: Sequence[dict[str, Value]], names: Sequence[str]) -> None:
        self.rows = list(rows)
        self.names = list(names)

    def select(
        self,
        where: Sequence[Filter] = (),
        group_by: str | None = None,
        aggregates: Sequence[Aggregate] = (("*", "count"),),
    ) -> list[tuple[Value, ...]]:
        tests = _validate(self.names, where, group_by, aggregates)
        chosen = [row for row in self.rows if all(test(row.get(name)) for name, test in tests)]
        if group_by is None:
            return [tuple(_row_aggregate(name, kind, chosen) for name, kind in aggregates)]
        groups: dict[tuple[str, Value], list[dict[str, Value]]] = {}
        for row in chosen:
            key = row.get(group_by)
            groups.setdefault((type(key).__name__, key), []).append(row)
        result = [
            (key, *(_row_aggregate(name, kind, members) for name, kind in aggregates))
            for (_, key), members in groups.items()
        ]
        return sorted(result, key=_group_order)


def _row_aggregate(name: str, kind: str, rows: list[dict[str, Value]]) -> Value:
    if name == "*":
        return len(rows)
    return aggregate(kind, [row.get(name) for row in rows])
