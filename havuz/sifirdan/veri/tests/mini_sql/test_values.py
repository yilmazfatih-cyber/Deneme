"""Değer anlamı: tek tek ifadeler sqlite3 ile karşılaştırılır (aritmetik, NULL mantığı, LIKE, substr, yakınlık)."""

from __future__ import annotations

import contextlib
import sqlite3
from collections.abc import Iterator

import pytest

from mini_sql import Database
from mini_sql.functions import lower_tr, upper_tr

EXPRESSIONS = [
    "7 / 2", "-7 / 2", "7 / -2", "-7 % 2", "7 % -2", "5.5 % 2", "-5.5 % 2", "7 / 0", "7 % 0",
    "7.0 / 0", "5 / 2.0", "0.1 + 0.2", "2 * 3.5", "9223372036854775807 + 1", "-(-9223372036854775807)",
    "'abc' + 1", "'12abc' + 1", "' 12' + 1", "'1e2' + 0", "'x' * 2", "-'3'", "+'abc'",
    "NULL = NULL", "NULL IS NULL", "1 IS 1.0", "NULL IS NOT 1", "'a' < 'b'", "'abc' > 5", "3 = 3.0",
    "1 IN (1, NULL)", "2 IN (1, NULL)", "2 NOT IN (1, NULL)", "NULL IN (1)", "2 NOT IN (1, 3)",
    "NULL AND 0", "NULL AND 1", "NULL OR 1", "NULL OR 0", "NOT NULL", "NOT 'abc'", "NOT '1x'",
    "2 BETWEEN 1 AND 3", "NULL BETWEEN 1 AND 3", "5 BETWEEN NULL AND 3", "5 NOT BETWEEN 1 AND 3",
    "'Abc' LIKE 'a%'", "'İzmir' LIKE 'i%'", "'ılık' LIKE 'I%'", "'x' LIKE '_'", "'a%b' LIKE 'a%b'",
    "'' LIKE '%'", "NULL LIKE '%'", "'abc' NOT LIKE '%c'",
    "lower('İSTANBUL')", "upper('ılık şeker')", "length('şeker')", "length(12.5)", "abs(-2.5)",
    "abs(NULL)", "1 || 2", "1.0 || 'a'", "1e20 || ''", "100.0 || ''", "'a' || NULL",
    "coalesce(NULL, NULL, 3)", "ifnull(NULL, 'x')", "nullif(3, 3)", "nullif(3, 4)",
    "typeof(1 / 2)", "typeof(1.0 * 2)", "typeof('a')", "typeof(NULL)", "typeof(1 > 0)",
    "CASE WHEN NULL THEN 1 ELSE 2 END", "CASE 1 WHEN 1 THEN 'a' END", "CASE NULL WHEN NULL THEN 1 ELSE 0 END",
    "CASE 2 WHEN 1 THEN 'a' WHEN 2 THEN 'b' END", "min(3, 1, 2)", "max('a', 'b')", "min(1, NULL)",
    "TRUE + TRUE", "-0.0 + 1", "(1 + 2) * 3 - 4 / 2 % 3", "1 + 2 || 3", "2 * 3 || ''",
]  # fmt: skip


@contextlib.contextmanager
def _sqlite() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(":memory:")
    try:
        yield connection
    finally:
        connection.close()


@pytest.mark.parametrize("expression", EXPRESSIONS)
def test_scalar_expression_matches_sqlite(expression: str) -> None:
    with _sqlite() as reference:
        expected = reference.execute(f"SELECT {expression}").fetchall()
    actual = Database().query(f"SELECT {expression}")
    assert actual == expected
    assert [type(v) for v in actual[0]] == [type(v) for v in expected[0]]


def test_substr_matches_sqlite_for_all_small_arguments() -> None:
    db = Database()
    with _sqlite() as reference:
        for text in ("abcdef", "şeker", ""):
            for start in range(-8, 9):
                for length in range(-8, 9):
                    sql = f"SELECT substr('{text}', {start}, {length}), substr('{text}', {start})"
                    assert db.query(sql) == reference.execute(sql).fetchall(), sql


def test_type_affinity_on_insert_matches_sqlite() -> None:
    script = [
        "CREATE TABLE t (id INTEGER PRIMARY KEY, a INTEGER, b TEXT, c REAL, d, e NUMERIC, f VARCHAR(5))",
        "INSERT INTO t (a, b, c, d, e, f) VALUES ('12', 34, 5, '7', '3.0', 1.5)",
        "INSERT INTO t (a, b, c, d, e, f) VALUES ('x', 1.5, '2', 8, '2.5', 'yazı')",
        "INSERT INTO t (a, b, c, d, e, f) VALUES (3.0, 'q', 7, 1.5, 'abc', NULL)",
        "INSERT INTO t (a, b, c, d, e, f) VALUES (2.5, NULL, NULL, NULL, 4, 0.25)",
    ]
    query = (
        "SELECT a, typeof(a), b, typeof(b), c, typeof(c), d, typeof(d), e, typeof(e), f, typeof(f)"
        " FROM t ORDER BY id"
    )
    db = Database()
    with _sqlite() as reference:
        for sql in script:
            reference.execute(sql)
            db.execute(sql)
        assert db.query(query) == reference.execute(query).fetchall()
        mixed = "SELECT a FROM t ORDER BY a"  # sayılar metinden önce, NULL en önde
        assert db.query(mixed) == reference.execute(mixed).fetchall()


def test_turkish_case_helpers_are_correct() -> None:
    assert upper_tr("istanbul ılık") == "İSTANBUL ILIK"
    assert lower_tr("İSTANBUL IŞIK") == "istanbul ışık"
    db = Database()
    assert db.query("SELECT upper_tr('iğdır'), lower_tr('İZMİR')") == [("İĞDIR", "izmir")]
    assert db.query("SELECT upper('iğdır')") == [("IğDIR",)]  # SQLite gibi: yalnız ASCII
