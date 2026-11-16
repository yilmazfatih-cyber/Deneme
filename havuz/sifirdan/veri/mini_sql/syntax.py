"""Sözdizimi ağacı (AST): ayrıştırıcının ürettiği deyim ve ifade düğümleri.

İfade düğümleri değişmez (`frozen`) ve karşılaştırılabilirdir; planlayıcı "SELECT'teki ifade GROUP BY'daki
ifadeyle aynı mı?" sorusunu düz `==` ile yanıtlar. `to_sql` ifadeyi okunur metne çevirir (EXPLAIN ve
sütun adları için).

Genişletme: yeni ifade türü → buraya dataclass + `to_sql` dalı + `compile.py`'de değerlendirme dalı.
"""

from __future__ import annotations

from dataclasses import dataclass

from .errors import SqlError

Value = int | float | str | bytes | None


@dataclass(frozen=True)
class Literal:
    value: Value


@dataclass(frozen=True)
class Param:
    index: int  # 0'dan başlar; `?` sırası


@dataclass(frozen=True)
class Column:
    table: str | None  # çözümlemeden sonra her zaman dolu (takma ad)
    name: str


@dataclass(frozen=True)
class Unary:
    op: str  # "-", "+", "not"
    operand: Expr


@dataclass(frozen=True)
class Binary:
    op: str  # + - * / % || = <> < <= > >= and or is "is not"
    left: Expr
    right: Expr


@dataclass(frozen=True)
class InList:
    operand: Expr
    items: tuple[Expr, ...]
    negated: bool


@dataclass(frozen=True)
class Between:
    operand: Expr
    low: Expr
    high: Expr
    negated: bool


@dataclass(frozen=True)
class Like:
    operand: Expr
    pattern: Expr
    negated: bool


@dataclass(frozen=True)
class Call:
    name: str
    args: tuple[Expr, ...]
    distinct: bool = False
    star: bool = False  # count(*)


@dataclass(frozen=True)
class Case:
    operand: Expr | None
    whens: tuple[tuple[Expr, Expr], ...]
    default: Expr | None


Expr = Literal | Param | Column | Unary | Binary | InList | Between | Like | Call | Case


# ── Deyimler ────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class SelectItem:
    expr: Expr | None  # None ise yıldız
    alias: str | None = None
    star_table: str | None = None  # `t.*`


@dataclass(frozen=True)
class TableRef:
    name: str
    alias: str


@dataclass(frozen=True)
class Join:
    kind: str  # "inner", "left", "cross"
    table: TableRef
    condition: Expr | None


@dataclass(frozen=True)
class OrderItem:
    expr: Expr
    descending: bool


@dataclass(frozen=True)
class Select:
    items: tuple[SelectItem, ...]
    from_table: TableRef | None
    joins: tuple[Join, ...] = ()
    where: Expr | None = None
    group_by: tuple[Expr, ...] = ()
    having: Expr | None = None
    order_by: tuple[OrderItem, ...] = ()
    limit: Expr | None = None
    offset: Expr | None = None
    distinct: bool = False


@dataclass(frozen=True)
class ColumnDef:
    name: str
    type_name: str  # "integer", "text", "real" ya da "" (yakınlık yok)
    primary_key: bool = False
    not_null: bool = False
    unique: bool = False
    default: Expr | None = None


@dataclass(frozen=True)
class CreateTable:
    name: str
    columns: tuple[ColumnDef, ...]
    if_not_exists: bool = False


@dataclass(frozen=True)
class CreateIndex:
    name: str
    table: str
    column: str
    unique: bool = False
    if_not_exists: bool = False


@dataclass(frozen=True)
class DropTable:
    name: str
    if_exists: bool = False


@dataclass(frozen=True)
class Insert:
    table: str
    columns: tuple[str, ...]  # boşsa tablodaki bütün sütunlar
    rows: tuple[tuple[Expr, ...], ...]


@dataclass(frozen=True)
class Update:
    table: str
    assignments: tuple[tuple[str, Expr], ...]
    where: Expr | None = None


@dataclass(frozen=True)
class Delete:
    table: str
    where: Expr | None = None


@dataclass(frozen=True)
class Explain:
    statement: Statement


Statement = Select | CreateTable | CreateIndex | DropTable | Insert | Update | Delete | Explain


def to_sql(expr: Expr) -> str:
    """İfadeyi okunur SQL metnine çevirir (EXPLAIN ve varsayılan sütun adları)."""
    match expr:
        case Literal(value=None):
            return "NULL"
        case Literal(value=str() as text):
            return "'" + text.replace("'", "''") + "'"
        case Literal(value=value):
            return repr(value)
        case Param(index=index):
            return f"?{index + 1}"
        case Column(table=table, name=name):
            return f"{table}.{name}" if table else name
        case Unary(op="not", operand=operand):
            return f"NOT {to_sql(operand)}"
        case Unary(op=op, operand=operand):
            return f"{op}{to_sql(operand)}"
        case Binary(op=op, left=left, right=right):
            return f"({to_sql(left)} {op.upper()} {to_sql(right)})"
        case InList(operand=operand, items=items, negated=negated):
            inner = ", ".join(to_sql(item) for item in items)
            return f"{to_sql(operand)} {'NOT IN' if negated else 'IN'} ({inner})"
        case Between(operand=operand, low=low, high=high, negated=negated):
            word = "NOT BETWEEN" if negated else "BETWEEN"
            return f"{to_sql(operand)} {word} {to_sql(low)} AND {to_sql(high)}"
        case Like(operand=operand, pattern=pattern, negated=negated):
            return f"{to_sql(operand)} {'NOT LIKE' if negated else 'LIKE'} {to_sql(pattern)}"
        case Call(name=name, star=True):
            return f"{name}(*)"
        case Call(name=name, args=args, distinct=distinct):
            inner = ", ".join(to_sql(arg) for arg in args)
            return f"{name}({'DISTINCT ' if distinct else ''}{inner})"
        case Case(operand=operand, whens=whens, default=default):
            parts = ["CASE"] + ([to_sql(operand)] if operand is not None else [])
            for condition, result in whens:
                parts += ["WHEN", to_sql(condition), "THEN", to_sql(result)]
            if default is not None:
                parts += ["ELSE", to_sql(default)]
            return " ".join([*parts, "END"])
    raise SqlError(f"bilinmeyen ifade: {expr!r}")
