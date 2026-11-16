"""Yerleşik işlevler ve sabitler (Türkçe adlar + İngilizce karşılıklar).

İşlevler yalnız birimsiz sayılarla çalışır. `yuvarla` yarımı sıfırdan uzağa yuvarlar (2,5 → 3);
Python'un `round`'u "bankacı yuvarlaması" yapar (2,5 → 2) ve kullanıcıyı şaşırtır.
Genişletme: `FUNCTIONS` sözlüğüne (en az, en çok bağımsız değişken, işlev) satırı ekleyin
(YENİ İŞLEV BURAYA) ve tests/hesap/test_hesap_temel.py'ye bir örnek koyun.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal

Fn = Callable[..., float]


def round_half_up(x: float, digits: float = 0) -> float:
    quantum = Decimal(1).scaleb(-int(digits))
    return float(Decimal(repr(x)).quantize(quantum, rounding=ROUND_HALF_UP))


def nth_root(x: float, n: float) -> float:
    if x < 0 and int(n) == n and int(n) % 2 == 1:
        return -float((-x) ** (1 / n))
    return float(x ** (1 / n))


def factorial(x: float) -> float:
    if x < 0 or not float(x).is_integer():
        raise ValueError("faktöriyel yalnız negatif olmayan tam sayılar için tanımlı")
    if x > 170:
        raise OverflowError("faktöriyel çok büyük (en fazla 170!)")
    return float(math.factorial(int(x)))


# Ad -> (en az, en çok (None: sınırsız), işlev). YENİ İŞLEV BURAYA.
FUNCTIONS: dict[str, tuple[int, int | None, Fn]] = {
    "karekök": (1, 1, math.sqrt),
    "karekok": (1, 1, math.sqrt),
    "sqrt": (1, 1, math.sqrt),
    "kök": (2, 2, nth_root),
    "kok": (2, 2, nth_root),
    "mutlak": (1, 1, abs),
    "abs": (1, 1, abs),
    "sin": (1, 1, math.sin),
    "cos": (1, 1, math.cos),
    "tan": (1, 1, math.tan),
    "ln": (1, 1, math.log),
    "log": (1, 1, math.log10),
    "exp": (1, 1, math.exp),
    "taban": (1, 1, math.floor),
    "floor": (1, 1, math.floor),
    "tavan": (1, 1, math.ceil),
    "ceil": (1, 1, math.ceil),
    "yuvarla": (1, 2, round_half_up),
    "round": (1, 2, round_half_up),
    "en_küçük": (1, None, min),
    "min": (1, None, min),
    "en_büyük": (1, None, max),
    "max": (1, None, max),
}

CONSTANTS: dict[str, float] = {"pi": math.pi, "π": math.pi, "e": math.e}
