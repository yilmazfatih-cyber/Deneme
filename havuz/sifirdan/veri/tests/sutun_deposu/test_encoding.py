"""Kodlamalar: seçim kuralı (sınır dahil), kayıpsız çözme (tür dahil), maskenin değer değer
sınamayla aynılığı (1 ve 2 baytlık sözlük kodu), koşulun farklı değer / çalışma başına bir kez
çağrılması ve tipik sütunlarda boyut kazancı."""

from __future__ import annotations

import random
from array import array

from hypothesis import given
from hypothesis import strategies as st

from sutun_deposu import Dictionary, Plain, RunLength, encode, encoded_size, predicate
from sutun_deposu.encoding import Value
from tests.sutun_deposu.veri import OPS, SCALARS, column_values


def test_selection_rule_and_boundaries() -> None:
    rle = encode([7] * 10 + [8] * 10)
    assert isinstance(rle, RunLength) and rle.runs == [(7, 10), (8, 10)] and len(rle) == 20
    assert isinstance(encode([1] * 5 + [2] * 4), RunLength)  # 2 çalışma × 4 < 9 satır
    assert isinstance(encode([1] * 4 + [2] * 4), Plain)  # 2 × 4 < 8 değil
    words = encode(["İzmir", "Ankara", "İzmir", "Bursa"] * 25)
    assert isinstance(words, Dictionary) and words.dictionary == ["İzmir", "Ankara", "Bursa"]
    assert words.codes.typecode == "B" and list(words.codes[:4]) == [0, 1, 0, 2]
    many = encode([f"k{n}" for n in range(300)])
    assert isinstance(many, Dictionary) and many.codes.typecode == "H"
    thirds: list[Value] = [n / 3 for n in range(100)]
    typed: list[tuple[list[Value], str]] = [([*range(100)], "q"), (thirds, "d")]
    for values, typecode in typed:
        column = encode(values)
        assert isinstance(column, Plain) and isinstance(column.values, array)
        assert column.values.typecode == typecode
    odd: list[list[Value]] = [[1, 2.5, None] * 10, [2**63, 0], []]  # karışık, int64 dışı, boş
    for values in odd:
        column = encode(values)
        assert isinstance(column, Plain) and isinstance(column.values, list)


def test_types_stay_apart() -> None:
    values: list[Value] = ["1", 1, 1.0, 1, "1", 1.0] * 3
    column = encode(values)
    assert isinstance(column, Dictionary) and len(column.dictionary) == 3
    assert [type(v) for v in column] == [type(v) for v in values]
    runs = encode([1] * 6 + [1.0] * 6)
    assert isinstance(runs, RunLength) and [type(v) for v, _ in runs.runs] == [int, float]


@given(st.integers(0, 60).flatmap(column_values))
def test_decoding_is_lossless_including_types(values: list[Value]) -> None:
    column = encode(values)
    assert len(column) == len(values)
    assert [(type(v), v) for v in column] == [(type(v), v) for v in values]


@given(st.integers(0, 60).flatmap(column_values), st.sampled_from(OPS), SCALARS)
def test_mask_equals_value_by_value_test(values: list[Value], op: str, operand: Value) -> None:
    test = predicate(op, [operand, 1] if op == "in" else operand)
    assert encode(values).matches(test) == bytearray(test(value) for value in values)


def test_dictionary_mask_with_one_and_two_byte_codes() -> None:
    for distinct in (200, 300):  # 1 baytlık kod (translate yolu) ve 2 baytlık kod
        values: list[Value] = [f"k{n % distinct}" for n in range(3 * distinct)] + [None]
        column = encode(values)
        assert isinstance(column, Dictionary)
        assert column.codes.typecode == ("B" if distinct <= 256 else "H")
        test = predicate("in", ["k0", "k199", "k299", None])
        assert column.matches(test) == bytearray(test(value) for value in values)


def test_condition_runs_once_per_distinct_value_or_run() -> None:
    calls: list[Value] = []

    def counting(value: Value) -> bool:
        calls.append(value)
        return value == "İzmir"

    mask = encode(["İzmir", "Ankara", "Bursa"] * 1000).matches(counting)
    assert len(calls) == 3 and mask.count(1) == 1000
    calls.clear()
    mask = encode(["iade"] * 500 + ["tamam"] * 500).matches(counting)
    assert len(calls) == 2 and mask.count(0) == 1000


def test_encodings_shrink_typical_columns() -> None:
    cities: list[Value] = ["İzmir", "Ankara", "Bursa"] * 10_000
    assert encoded_size(encode(cities)) * 4 < encoded_size(Plain(cities))  # ölçüm: ~5.7 kat
    dates: list[Value] = [*sorted(random.Random(1).choices(range(365), k=30_000))]
    rle = encode(dates)
    assert isinstance(rle, RunLength) and encoded_size(rle) * 40 < encoded_size(Plain(dates))
