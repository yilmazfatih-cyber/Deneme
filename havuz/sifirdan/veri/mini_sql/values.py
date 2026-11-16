"""Değer anlamı (SQLite ile aynı): üç değerli mantık, karşılaştırma, aritmetik, metin ↔ sayı,
yakınlık.

Değerler Python'da: None (NULL), int (INTEGER), float (REAL), str (TEXT), bytes (BLOB).
Doğruluk değerleri 1 / 0 / None olarak taşınır (SQLite gibi; `True/False` kullanılmaz).
Sıralama: NULL < sayılar < metin < BLOB. Metin karşılaştırması ikili (BINARY) sıradır.

Genişletme: yeni bir tür dönüşümü ya da işleç kuralı buraya; davranışı
tests/mini_sql/test_values.py'de sqlite3 ile karşılaştıran bir satır ekleyin.
"""

from __future__ import annotations

import re

from .syntax import Value

_NUMBER_PREFIX = re.compile(r"\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)")
_INT_MIN, _INT_MAX = -(2**63), 2**63 - 1


def type_rank(value: Value) -> int:
    if value is None:
        return 0
    if isinstance(value, int | float):
        return 1
    if isinstance(value, str):
        return 2
    return 3


def sort_key(value: Value) -> tuple[int, Value]:
    """ORDER BY, dizin ve MIN/MAX için toplam sıra anahtarı (NULL en küçük)."""
    return (type_rank(value), value)


def compare(left: Value, right: Value) -> int | None:
    """-1/0/1; taraflardan biri NULL ise None. Farklı türler tür sırasıyla karşılaştırılır."""
    if left is None or right is None:
        return None
    a, b = sort_key(left), sort_key(right)
    return (a > b) - (a < b)


def truth(value: Value) -> int | None:
    """SQL doğruluğu: NULL → None; sayı → sıfır değilse 1; metin önce sayıya çevrilir."""
    if value is None:
        return None
    number = value if isinstance(value, int | float) else to_number(value)
    return 1 if number != 0 else 0


def logical_not(value: Value) -> int | None:
    t = truth(value)
    return None if t is None else 1 - t


def logical_and(left: Value, right: Value) -> int | None:
    a, b = truth(left), truth(right)
    if a == 0 or b == 0:
        return 0
    return None if a is None or b is None else 1


def logical_or(left: Value, right: Value) -> int | None:
    a, b = truth(left), truth(right)
    if a == 1 or b == 1:
        return 1
    return None if a is None or b is None else 0


def to_number(value: Value) -> int | float:
    """SQLite gibi: metnin en uzun sayısal ön eki (yoksa 0); BLOB → 0."""
    if isinstance(value, int | float):
        return value
    if isinstance(value, bytes):
        value = value.decode(errors="replace")
    if value is None:
        return 0
    match = _NUMBER_PREFIX.match(value)
    if not match:
        return 0
    text = match.group(1)
    if any(ch in text for ch in ".eE"):
        return float(text)
    return _fit(int(text))


def _fit(number: int) -> int | float:
    """64 bit tamsayıya sığmayan sonuç REAL olur (SQLite davranışı)."""
    return number if _INT_MIN <= number <= _INT_MAX else float(number)


def arithmetic(op: str, left: Value, right: Value) -> Value:
    """+ - * / % ; NULL yayılır, sıfıra bölme NULL, tamsayı bölme sıfıra doğru keser."""
    if left is None or right is None:
        return None
    a, b = to_number(left), to_number(right)
    if op in ("+", "-", "*"):
        result = a + b if op == "+" else a - b if op == "-" else a * b
        return _fit(result) if isinstance(result, int) else result
    if op == "/":
        if b == 0:
            return None
        if isinstance(a, int) and isinstance(b, int):
            quotient = abs(a) // abs(b)
            return _fit(quotient if (a >= 0) == (b >= 0) else -quotient)
        return a / b
    if op == "%":
        ia, ib = int(a), int(b)  # SQLite % işlenenleri tamsayıya çevirir
        if ib == 0:
            return None
        remainder = abs(ia) % abs(ib)
        result = remainder if ia >= 0 else -remainder  # işaret bölünenden gelir (C gibi)
        return float(result) if isinstance(a, float) or isinstance(b, float) else result
    raise ValueError(f"bilinmeyen aritmetik işleç {op}")


def to_text(value: Value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, float):
        return real_to_text(value)
    if isinstance(value, bytes):
        return value.decode(errors="replace")
    return str(value)


def real_to_text(value: float) -> str:
    """SQLite'ın REAL yazımı: 100.0 → '100.0', 1e20 → '1.0e+20'."""
    text = repr(value)
    if text in ("inf", "-inf"):
        return text.replace("inf", "Inf")
    if "e" in text:
        mantissa, exponent = text.split("e")
        return f"{mantissa if '.' in mantissa else mantissa + '.0'}e{exponent}"
    return text


def concat(left: Value, right: Value) -> str | None:
    a, b = to_text(left), to_text(right)
    return None if a is None or b is None else a + b


_ASCII_LOWER = str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz")


def like(value: Value, pattern: Value) -> int | None:
    """SQLite LIKE: % ve _ joker; büyük/küçük harf duyarsızlığı YALNIZ ASCII harfler içindir."""
    text, pat = to_text(value), to_text(pattern)
    if text is None or pat is None:
        return None
    regex = "".join(
        ".*" if ch == "%" else "." if ch == "_" else re.escape(ch)
        for ch in pat.translate(_ASCII_LOWER)
    )
    return 1 if re.fullmatch(regex, text.translate(_ASCII_LOWER), re.DOTALL) else 0


def affinity_of(type_name: str) -> str:
    """SQLite yakınlık kuralları (datatype3 §3.1): INTEGER, TEXT, BLOB, REAL ya da NUMERIC."""
    upper = type_name.upper()
    if "INT" in upper:
        return "INTEGER"
    if any(word in upper for word in ("CHAR", "CLOB", "TEXT")):
        return "TEXT"
    if "BLOB" in upper or not upper:
        return "BLOB"
    if any(word in upper for word in ("REAL", "FLOA", "DOUB")):
        return "REAL"
    return "NUMERIC"


_WHOLE_NUMBER = re.compile(r"\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?\s*")


def apply_affinity(value: Value, affinity: str) -> Value:
    """Sütuna yazılan değeri sütunun yakınlığına göre dönüştürür (INSERT/UPDATE)."""
    if value is None or affinity == "BLOB":
        return value
    if affinity == "TEXT":
        return to_text(value) if isinstance(value, int | float) else value
    if isinstance(value, str):
        if not _WHOLE_NUMBER.fullmatch(value):
            return value  # sayıya benzemeyen metin metin kalır
        value = to_number(value.strip())
    if isinstance(value, bytes):
        return value
    if affinity == "REAL":
        return float(value)
    if isinstance(value, float) and value.is_integer() and _INT_MIN <= value <= _INT_MAX:
        return int(value)  # INTEGER/NUMERIC: 3.0 → 3
    return value
