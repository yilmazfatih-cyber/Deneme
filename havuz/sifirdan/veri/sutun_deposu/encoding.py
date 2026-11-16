"""Sütun kodlamaları: düz (plain), sözlük (dictionary) ve çalışma uzunluğu (RLE).

- Düz: değerlerin kendisi; yalnız tamsayıysa `array('q')`, yalnız ondalıksa `array('d')` (değer
  başına 8 bayt, nesne yok), karışıksa liste.
- Sözlük: farklı değerler bir kez saklanır, satırda yalnız kod: "İzmir" 100 bin kez yerine bir kez
  + 100 bin küçük kod. Kod türü en küçük yetendir (≤ 256 farklı değer → 1 bayt). Koşul her FARKLI
  değer için bir kez değerlendirilir; 1 baytlık kodlarda maske `bytes.translate` ile tek C
  döngüsünde çıkar.
- RLE: ardışık aynı değerler (değer, tekrar) çiftine iner: sıralı ya da az değişen sütunda çok
  küçüktür; koşul çalışma başına bir kez değerlendirilir.

`encode()` seçer: çalışma sayısı satır sayısının dörtte birinden azsa RLE; metin varsa sözlük;
yoksa düz. 1, 1.0 ve "1" her kodlamada ayrı kalır: çözülen değerler türleriyle birlikte aynıdır.

Genişletme: delta kodlama (sıralı zaman damgaları için ardışık farklar) ve bit paketleme (8 farklı
değere 3 bit); seçim kuralı `encode`'dadır.
"""

from __future__ import annotations

import itertools
from array import array
from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass

Value = int | float | str | None
Predicate = Callable[[Value], bool]


@dataclass
class Plain:
    values: Sequence[Value]

    def __len__(self) -> int:
        return len(self.values)

    def __iter__(self) -> Iterator[Value]:
        return iter(self.values)

    def matches(self, test: Predicate) -> bytearray:
        """Satır başına 1 (uyar) ya da 0 (uymaz) baytı."""
        return bytearray(1 if test(value) else 0 for value in self.values)


@dataclass
class Dictionary:
    dictionary: list[Value]
    codes: array[int]

    def __len__(self) -> int:
        return len(self.codes)

    def __iter__(self) -> Iterator[Value]:
        return map(self.dictionary.__getitem__, self.codes)

    def matches(self, test: Predicate) -> bytearray:
        # koşul her FARKLI değer için bir kez
        hits = bytes(1 if test(value) else 0 for value in self.dictionary)
        if self.codes.typecode == "B":  # kod = bayt: çeviri tablosuyla tek geçişte
            return bytearray(self.codes.tobytes().translate(hits.ljust(256, b"\x00")))
        return bytearray(map(hits.__getitem__, self.codes))


@dataclass
class RunLength:
    runs: list[tuple[Value, int]]  # (değer, tekrar)
    length: int

    def __len__(self) -> int:
        return self.length

    def __iter__(self) -> Iterator[Value]:
        for value, count in self.runs:
            yield from itertools.repeat(value, count)

    def matches(self, test: Predicate) -> bytearray:
        out = bytearray()
        for value, count in self.runs:  # koşul çalışma başına bir kez
            out += (b"\x01" if test(value) else b"\x00") * count
        return out


Column = Plain | Dictionary | RunLength


def _runs(values: Sequence[Value]) -> list[tuple[Value, int]]:
    runs: list[tuple[Value, int]] = []
    for value in values:
        if runs and type(runs[-1][0]) is type(value) and runs[-1][0] == value:
            runs[-1] = (runs[-1][0], runs[-1][1] + 1)
        else:
            runs.append((value, 1))
    return runs


def _code_type(distinct: int) -> str:
    """En küçük yeten kod türü: 1, 2 ya da 4 bayt."""
    return "B" if distinct <= 1 << 8 else "H" if distinct <= 1 << 16 else "I"


def encode(values: Sequence[Value]) -> Column:
    runs = _runs(values)
    if len(runs) * 4 < len(values):
        return RunLength(runs, len(values))
    if any(isinstance(value, str) for value in values):
        dictionary: list[Value] = []
        index: dict[tuple[str, Value], int] = {}
        codes: list[int] = []
        for value in values:
            key = (type(value).__name__, value)  # 1, 1.0 ve "1" ayrı kalsın
            if key not in index:
                index[key] = len(dictionary)
                dictionary.append(value)
            codes.append(index[key])
        return Dictionary(dictionary, array(_code_type(len(dictionary)), codes))
    ints = [v for v in values if type(v) is int and -(2**63) <= v < 2**63]
    if values and len(ints) == len(values):
        return Plain(array("q", ints))
    floats = [v for v in values if type(v) is float]
    if values and len(floats) == len(values):
        return Plain(array("d", floats))
    return Plain(list(values))


def encoded_size(column: Column) -> int:
    """Kodlanmış verinin yaklaşık bayt boyu (kodlamaları karşılaştırmak için).

    Metin UTF-8 boyu, öteki değerler 8 bayt, tekrar sayısı 4 bayt; Python nesne ek yükü hariç.
    """

    def size(value: Value) -> int:
        return len(value.encode()) if isinstance(value, str) else 8

    if isinstance(column, Dictionary):
        return sum(map(size, column.dictionary)) + column.codes.itemsize * len(column.codes)
    if isinstance(column, RunLength):
        return sum(size(value) + 4 for value, _ in column.runs)
    return sum(map(size, column.values))
