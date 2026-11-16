"""Sütun deposu testlerinin veri üreticileri ve sonuç karşılaştırması.

Sütunlar yapılıdır (uzun çalışmalar, az farklı değer, geniş tamsayı, ondalık, metin, karışık);
böylece her kodlama (RLE, 1 ve 2 baytlık sözlük, `array('q')`, `array('d')`, liste) rastgele
tablolarda da görülür. NaN ve sonsuz üretilmez (bkz. README "Sağlamadıkları"). Hem Hypothesis
stratejileri (küçük, küçültülebilir) hem tohumlu `random` üreticileri (büyük tablolar) vardır.
"""

from __future__ import annotations

import random

from hypothesis import strategies as st

from sutun_deposu.encoding import Value
from sutun_deposu.table import KINDS, Aggregate, Filter

NAMES = ["a", "b", "c", "d"]
OPS = ["==", "!=", "<", "<=", ">", ">=", "in"]
TEXTS = ["İzmir", "izmir", "Iğdır", "ığdır", "Ankara", "1", ""]
FLOATS = st.floats(-1e9, 1e9, allow_nan=False)
SCALARS = st.one_of(
    st.none(),
    st.integers(-3, 3),
    st.integers(-(2**70), 2**70),
    FLOATS,
    st.sampled_from([0.0, -0.0, 1.0, 0.5]),
    st.sampled_from(TEXTS),
)
SHAPES = {
    "küçük": st.one_of(st.none(), st.integers(-2, 2)),
    "geniş": st.integers(-(2**63), 2**63 - 1),
    "ondalık": FLOATS,
    "metin": st.one_of(st.none(), st.sampled_from(TEXTS)),
    "karışık": SCALARS,
}
Query = tuple[list[Filter], str | None, list[Aggregate]]


@st.composite
def column_values(draw: st.DrawFn, size: int) -> list[Value]:
    shape = draw(st.sampled_from(["çalışma", *SHAPES]))
    if shape != "çalışma":
        return draw(st.lists(SHAPES[shape], min_size=size, max_size=size))
    values: list[Value] = []  # az sayıda uzun çalışma: RLE'ye düşsün
    while len(values) < size:
        values += [draw(SCALARS)] * draw(st.integers(1, 12))
    return values[:size]


@st.composite
def tables(draw: st.DrawFn) -> list[dict[str, Value]]:
    size = draw(st.integers(0, 40))
    columns = [draw(column_values(size)) for _ in NAMES]
    rows = [dict(zip(NAMES, values, strict=True)) for values in zip(*columns, strict=True)]
    if draw(st.booleans()):  # satırda olmayan sütun None sayılmalı
        rows = [{name: value for name, value in row.items() if value is not None} for row in rows]
    return rows


@st.composite
def queries(draw: st.DrawFn) -> Query:
    where: list[Filter] = []
    for _ in range(draw(st.integers(0, 3))):
        op = draw(st.sampled_from(OPS))
        operand = draw(st.lists(SCALARS, max_size=3)) if op == "in" else draw(SCALARS)
        where.append((draw(st.sampled_from(NAMES)), op, operand))
    group_by = draw(st.none() | st.sampled_from(NAMES))
    one = st.just(("*", "count")) | st.tuples(st.sampled_from(NAMES), st.sampled_from(KINDS))
    return where, group_by, draw(st.lists(one, min_size=1, max_size=3))


def random_value(rng: random.Random, shape: str) -> Value:
    if shape == "küçük":
        return rng.choice([None, -1, 0, 1, 2])
    if shape == "geniş":
        return rng.randint(-(2**63), 2**63 - 1)
    if shape == "ondalık":
        return rng.uniform(-1e6, 1e6) if rng.random() < 0.9 else rng.choice([0.0, -0.0, 0.5])
    if shape == "çok metin":  # 600 farklı değer: 2 baytlık sözlük kodu
        return None if rng.random() < 0.05 else f"ürün-{rng.randint(0, 600)}"
    options: list[Value] = [None, 1, 1.0, "1", "İzmir", "ığdır", rng.randint(-5, 5), rng.random()]
    return rng.choice(options)


def random_column(rng: random.Random, size: int) -> list[Value]:
    shape = rng.choice(["çalışma", "küçük", "geniş", "ondalık", "çok metin", "karışık"])
    if shape != "çalışma":
        return [random_value(rng, shape) for _ in range(size)]
    values: list[Value] = []
    while len(values) < size:
        values += [random_value(rng, rng.choice(["küçük", "karışık"]))] * rng.randint(1, 200)
    return values[:size]


def random_rows(rng: random.Random, size: int) -> list[dict[str, Value]]:
    columns = [random_column(rng, size) for _ in NAMES]
    return [dict(zip(NAMES, values, strict=True)) for values in zip(*columns, strict=True)]


def random_query(rng: random.Random) -> Query:
    where: list[Filter] = []
    for _ in range(rng.choice([0, 1, 1, 2, 3])):
        op = rng.choice(OPS)
        shape = rng.choice(["küçük", "karışık", "çok metin", "ondalık"])
        if op == "in":
            operand: object = [random_value(rng, shape) for _ in range(rng.randint(0, 4))]
        else:
            operand = random_value(rng, shape)
        where.append((rng.choice(NAMES), op, operand))
    group_by = rng.choice([None, *NAMES])
    aggregates: list[Aggregate] = [
        ("*", "count") if rng.random() < 0.2 else (rng.choice(NAMES), rng.choice(KINDS))
        for _ in range(rng.randint(1, 3))
    ]
    return where, group_by, aggregates


def exact(result: list[tuple[Value, ...]]) -> list[list[tuple[str, Value]]]:
    """Sonuç hücrelerini türleriyle birlikte karşılaştırılabilir kılar (1 ile 1.0 ayrı sayılır)."""
    return [[(type(value).__name__, value) for value in row] for row in result]
