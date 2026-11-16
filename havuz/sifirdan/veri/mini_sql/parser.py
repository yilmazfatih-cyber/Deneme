"""Deyim ayrıştırıcısı: SELECT, INSERT, UPDATE, DELETE, CREATE TABLE/INDEX, DROP TABLE, EXPLAIN.

`parse(sql)` tek deyim, `parse_script(sql)` `;` ile ayrılmış deyim listesi döndürür. Her deyimle birlikte
içindeki `?` sayısı da döner (parametre sayısı denetimi için).

Genişletme: yeni deyim → `syntax.py`'ye dataclass, `_statement`'a bir dal, `engine.py`'ye yürütme dalı.
"""

from __future__ import annotations

from .errors import SqlError
from .lexer import tokenize
from .parse_expr import ExprParser
from .syntax import (
    ColumnDef,
    CreateIndex,
    CreateTable,
    Delete,
    DropTable,
    Explain,
    Expr,
    Insert,
    Join,
    Literal,
    OrderItem,
    Select,
    SelectItem,
    Statement,
    TableRef,
    Unary,
    Update,
)


class Parser(ExprParser):
    def statement(self) -> Statement:
        if self.accept_kw("explain"):
            inner = self.statement()
            if isinstance(inner, Explain):
                self.fail("EXPLAIN iç içe olamaz")
            return Explain(inner)
        if self.accept_kw("select"):
            return self._select()
        if self.accept_kw("insert"):
            return self._insert()
        if self.accept_kw("update"):
            return self._update()
        if self.accept_kw("delete"):
            self.expect_kw("from")
            table = self.ident()
            return Delete(table, self.expr() if self.accept_kw("where") else None)
        if self.accept_kw("create"):
            unique = self.accept_kw("unique")
            if self.accept_kw("index"):
                return self._create_index(unique)
            if not unique and self.accept_kw("table"):
                return self._create_table()
            self.fail("CREATE'ten sonra TABLE ya da [UNIQUE] INDEX bekleniyordu")
        if self.accept_kw("drop"):
            self.expect_kw("table")
            if_exists = self._if_exists()
            return DropTable(self.ident(), if_exists)
        self.fail("deyim bekleniyordu (SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, EXPLAIN)")
        raise AssertionError("ulaşılamaz")

    def _if_exists(self) -> bool:
        if self.accept_kw("if"):
            self.expect_kw("exists")
            return True
        return False

    def _if_not_exists(self) -> bool:
        if self.accept_kw("if"):
            self.expect_kw("not")
            self.expect_kw("exists")
            return True
        return False

    # ── SELECT ──────────────────────────────────────────────────────────────────────────────────

    def _select(self) -> Select:
        distinct = self.accept_kw("distinct")
        if not distinct:
            self.accept_kw("all")
        items = [self._select_item()]
        while self.accept_op(","):
            items.append(self._select_item())
        from_table, joins = None, []
        if self.accept_kw("from"):
            from_table = self._table_ref()
            joins = self._joins()
        where = self.expr() if self.accept_kw("where") else None
        group_by: list[Expr] = []
        having = None
        if self.accept_kw("group"):
            self.expect_kw("by")
            group_by = self._expr_list()
            having = self.expr() if self.accept_kw("having") else None
        order_by: list[OrderItem] = []
        if self.accept_kw("order"):
            self.expect_kw("by")
            order_by.append(self._order_item())
            while self.accept_op(","):
                order_by.append(self._order_item())
        limit = offset = None
        if self.accept_kw("limit"):
            limit = self.expr()
            if self.accept_kw("offset"):
                offset = self.expr()
            elif self.accept_op(","):  # SQLite: LIMIT atla, say
                offset, limit = limit, self.expr()
        return Select(
            tuple(items), from_table, tuple(joins), where, tuple(group_by), having,
            tuple(order_by), limit, offset, distinct,
        )  # fmt: skip

    def _select_item(self) -> SelectItem:
        if self.accept_op("*"):
            return SelectItem(None)
        if self.peek().kind == "IDENT" and self.peek(1).value == "." and self.peek(2).value == "*":
            table = self.advance().value
            self.pos += 2
            return SelectItem(None, star_table=table)
        expr = self.expr()
        if self.accept_kw("as"):
            return SelectItem(expr, self.ident())
        if self.peek().kind == "IDENT":
            return SelectItem(expr, self.ident())
        return SelectItem(expr)

    def _table_ref(self) -> TableRef:
        name = self.ident()
        if self.accept_kw("as") or self.peek().kind == "IDENT":
            return TableRef(name, self.ident())
        return TableRef(name, name)

    def _joins(self) -> list[Join]:
        joins: list[Join] = []
        while True:
            if self.accept_op(","):
                joins.append(Join("cross", self._table_ref(), None))
                continue
            if self.accept_kw("cross"):
                kind = "cross"
            elif self.accept_kw("left"):
                self.accept_kw("outer")
                kind = "left"
            elif self.accept_kw("inner") or (self.peek().kind, self.peek().value) == (
                "KEYWORD",
                "join",
            ):
                kind = "inner"
            else:
                return joins
            self.expect_kw("join")
            table = self._table_ref()
            condition = self.expr() if self.accept_kw("on") else None
            joins.append(Join(kind, table, condition))

    def _expr_list(self) -> list[Expr]:
        items = [self.expr()]
        while self.accept_op(","):
            items.append(self.expr())
        return items

    def _order_item(self) -> OrderItem:
        expr = self.expr()
        if self.accept_kw("desc"):
            return OrderItem(expr, True)
        self.accept_kw("asc")
        return OrderItem(expr, False)

    # ── Değiştiren deyimler ─────────────────────────────────────────────────────────────────────

    def _insert(self) -> Insert:
        self.expect_kw("into")
        table = self.ident()
        columns: list[str] = []
        if self.accept_op("("):
            columns.append(self.ident())
            while self.accept_op(","):
                columns.append(self.ident())
            self.expect_op(")")
        self.expect_kw("values")
        rows = [self._value_row()]
        while self.accept_op(","):
            rows.append(self._value_row())
        return Insert(table, tuple(columns), tuple(rows))

    def _value_row(self) -> tuple[Expr, ...]:
        self.expect_op("(")
        values = self._expr_list()
        self.expect_op(")")
        return tuple(values)

    def _update(self) -> Update:
        table = self.ident()
        self.expect_kw("set")
        assignments: list[tuple[str, Expr]] = []
        while True:
            column = self.ident()
            self.expect_op("=")
            assignments.append((column, self.expr()))
            if not self.accept_op(","):
                break
        return Update(table, tuple(assignments), self.expr() if self.accept_kw("where") else None)

    def _create_table(self) -> CreateTable:
        if_not_exists = self._if_not_exists()
        name = self.ident()
        self.expect_op("(")
        columns = [self._column_def()]
        while self.accept_op(","):
            columns.append(self._column_def())
        self.expect_op(")")
        return CreateTable(name, tuple(columns), if_not_exists)

    def _column_def(self) -> ColumnDef:
        if self.peek().kind == "KEYWORD":
            self.fail("tablo düzeyi kısıtlar desteklenmez; kısıtı sütunun yanına yazın")
        name = self.ident()
        type_words: list[str] = []
        while self.peek().kind == "IDENT":
            type_words.append(self.advance().value)
        if type_words and self.accept_op("("):  # VARCHAR(20) gibi: sayı yok sayılır
            while self.accept_op(")") is None:
                self.advance()
        primary = not_null = unique = False
        default: Expr | None = None
        while True:
            if self.accept_kw("primary"):
                self.expect_kw("key")
                if not self.accept_kw("asc"):
                    self.accept_kw("desc")
                primary = True
            elif self.accept_kw("not"):
                self.expect_kw("null")
                not_null = True
            elif self.accept_kw("unique"):
                unique = True
            elif self.accept_kw("default"):
                default = self._default_value()
            else:
                return ColumnDef(name, " ".join(type_words), primary, not_null, unique, default)

    def _default_value(self) -> Expr:
        if self.accept_op("("):
            value = self.expr()
            self.expect_op(")")
            return value
        if self.accept_op("-"):
            return Unary("-", self._primary_literal())
        return self._primary_literal()

    def _primary_literal(self) -> Expr:
        expr = self._unary()
        if not isinstance(expr, Literal):
            self.fail("DEFAULT için sabit değer ya da parantezli ifade bekleniyordu")
        return expr

    def _create_index(self, unique: bool) -> CreateIndex:
        if_not_exists = self._if_not_exists()
        name = self.ident()
        self.expect_kw("on")
        table = self.ident()
        self.expect_op("(")
        column = self.ident()
        if self.accept_op(","):
            self.fail("yalnız tek sütunlu dizin desteklenir")
        self.expect_op(")")
        return CreateIndex(name, table, column, unique, if_not_exists)


def parse_script(sql: str) -> list[tuple[Statement, int]]:
    """`;` ile ayrılmış deyimleri ayrıştırır: [(deyim, parametre_sayısı), ...]."""
    parser = Parser(tokenize(sql))
    statements: list[tuple[Statement, int]] = []
    while parser.peek().kind != "EOF":
        if parser.accept_op(";"):
            continue
        parser.param_count = 0
        statement = parser.statement()
        statements.append((statement, parser.param_count))
        if parser.peek().kind != "EOF" and parser.accept_op(";") is None:
            parser.fail("deyim bitti ama metin sürüyor (';' unutulmuş olabilir)")
    return statements


def parse(sql: str) -> tuple[Statement, int]:
    """Tek bir deyimi ayrıştırır."""
    statements = parse_script(sql)
    if len(statements) != 1:
        raise SqlError(f"Tek deyim bekleniyordu, {len(statements)} deyim var. execute_script kullanın.")
    return statements[0]
