"""İşlev kayıtları: satır işlevleri (abs, length, ...) ve kümeleme işlevleri (count, sum, avg, min, max).

Satır işlevi = (en az argüman, en çok argüman, Python işlevi). Kümeleme işlevi = başlangıç durumu,
adım ve sonuç işlevleri olan küçük bir sınıf. `lower`/`upper` SQLite gibi YALNIZ ASCII harfleri çevirir;
Türkçe doğru büyük/küçük harf için `lower_tr`/`upper_tr` vardır ('I' → 'ı', 'i' → 'İ').

Genişletme: YENİ SATIR İŞLEVİ → `SCALAR_FUNCTIONS`'a bir satır; YENİ KÜMELEME → `Aggregator`'dan bir
sınıf ve `AGGREGATES`'e bir satır. İkisine de tests/mini_sql/test_values.py'de bir test ekleyin.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

from .errors import SqlError
from .syntax import Value
from .values import arithmetic, compare, sort_key, to_number, to_text

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
    """Türkçe küçük harf: İ → i, I → ı (str.lower() 'İ'yi 'i̇' yapar, bu yanlıştır)."""
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


class Sum(Aggregator):
    """Değer yoksa NULL; tamsayılar tamsayı kalır, REAL ya da metin karışınca REAL."""

    def __init__(self) -> None:
        self.total: Value = None

    def step(self, value: Value) -> None:
        number = to_number(value)
        if isinstance(value, str) and isinstance(number, int):
            number = float(number)  # SQLite: metin toplanırsa sonuç REAL olur
        self.total = number if self.total is None else arithmetic("+", self.total, number)

    def result(self) -> Value:
        return self.total


class Avg(Sum):
    def __init__(self) -> None:
        super().__init__()
        self.count = 0

    def step(self, value: Value) -> None:
        super().step(value)
        self.count += 1

    def result(self) -> Value:
        return None if self.total is None else float(to_number(self.total)) / self.count


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
