"""Farksal test: rastgele şema + veri + sorgu + değiştiren deyim, mini_sql ile sqlite3 AYNI sonucu vermeli.

Sıralı sorgular (ORDER BY bütün çıktı sütunlarında) liste olarak, sıralamasızlar çoklu küme olarak
karşılaştırılır. Ayrıca her sorgu dizinsiz bir kopya üstünde de koşulur: dizin seçimi sonucu değiştirmemeli.
"""

from __future__ import annotations

import contextlib
import random
import sqlite3
from collections import Counter

import pytest

from mini_sql import Database
from tests.mini_sql.sqlgen import SqlGen
from tests.yardimci import seed_count


def _same(ours: list[tuple[object, ...]], theirs: list[tuple[object, ...]], ordered: bool) -> bool:
    if ordered:
        return ours == theirs
    return Counter(ours) == Counter(theirs)


def run_scenario(seed: int, statements: int) -> tuple[int, int]:
    """Bir tohumla şema kurar ve `statements` deyim dener; (sorgu sayısı, dizin kullanan) döndürür."""
    with contextlib.closing(sqlite3.connect(":memory:")) as reference:
        return _run(seed, statements, reference)


def _run(seed: int, statements: int, reference: sqlite3.Connection) -> tuple[int, int]:
    rng = random.Random(seed)
    gen = SqlGen(rng)
    ours, plain = Database(), Database()  # plain: dizinsiz kopya
    for sql in gen.schema() + gen.inserts():
        reference.execute(sql)
        ours.execute(sql)
        if "CREATE INDEX" not in sql:
            plain.execute(sql)
    queries = indexed = 0
    for _ in range(statements):
        if rng.random() < 0.25:
            sql = gen.modification()
            reference.execute(sql)
            ours.execute(sql)
            plain.execute(sql)
            for table in ("t1", "t2", "t3"):
                check = f"SELECT * FROM {table} ORDER BY id"
                assert ours.query(check) == reference.execute(check).fetchall(), f"{seed}: {sql}"
            continue
        sql, ordered = gen.select()
        expected = reference.execute(sql).fetchall()
        actual = ours.query(sql)
        assert _same(actual, expected, ordered), (
            f"\ntohum={seed}\n{sql}\nbizim:  {actual}\nsqlite: {expected}"
        )
        assert _same(plain.query(sql), expected, ordered), f"dizinsiz kopya farklı: {sql}"
        queries += 1
        indexed += any("IndexScan" in line for (line,) in ours.query("EXPLAIN " + sql))
    return queries, indexed


@pytest.mark.parametrize("seed", range(seed_count(12, 12)))
def test_matches_sqlite(seed: int) -> None:
    queries, _ = run_scenario(seed, 40)
    assert queries > 20


def test_differential_suite_uses_indexes() -> None:
    total = indexed = 0
    for seed in range(100, 106):
        queries, used = run_scenario(seed, 40)
        total, indexed = total + queries, indexed + used
    assert indexed > 5, f"{total} sorgudan yalnız {indexed} tanesi dizin kullandı"


@pytest.mark.uzun
@pytest.mark.parametrize("block", range(10))
def test_matches_sqlite_long(block: int) -> None:
    for seed in range(1000 + block * 40, 1000 + (block + 1) * 40):
        run_scenario(seed, 60)
