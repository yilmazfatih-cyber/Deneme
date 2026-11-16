"""Veritabanı: deyimleri ayrıştırır, planlar ve yürütür. Dışarıya açılan tek sınıf `Database`'dir.

    db = Database()
    db.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, ad TEXT)")
    db.execute("INSERT INTO t (ad) VALUES (?)", ["Ayşe"])     # parametreler HER ZAMAN `?` ile
    db.execute("SELECT * FROM t").rows                         # [(1, 'Ayşe')]

Değiştiren deyimler atomiktir: bir satırda kısıt bozulursa deyimin bütün etkisi geri alınır.

Genişletme: yeni deyim → `_run`'a bir dal (ve gerekiyorsa `_explain`'e); ayrıştırıcıda da dalı açın.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from .access import choose_index
from .compile import Compiler, Scope, qualify
from .errors import SqlError
from .operators import explain_lines
from .parser import parse, parse_script
from .planner import SelectPlanner
from .storage import ColumnInfo, Table
from .syntax import (
    CreateIndex,
    CreateTable,
    Delete,
    DropTable,
    Explain,
    Expr,
    Insert,
    Select,
    Statement,
    Update,
    Value,
    to_sql,
)
from .values import affinity_of, truth

Row = tuple[Value, ...]


@dataclass
class Result:
    columns: list[str] = field(default_factory=list)
    rows: list[Row] = field(default_factory=list)
    rowcount: int = 0  # INSERT/UPDATE/DELETE'te etkilenen satır sayısı


class Database:
    """Bellek içi SQL veritabanı (SQLite alt kümesi)."""

    def __init__(self) -> None:
        self.tables: dict[str, Table] = {}

    def execute(self, sql: str, params: Sequence[Value] = ()) -> Result:
        statement, param_count = parse(sql)
        if param_count != len(params):
            raise SqlError(f"Deyim {param_count} parametre bekliyor, {len(params)} verildi.")
        return self._run(statement, params)

    def execute_script(self, sql: str) -> list[Result]:
        """`;` ile ayrılmış deyimleri sırayla çalıştırır (parametresiz)."""
        return [self._run(statement, ()) for statement, _ in parse_script(sql)]

    def query(self, sql: str, params: Sequence[Value] = ()) -> list[Row]:
        return self.execute(sql, params).rows

    def _run(self, statement: Statement, params: Sequence[Value]) -> Result:
        if isinstance(statement, Select):
            plan = SelectPlanner(self.tables, params).plan(statement)
            return Result(plan.columns, list(plan.root.rows()))
        if isinstance(statement, Explain):
            return Result(["plan"], [(line,) for line in self._explain(statement.statement, params)])
        if isinstance(statement, Insert):
            return self._insert(statement, params)
        if isinstance(statement, Update | Delete):
            return self._modify(statement, params)
        if isinstance(statement, CreateTable):
            return self._create_table(statement)
        if isinstance(statement, CreateIndex):
            return self._create_index(statement)
        return self._drop_table(statement)

    def _table(self, name: str) -> Table:
        if name not in self.tables:
            raise SqlError(f"'{name}' tablosu yok. Önce CREATE TABLE {name} (...) çalıştırın.")
        return self.tables[name]

    # ── Şema ────────────────────────────────────────────────────────────────────────────────────

    def _create_table(self, statement: CreateTable) -> Result:
        if statement.name in self.tables:
            if statement.if_not_exists:
                return Result()
            raise SqlError(f"'{statement.name}' tablosu zaten var.")
        names = [column.name for column in statement.columns]
        if len(set(names)) != len(names):
            raise SqlError("Aynı sütun adı iki kez yazılmış.")
        if sum(column.primary_key for column in statement.columns) > 1:
            raise SqlError("Yalnız tek sütunlu PRIMARY KEY desteklenir.")
        columns = [
            ColumnInfo(
                column.name,
                column.type_name,
                affinity_of(column.type_name),
                column.primary_key,
                column.not_null,
                column.unique,
                None if column.default is None else _constant(column.default, ()),
            )
            for column in statement.columns
        ]
        self.tables[statement.name] = Table(statement.name, columns)
        return Result()

    def _create_index(self, statement: CreateIndex) -> Result:
        table = self._table(statement.table)
        existing = {name for t in self.tables.values() for name in t.indexes}
        if statement.name in existing:
            if statement.if_not_exists:
                return Result()
            raise SqlError(f"'{statement.name}' adlı dizin zaten var.")
        table.add_index(statement.name, table.column_position(statement.column), statement.unique)
        return Result()

    def _drop_table(self, statement: DropTable) -> Result:
        if statement.name not in self.tables:
            if statement.if_exists:
                return Result()
            raise SqlError(f"'{statement.name}' tablosu yok.")
        del self.tables[statement.name]
        return Result()

    # ── Değiştiren deyimler ─────────────────────────────────────────────────────────────────────

    def _insert(self, statement: Insert, params: Sequence[Value]) -> Result:
        table = self._table(statement.table)
        names = list(statement.columns) or [column.name for column in table.columns]
        positions = [table.column_position(name) for name in names]
        if len(set(positions)) != len(positions):
            raise SqlError("INSERT sütun listesinde aynı sütun iki kez var.")
        state = table.snapshot()
        try:
            for values in statement.rows:
                if len(values) != len(positions):
                    raise SqlError(f"{len(positions)} sütun için {len(values)} değer verildi.")
                row: list[Value] = [column.default for column in table.columns]
                for position, expr in zip(positions, values, strict=True):
                    row[position] = _constant(expr, params)
                table.insert(row)
        except SqlError:
            table.restore(state)
            raise
        return Result(rowcount=len(statement.rows))

    def _matching_rowids(
        self, table: Table, where: Expr | None, params: Sequence[Value]
    ) -> tuple[list[int], list[str]]:
        """WHERE'e uyan rowid'ler ve erişim yolunun açıklaması (dizin varsa onu kullanır)."""
        scope = Scope([(table.name, column.name) for column in table.columns])
        qualified = None if where is None else qualify(where, scope)
        choice = choose_index(table, table.name, qualified, params)
        if choice is None:
            candidates = sorted(table.rows)
            access = f"SeqScan {table.name}"
        else:
            index, lookup = choice
            candidates = sorted(set(lookup.rowids(index)))
            access = f"IndexScan {table.name} USING {index.name} ({lookup.text})"
        if qualified is None:
            return candidates, [access]
        predicate = Compiler(scope, params, context="WHERE").compile(qualified)
        matching = [rowid for rowid in candidates if truth(predicate(table.rows[rowid])) == 1]
        return matching, [f"Filter {to_sql(qualified)}", "  " + access]

    def _modify(self, statement: Update | Delete, params: Sequence[Value]) -> Result:
        table = self._table(statement.table)
        rowids, _ = self._matching_rowids(table, statement.where, params)
        state = table.snapshot()
        try:
            if isinstance(statement, Delete):
                for rowid in rowids:
                    table.delete(rowid)
            else:
                scope = Scope([(table.name, column.name) for column in table.columns])
                compiler = Compiler(scope, params, context="SET")
                assignments = [
                    (table.column_position(name), compiler.compile(qualify(expr, scope)))
                    for name, expr in statement.assignments
                ]
                for rowid in rowids:
                    old = table.rows[rowid]
                    new = list(old)
                    for position, evaluate in assignments:
                        new[position] = evaluate(old)  # bütün SET ifadeleri ESKİ satırla hesaplanır
                    table.update(rowid, new)
        except SqlError:
            table.restore(state)
            raise
        return Result(rowcount=len(rowids))

    def _explain(self, statement: Statement, params: Sequence[Value]) -> list[str]:
        if isinstance(statement, Select):
            return explain_lines(SelectPlanner(self.tables, params).plan(statement).root)
        if isinstance(statement, Update | Delete):
            table = self._table(statement.table)
            _, lines = self._matching_rowids(table, statement.where, params)
            word = "Delete" if isinstance(statement, Delete) else "Update"
            return [f"{word} {table.name}"] + ["  " + line for line in lines]
        if isinstance(statement, Insert):
            return [f"Insert {statement.table} ({len(statement.rows)} satır)"]
        raise SqlError("EXPLAIN yalnız SELECT, INSERT, UPDATE ve DELETE için kullanılabilir.")


def _constant(expr: Expr, params: Sequence[Value]) -> Value:
    """Satırdan bağımsız bir ifadeyi hesaplar (VALUES ve DEFAULT için; sütun adı kullanılamaz)."""
    return Compiler(Scope([]), params, context="VALUES").compile(expr)(())
