"""Sütun tablosu: elle hesaplanmış örnek, ortak anlam (koşul ve kümeleme kuralları), hatalar, satır
tabanlı başvuruyla fark testi (Hypothesis + tohumlu büyük tablolar), hızlı yolların tekrar açmadığı,
bellek kazancı ve ölçüm komutu."""

from __future__ import annotations

import random
from array import array
from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from sutun_deposu import ColumnTable, Dictionary, Plain, RowTable, RunLength, encode, predicate
from sutun_deposu.__main__ import NAMES as BENCH_NAMES
from sutun_deposu.__main__ import _measure, main, make_rows
from sutun_deposu.encoding import Column, Value
from sutun_deposu.table import KINDS, Aggregate, Filter, aggregate
from tests.sutun_deposu.veri import (
    NAMES,
    Query,
    exact,
    queries,
    random_column,
    random_query,
    random_rows,
    tables,
)
from tests.yardimci import seed_count

SALES: list[dict[str, Value]] = [
    {"sehir": "İzmir", "tutar": 120, "durum": "tamam"},
    {"sehir": "Ankara", "tutar": 80, "durum": "tamam"},
    {"sehir": "İzmir", "tutar": 300, "durum": "iade"},
    {"sehir": None, "tutar": 50, "durum": "tamam"},
    {"sehir": "İzmir", "tutar": None, "durum": "tamam"},
    {"sehir": "Bursa", "tutar": 200.5},  # durum yok: None sayılır
]
SALES_NAMES = ["sehir", "tutar", "durum"]
ALL_KINDS = [("*", "count"), ("tutar", "count"), ("tutar", "sum"), ("tutar", "avg")]
ALL_KINDS += [("tutar", "min"), ("tutar", "max")]


@pytest.fixture(params=["sütun", "satır"])
def sales(request: pytest.FixtureRequest) -> ColumnTable | RowTable:
    if request.param == "sütun":
        return ColumnTable.from_rows(SALES, SALES_NAMES)
    return RowTable(SALES, SALES_NAMES)


def test_hand_calculated_answers(sales: ColumnTable | RowTable) -> None:
    izmir_over_100 = [("sehir", "==", "İzmir"), ("tutar", ">", 100)]
    assert sales.select(izmir_over_100, None, [("*", "count"), ("tutar", "sum")]) == [(2, 420)]
    assert sales.select([], "sehir", ALL_KINDS) == [
        (None, 1, 1, 50, 50.0, 50, 50),
        ("Ankara", 1, 1, 80, 80.0, 80, 80),
        ("Bursa", 1, 1, 200.5, 200.5, 200.5, 200.5),
        ("İzmir", 3, 2, 420, 210.0, 120, 300),  # İ (U+0130) ASCII harflerden sonra gelir
    ]
    assert sales.select([], None, [("tutar", "sum"), ("tutar", "count")]) == [(750.5, 5)]
    assert sales.select([("tutar", "!=", 80)]) == [(4,)]  # None olan tutar uymaz
    assert sales.select([("sehir", "in", ["Ankara", "Bursa"])]) == [(2,)]
    assert sales.select([("tutar", "<", "z")]) == [(0,)]  # sayı < metin: uymaz
    assert sales.select([("sehir", "<", "z")]) == [(2,)]  # kod noktası: "İzmir" > "z"
    assert sales.select([("durum", "==", None)]) == sales.select([("durum", "!=", None)]) == [(0,)]
    assert sales.select([("durum", "==", "iade")], "sehir", [("tutar", "max")]) == [("İzmir", 300)]
    nothing = [("tutar", ">", 10**6)]
    assert sales.select(nothing, None, [("*", "count"), ("tutar", "sum")]) == [(0, None)]
    assert sales.select(nothing, "sehir") == []


def test_shared_rules_for_conditions_and_aggregates() -> None:
    assert predicate("==", 1)(1.0) and not predicate("==", 1)("1")
    assert not predicate("<", 5)("a") and predicate(">=", "a")("b")
    assert not predicate("!=", 5)(None) and not predicate("==", None)(None)
    assert predicate("in", [1, "x"])("x") and not predicate("in", [])(1)
    assert aggregate("sum", [1, None, 2]) == 3 and type(aggregate("sum", [1, 2])) is int
    # doğru yuvarlanmış toplam (math.fsum); Python 3.13'ün sum()'ı burada 1e16 verir
    assert aggregate("sum", [1e16, 1.0, 1e-16]) == 1.0000000000000002e16
    assert aggregate("sum", ["a"]) is None and aggregate("avg", [None]) is None
    assert aggregate("avg", [1, 2]) == 1.5 and aggregate("count", [None, "a", 0]) == 2
    assert aggregate("min", ["b", 3, None]) == 3 and aggregate("max", ["b", 3]) == "b"
    assert aggregate("min", []) is None


@pytest.mark.parametrize(
    ("where", "group_by", "aggregates", "message"),
    [
        ([("sehir", "~", 1)], None, [("*", "count")], "Bilinmeyen işleç"),
        ([("yok", "==", 1)], None, [("*", "count")], "Bilinmeyen sütun"),
        ([], "yok", [("*", "count")], "Bilinmeyen sütun"),
        ([], None, [("tutar", "median")], "Geçersiz kümeleme"),
        ([], None, [("*", "sum")], "Geçersiz kümeleme"),
        ([("sehir", "in", "İzmir")], None, [("*", "count")], "değer listesi ister"),
    ],
)
def test_errors_are_the_same_in_both_tables(
    sales: ColumnTable | RowTable,
    where: list[Filter],
    group_by: str | None,
    aggregates: list[Aggregate],
    message: str,
) -> None:
    with pytest.raises(ValueError, match=message):
        sales.select(where, group_by, aggregates)


def _agree(rows: list[dict[str, Value]], query_list: list[Query]) -> None:
    columns, reference = ColumnTable.from_rows(rows, NAMES), RowTable(rows, NAMES)
    for where, group_by, aggregates in query_list:
        got = columns.select(where, group_by, aggregates)
        assert exact(got) == exact(reference.select(where, group_by, aggregates)), (
            where,
            group_by,
            aggregates,
        )


@given(tables(), st.lists(queries(), min_size=1, max_size=4))
def test_column_table_agrees_with_row_table(rows: list[dict[str, Value]], qs: list[Query]) -> None:
    _agree(rows, qs)


@pytest.mark.parametrize("seed", range(seed_count(4, 40)))
def test_large_random_tables_agree(seed: int) -> None:
    rng = random.Random(seed)
    rows = random_rows(rng, rng.choice([0, 1, 255, 256, 257, 3000]))
    whole: list[Query] = [([], None, [(name, kind)]) for name in NAMES for kind in KINDS]
    _agree(rows, whole + [random_query(rng) for _ in range(seed_count(40, 150))])


def _encoding_of(column: Column) -> tuple[str, str]:
    if isinstance(column, Dictionary):
        return ("Dictionary", column.codes.typecode)
    if isinstance(column, Plain) and isinstance(column.values, array):
        return ("Plain", column.values.typecode)
    return (type(column).__name__, "")


def test_random_generator_reaches_every_encoding() -> None:
    rng = random.Random(7)
    seen: Counter[tuple[str, str]] = Counter()
    for _ in range(60):
        seen[_encoding_of(encode(random_column(rng, 2000)))] += 1
    expected = {("RunLength", ""), ("Dictionary", "B"), ("Dictionary", "H"), ("Plain", "q")}
    assert expected | {("Plain", "d"), ("Plain", "")} <= set(seen), seen


def test_fast_paths_never_expand_columns(monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(self: object) -> None:
        raise AssertionError("sütun tek tek açıldı")

    monkeypatch.setattr(RunLength, "__iter__", refuse)
    monkeypatch.setattr(Plain, "__iter__", refuse)
    big = 10**12  # açılsaydı bitmezdi
    table = ColumnTable({"x": RunLength([(5, big), (None, 3), (2, big)], 2 * big + 3)}, 2 * big + 3)
    wanted = [(7 * big, 2 * big, 2 * big + 3)]
    assert table.select(aggregates=[("x", "sum"), ("x", "count"), ("*", "count")]) == wanted
    numbers = ColumnTable({"n": Plain(array("q", [4, -2, 9]))}, 3)
    kinds = [("n", kind) for kind in ("count", "sum", "avg", "min", "max")]
    assert numbers.select(aggregates=kinds) == [(3, 11, 11 / 3, -2, 9)]
    floats = ColumnTable({"f": Plain(array("d", [1e16, 1.0, 1e-16]))}, 3)
    assert floats.select(aggregates=[("f", "sum")]) == [(1.0000000000000002e16,)]  # fsum


def test_column_table_keeps_far_less_memory() -> None:
    _, column_bytes, _ = _measure(lambda: ColumnTable.from_rows(make_rows(20_000, 1), BENCH_NAMES))
    _, row_bytes, _ = _measure(lambda: RowTable(make_rows(20_000, 1), BENCH_NAMES))
    assert column_bytes * 10 < row_bytes  # ölçüm (200 bin satır): 2.2 MB'a 62 MB


def test_measurement_command(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["olc", "--satir", "2000"]) == 0  # sonuçların aynılığını kendisi de denetler
    out = capsys.readouterr().out
    assert "kalıcı bellek" in out and out.count("hızlı") == 4
