"""Tohum değerleri: tür adları, doğruluk, eşitlik ve ekranda gösterim.

Python karşılıkları: sayı = int/float (bool HARİÇ), dizgi = str, mantıksal = bool, yok = None,
liste = list, sözlük = dict, işlev = `FunctionValue` alt sınıfları. Python'da `True == 1`
doğrudur; Tohum'da `doğru == 1` yanlıştır — bu yüzden her yerde `type(x) is bool` denetlenir.
Bu modül yorumlayıcı ile sanal makinenin ORTAK anlamıdır; ikisi de buradaki işlevleri çağırır.
Genişletme: yeni bir değer türü için `type_name`, `display` ve `values_equal`'a birer dal ekleyin.
"""

from __future__ import annotations

from typing import TypeGuard

from .errors import Pos, limit_error

MAX_NESTED = 200  # gösterim/eşitlikte iç içe yapı sınırı (ör. 10 000 kat iç içe liste)


class FunctionValue:
    """Çağrılabilir her değerin ortak atası (kullanıcı işlevi, kapanım, yerleşik işlev)."""

    name: str = "<adsız>"
    builtin: bool = False


def is_number(v: object) -> TypeGuard[int | float]:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def type_name(v: object) -> str:
    if v is None:
        return "yok"
    if isinstance(v, bool):
        return "mantıksal"
    if is_number(v):
        return "sayı"
    if isinstance(v, str):
        return "dizgi"
    if isinstance(v, list):
        return "liste"
    if isinstance(v, dict):
        return "sözlük"
    if isinstance(v, FunctionValue):
        return "işlev"
    raise TypeError(f"Tohum değeri olmayan Python nesnesi: {v!r}")


def is_truthy(v: object) -> bool:
    """Yalnız `yok` ve `yanlış` yanlış sayılır; 0 ve "" doğrudur (Lox/Lua kuralı)."""
    return not (v is None or v is False)


def values_equal(a: object, b: object, pos: Pos | None = None, depth: int = 0) -> bool:
    """Tohum eşitliği: türler farklıysa yanlış (sayılar hariç: 1 == 1.0 doğrudur)."""
    if depth > MAX_NESTED:
        raise limit_error("karşılaştırılan yapı çok derin", pos)
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if is_number(a) and is_number(b):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, list) and isinstance(b, list):
        if a is b:
            return True
        return len(a) == len(b) and all(
            values_equal(x, y, pos, depth + 1) for x, y in zip(a, b, strict=True)
        )
    if isinstance(a, dict) and isinstance(b, dict):
        if a is b:
            return True
        return a.keys() == b.keys() and all(values_equal(a[k], b[k], pos, depth + 1) for k in a)
    if isinstance(a, FunctionValue):
        return a is b
    return a == b


def format_number(v: int | float) -> str:
    return str(v) if isinstance(v, int) else repr(v)


def quote(s: str) -> str:
    """Dizgiyi Tohum yazımıyla tırnaklar: "a\\"b"."""
    body = s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t")
    return '"' + body + '"'


def display(v: object, nested: bool = False, pos: Pos | None = None) -> str:
    """`yazdır` ve `metin` için gösterim. Kendini içeren listeler `[...]` olarak yazılır."""
    return _display(v, nested, set(), pos, 0)


def _display(v: object, nested: bool, seen: set[int], pos: Pos | None, depth: int) -> str:
    if depth > MAX_NESTED:
        raise limit_error("yazdırılan yapı çok derin", pos)
    if v is None:
        return "yok"
    if v is True:
        return "doğru"
    if v is False:
        return "yanlış"
    if is_number(v):
        return format_number(v)
    if isinstance(v, str):
        return quote(v) if nested else v
    if isinstance(v, FunctionValue):
        return f"<yerleşik işlev {v.name}>" if v.builtin else f"<işlev {v.name}>"
    if isinstance(v, list):
        if id(v) in seen:
            return "[...]"
        seen.add(id(v))
        inner = ", ".join(_display(x, True, seen, pos, depth + 1) for x in v)
        seen.discard(id(v))
        return "[" + inner + "]"
    if isinstance(v, dict):
        if id(v) in seen:
            return "{...}"
        seen.add(id(v))
        inner = ", ".join(
            _display(k, True, seen, pos, depth + 1) + ": " + _display(x, True, seen, pos, depth + 1)
            for k, x in v.items()
        )
        seen.discard(id(v))
        return "{" + inner + "}"
    raise TypeError(f"Tohum değeri olmayan Python nesnesi: {v!r}")
