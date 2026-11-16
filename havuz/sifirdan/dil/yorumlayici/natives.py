"""Yerleşik işlevler (`yazdır`, `uzunluk`, `aralık`…) — yorumlayıcı ve sanal makine ortak kullanır.

Her yerleşik işlevin Türkçe adı ve ASCII karşılığı vardır (`yazdır`/`yazdir`). İşlevler
`(args, ctx, pos)` alır: `ctx.write` çıktıyı yazar (testlerde bir listeye toplanır).
Yerleşikler kullanıcı işlevini geri çağırmaz; bu yüzden iki arka uçta da aynı çalışır.
Genişletme: `_yeni(args, ctx, pos)` gibi bir işlev yazın ve `TABLE` listesine bir satır ekleyin;
DIL.md'deki yerleşik işlevler tablosunu ve
tests/yorumlayici/test_yorumlayici_yerlesik.py'yi güncelleyin.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Protocol

from .errors import Pos, TohumError, runtime_error
from .lexer import tokenize
from .ops import check_key, check_size, iterate, number_result
from .text_tr import lower_tr, upper_tr
from .tokens import TokenType
from .values import FunctionValue, display, is_number, type_name, values_equal


class NativeContext(Protocol):
    def write(self, text: str) -> None: ...


BuiltinFn = Callable[[list[object], NativeContext, Pos | None], object]


class Builtin(FunctionValue):
    builtin = True

    def __init__(self, name: str, fn: BuiltinFn, min_args: int, max_args: int | None) -> None:
        self.name = name
        self.fn = fn
        self.min_args = min_args
        self.max_args = max_args  # None: sınırsız (yazdır)

    def call(self, args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
        n = len(args)
        if n < self.min_args or (self.max_args is not None and n > self.max_args):
            if self.max_args is None:
                want = f"en az {self.min_args}"
            elif self.min_args == self.max_args:
                want = str(self.min_args)
            else:
                want = f"{self.min_args}–{self.max_args}"
            raise runtime_error(
                f"'{self.name}' {want} bağımsız değişken bekliyor, {n} verildi", pos
            )
        return self.fn(args, ctx, pos)


def _want(fn: str, what: str, got: object, pos: Pos | None) -> TohumError:
    return runtime_error(f"'{fn}' {what} bekliyor, {type_name(got)} verildi", pos)


def _str_arg(fn: str, v: object, pos: Pos | None) -> str:
    if not isinstance(v, str):
        raise _want(fn, "dizgi", v, pos)
    return v


def _list_arg(fn: str, v: object, pos: Pos | None) -> list[object]:
    if not isinstance(v, list):
        raise _want(fn, "liste", v, pos)
    return v


def _num_arg(fn: str, v: object, pos: Pos | None) -> int | float:
    if not is_number(v):
        raise _want(fn, "sayı", v, pos)
    return v


def _int_arg(fn: str, v: object, pos: Pos | None) -> int:
    if isinstance(v, bool) or not isinstance(v, int):
        raise _want(fn, "tamsayı", v, pos)
    return v


def _yazdir(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    ctx.write(" ".join(display(a, pos=pos) for a in args) + "\n")
    return None


def _uzunluk(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    v = args[0]
    if isinstance(v, (str, list, dict)):
        return len(v)
    raise _want("uzunluk", "dizgi, liste ya da sözlük", v, pos)


def _ekle(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    items = _list_arg("ekle", args[0], pos)
    check_size(len(items) + 1, pos)
    items.append(args[1])
    return None


def _cikar(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    items = _list_arg("çıkar", args[0], pos)
    if not items:
        raise runtime_error(
            "boş listeden öğe çıkarılamaz", pos, "Önce `uzunluk(l) > 0` denetleyin."
        )
    return items.pop()


def _sayi(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    v = args[0]
    if is_number(v):
        return v
    text = _str_arg("sayı", v, pos).strip()
    try:
        toks = [t for t in tokenize(text) if t.type is not TokenType.EOF]
    except TohumError:
        toks = []
    sign = 1
    if len(toks) == 2 and toks[0].type in (TokenType.MINUS, TokenType.PLUS):
        sign = -1 if toks[0].type is TokenType.MINUS else 1
        toks = toks[1:]
    if len(toks) == 1 and toks[0].type is TokenType.NUMBER and is_number(toks[0].value):
        return number_result(sign * toks[0].value, pos)
    hint = 'Ondalık ayırıcı nokta olmalı: sayı("3.5").' if "," in text else None
    raise runtime_error(f"{display(v, nested=True)} sayıya çevrilemez", pos, hint)


def _aralik(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    nums = [_int_arg("aralık", a, pos) for a in args]
    start, stop, step = (0, nums[0], 1) if len(nums) == 1 else (nums[0], nums[1], 1)
    if len(nums) == 3:
        step = nums[2]
        if step == 0:
            raise runtime_error("'aralık' adımı sıfır olamaz", pos)
    rng = range(start, stop, step)
    check_size(len(rng), pos)
    return list(rng)


def _anahtarlar(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    if not isinstance(args[0], dict):
        raise _want("anahtarlar", "sözlük", args[0], pos)
    return list(args[0].keys())


def _icerir(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    box, item = args
    if isinstance(box, list):
        return any(values_equal(x, item, pos) for x in box)
    if isinstance(box, str):
        return _str_arg("içerir", item, pos) in box
    if isinstance(box, dict):
        check_key(item, pos)
        return item in box
    raise _want("içerir", "liste, dizgi ya da sözlük", box, pos)


def _taban(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    return number_result(math.floor(_num_arg("taban", args[0], pos)), pos)


def _karekok(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    x = _num_arg("karekök", args[0], pos)
    if x < 0:
        raise runtime_error("negatif sayının karekökü gerçel değil", pos)
    try:
        return math.sqrt(x)
    except OverflowError:
        raise runtime_error("sayı taşması: karekök için sayı çok büyük", pos) from None


def _sirala(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    items = _list_arg("sırala", args[0], pos)
    if all(is_number(x) for x in items):
        return sorted(items, key=lambda x: x if is_number(x) else 0)
    if all(isinstance(x, str) for x in items):
        return sorted(items, key=str)
    raise runtime_error(
        "'sırala' yalnız sayılardan ya da yalnız dizgilerden oluşan listeyi sıralar", pos
    )


def _birlestir(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    items = _list_arg("birleştir", args[0], pos)
    sep = _str_arg("birleştir", args[1], pos) if len(args) > 1 else ""
    parts = [_str_arg("birleştir", x, pos) for x in items]
    check_size(sum(len(p) for p in parts) + len(sep) * max(0, len(parts) - 1), pos)
    return sep.join(parts)


def _parcala(args: list[object], ctx: NativeContext, pos: Pos | None) -> object:
    text = _str_arg("parçala", args[0], pos)
    if len(args) == 1:
        return list(text.split())
    sep = _str_arg("parçala", args[1], pos)
    if sep == "":
        raise runtime_error(
            "'parçala' ayracı boş olamaz", pos, "Harflere bölmek için: için h içinde s"
        )
    return list(text.split(sep))


def _simple(fn: Callable[[object, Pos | None], object]) -> BuiltinFn:
    """Tek bağımsız değişkenli, bağlam istemeyen işlevler için kısa sarmalayıcı."""
    return lambda args, ctx, pos: fn(args[0], pos)


# (Türkçe ad, ASCII ad, işlev, en az, en çok bağımsız değişken). YENİ YERLEŞİK BURAYA.
TABLE: list[tuple[str, str, BuiltinFn, int, int | None]] = [
    ("yazdır", "yazdir", _yazdir, 0, None),
    ("uzunluk", "uzunluk", _uzunluk, 1, 1),
    ("ekle", "ekle", _ekle, 2, 2),
    ("çıkar", "cikar", _cikar, 1, 1),
    ("metin", "metin", _simple(lambda v, pos: display(v, pos=pos)), 1, 1),
    ("sayı", "sayi", _sayi, 1, 1),
    ("tür", "tur", _simple(lambda v, pos: type_name(v)), 1, 1),
    ("aralık", "aralik", _aralik, 1, 3),
    ("anahtarlar", "anahtarlar", _anahtarlar, 1, 1),
    ("içerir", "icerir", _icerir, 2, 2),
    ("mutlak", "mutlak", _simple(lambda v, pos: abs(_num_arg("mutlak", v, pos))), 1, 1),
    ("taban", "taban", _taban, 1, 1),
    ("karekök", "karekok", _karekok, 1, 1),
    ("sırala", "sirala", _sirala, 1, 1),
    ("birleştir", "birlestir", _birlestir, 1, 2),
    ("parçala", "parcala", _parcala, 1, 2),
    (
        "büyük_harf",
        "buyuk_harf",
        _simple(lambda v, pos: upper_tr(_str_arg("büyük_harf", v, pos))),
        1,
        1,
    ),
    (
        "küçük_harf",
        "kucuk_harf",
        _simple(lambda v, pos: lower_tr(_str_arg("küçük_harf", v, pos))),
        1,
        1,
    ),
    ("dolaş", "dolas", _simple(lambda v, pos: iterate(v, pos)), 1, 1),
]


def make_builtins() -> dict[str, Builtin]:
    """Ad -> yerleşik işlev sözlüğü (Türkçe ve ASCII adlar aynı nesneyi gösterir)."""
    table: dict[str, Builtin] = {}
    for name, alias, fn, lo, hi in TABLE:
        builtin = Builtin(name, fn, lo, hi)
        table[name] = builtin
        table[alias] = builtin
    return table
