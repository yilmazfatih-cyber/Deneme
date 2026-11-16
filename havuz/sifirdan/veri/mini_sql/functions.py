"""İşlev kayıtları: satır işlevleri (abs, length, ...) ve kümeleme işlevleri (count, sum, avg, min,
max).

Satır işlevi = (en az argüman, en çok argüman, Python işlevi). Kümeleme işlevi = başlangıç durumu,
adım ve sonuç işlevleri olan küçük bir sınıf. `lower`/`upper` SQLite gibi YALNIZ ASCII harfleri
çevirir; Türkçe doğru büyük/küçük harf için `lower_tr`/`upper_tr` vardır ('I' → 'ı', 'i' → 'İ').

Genişletme: YENİ SATIR İŞLEVİ → `SCALAR_FUNCTIONS`'a bir satır; YENİ KÜMELEME → `Aggregator`'dan bir
sınıf ve `AGGREGATES`'e bir satır. İkisine de tests/mini_sql/test_values.py'de bir test ekleyin.
"""

from __future__ import annotations

import math
import re
from abc import ABC, abstractmethod
from collections.abc import Callable

from .errors import SqlError
from .syntax import Value
from .values import compare, sort_key, to_number, to_text

_ASCII_UPPER = str.maketrans("abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
_ASCII_LOWER = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")


def _text_fn(transform: Callable[[str], str]) -> Callable[[list[Value]], Value]:
    def apply(args: list[Value]) -> Value:
        text = to_text(args[0])
        return None if text is None else transform(text)

    return apply


def upper_tr(text: str) -> str:
    """Türkçe büyük harf: i → İ, ı → I (str.upper() 'i'yi 'I' yapar, bu yanlıştır)."""
    return text.replace("i", "İ").replace("ı", "I").upper()


def lower_tr(text: str) -> str:
    """Türkçe küçük harf: İ → i, I → ı (str.lower() 'İ'yi 'i' + U+0307 yapar, bu yanlıştır)."""
    return text.replace("İ", "i").replace("I", "ı").lower()


def _abs(args: list[Value]) -> Value:
    value = args[0]
    if value is None:
        return None
    number = to_number(value)
    if number == -(2**63):
        raise SqlError("abs(): tamsayı taşması")
    return abs(number)


def _length(args: list[Value]) -> Value:
    value = args[0]
    if value is None:
        return None
    if isinstance(value, bytes):
        return len(value)
    text = to_text(value)
    return None if text is None else len(text)


def _substr(args: list[Value]) -> Value:
    """SQLite substr(X, Y[, Z]): 1'den sayılır; negatif Y sondan, negatif Z öncesini alır."""
    text = to_text(args[0])
    if text is None or args[1] is None or (len(args) == 3 and args[2] is None):
        return None
    start = int(to_number(args[1]))
    length = int(to_number(args[2])) if len(args) == 3 else 2**31  # yoksa "sona kadar"
    negative_length = length < 0
    length = abs(length)
    if start < 0:
        start += len(text)
        if start < 0:
            length = max(0, length + start)
            start = 0
    elif start > 0:
        start -= 1
    elif length > 0:
        length -= 1
    if negative_length:
        start -= length
        if start < 0:
            length += start
            start = 0
    return text[start : start + length]


def _coalesce(args: list[Value]) -> Value:
    return next((value for value in args if value is not None), None)


def _nullif(args: list[Value]) -> Value:
    return None if compare(args[0], args[1]) == 0 else args[0]


def _typeof(args: list[Value]) -> Value:
    names = {type(None): "null", int: "integer", float: "real", str: "text", bytes: "blob"}
    return names[type(args[0])]


ScalarFunction = tuple[int, int, Callable[[list[Value]], Value]]

SCALAR_FUNCTIONS: dict[str, ScalarFunction] = {
    "abs": (1, 1, _abs),
    "length": (1, 1, _length),
    "lower": (1, 1, _text_fn(lambda text: text.translate(_ASCII_LOWER))),
    "upper": (1, 1, _text_fn(lambda text: text.translate(_ASCII_UPPER))),
    "lower_tr": (1, 1, _text_fn(lower_tr)),
    "upper_tr": (1, 1, _text_fn(upper_tr)),
    "substr": (2, 3, _substr),
    "coalesce": (2, 99, _coalesce),
    "ifnull": (2, 2, _coalesce),
    "nullif": (2, 2, _nullif),
    "typeof": (1, 1, _typeof),
    # YENİ SATIR İŞLEVİ BURAYA: "ad": (en_az, en_çok, işlev),
}


# ── Kümeleme işlevleri ──────────────────────────────────────────────────────────────────────────


class Aggregator(ABC):
    """Bir grubun kümeleme durumu. NULL değerler `step`e hiç gelmez (count(*) dışında)."""

    @abstractmethod
    def step(self, value: Value) -> None:
        """Gruba bir değer ekler."""

    @abstractmethod
    def result(self) -> Value:
        """Grubun sonucu."""


class Count(Aggregator):
    def __init__(self) -> None:
        self.count = 0

    def step(self, value: Value) -> None:
        self.count += 1

    def result(self) -> Value:
        return self.count


_INTEGER_TEXT = re.compile(r"\s*[+-]?\d+\s*")
_INT_MIN, _INT_MAX = -(2**63), 2**63 - 1


def _numeric(value: Value) -> tuple[int | float, bool]:
    """sqlite3_value_numeric_type gibi: (sayı, tamsayı_mı). '12' tamsayı, '3.0' ve '12abc' REAL."""
    if isinstance(value, int):
        return value, True
    if isinstance(value, str) and _INTEGER_TEXT.fullmatch(value):
        number = int(value)
        if _INT_MIN <= number <= _INT_MAX:
            return number, True
    return float(to_number(value)), False


class Sum(Aggregator):
    """SQLite'ın sum() algoritması: tamsayılar kesin toplanır; ilk REAL'da (ya da taşmada)
    Kahan-Babuška-Neumaier dengeli toplamasına geçilir. Sonuç bit bit SQLite ile aynıdır (testli).
    """

    def __init__(self) -> None:
        self.count = 0
        self.int_sum = 0
        self.approx = False  # REAL görüldü mü?
        self.overflow = False
        self.r_sum = 0.0
        self.r_err = 0.0  # dengeleme (hata) terimi

    def _kbn(self, number: float) -> None:
        total = self.r_sum + number
        if abs(self.r_sum) > abs(number):
            self.r_err += (self.r_sum - total) + number
        else:
            self.r_err += (number - total) + self.r_sum
        self.r_sum = total

    def _kbn_int(self, number: int) -> None:
        if abs(number) >= 2**52:  # double'a kayıpsız sığmaz: iki parçada ekle
            small = abs(number) % 16384 * (1 if number >= 0 else -1)
            self._kbn(float(number - small))
            self._kbn(float(small))
        else:
            self._kbn(float(number))

    def _switch_to_real(self) -> None:
        self.approx = True
        if abs(self.int_sum) >= 2**52:
            small = abs(self.int_sum) % 16384 * (1 if self.int_sum >= 0 else -1)
            self.r_sum, self.r_err = float(self.int_sum - small), float(small)
        else:
            self.r_sum, self.r_err = float(self.int_sum), 0.0

    def step(self, value: Value) -> None:
        number, is_integer = _numeric(value)
        self.count += 1
        if self.approx:
            if is_integer:
                self._kbn_int(int(number))
            else:
                self.overflow = False
                self._kbn(float(number))
        elif not is_integer:
            self._switch_to_real()
            self._kbn(float(number))
        elif _INT_MIN <= self.int_sum + int(number) <= _INT_MAX:
            self.int_sum += int(number)
        else:
            self.overflow = True
            self._switch_to_real()
            self._kbn_int(int(number))

    def real_total(self) -> float:
        return self.r_sum + self.r_err if math.isfinite(self.r_err) else self.r_sum

    def result(self) -> Value:
        if self.count == 0:
            return None
        if not self.approx:
            return self.int_sum
        if self.overflow:
            raise SqlError("sum(): tamsayı taşması")
        return self.real_total()


class Avg(Sum):
    def result(self) -> Value:
        if self.count == 0:
            return None
        total = self.real_total() if self.approx else float(self.int_sum)
        return total / self.count


class Min(Aggregator):
    def __init__(self) -> None:
        self.best: Value = None

    def better(self, candidate: Value) -> bool:
        return sort_key(candidate) < sort_key(self.best)

    def step(self, value: Value) -> None:
        if self.best is None or self.better(value):
            self.best = value

    def result(self) -> Value:
        return self.best


class Max(Min):
    def better(self, candidate: Value) -> bool:
        return sort_key(candidate) > sort_key(self.best)


AGGREGATES: dict[str, type[Aggregator]] = {
    "count": Count,
    "sum": Sum,
    "avg": Avg,
    "min": Min,
    "max": Max,
    # YENİ KÜMELEME BURAYA: "ad": SınıfAdı,
}


def is_aggregate(name: str, arg_count: int) -> bool:
    """min/max tek argümanla kümeleme işlevidir (SQLite'ta çok argümanlı min/max yoktur burada)."""
    return name in AGGREGATES and arg_count <= 1
