"""SELECT planlayıcı: AST → işleç ağacı (mantıksal plan, aynı zamanda yürütülebilir plan).

Sıra: kaynak (tarama/dizin) → birleşmeler → WHERE (Filter) → GROUP BY/kümeleme (Aggregate) →
HAVING (Filter) → SELECT listesi (Project) → DISTINCT → ORDER BY (Sort) → LIMIT/OFFSET → gizli sütunları at.
ORDER BY; konum (`ORDER BY 2`), takma ad ya da SELECT'te olmayan bir ifade olabilir (gizli sütun).

Genişletme: koşul aşağı itme (predicate pushdown) → WHERE parçalarını birleşmeden önceki taramalara
taşıyın (LEFT JOIN'in sağ tarafına taşımak YANLIŞ olur, dikkat).
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from .access import choose_index, split_and
from .compile import Compiler, Evaluator, Scope, qualify
from .errors import SqlError
from .functions import is_aggregate
from .operators import (
    Aggregate,
    Distinct,
    Filter,
    HashJoin,
    IndexScan,
    Limit,
    NestedLoopJoin,
    OneRow,
    Operator,
    Project,
    SeqScan,
    Sort,
)
from .storage import Table
from .syntax import Binary, Call, Case, Column, Expr, Literal, Select, Value, to_sql
from .values import to_number


@dataclass
class Plan:
    root: Operator
    columns: list[str]


def collect_aggregates(expr: Expr, found: list[Call], inside: bool = False) -> None:
    """İfadedeki kümeleme çağrılarını (tekrarsız) toplar; iç içe kümelemeyi reddeder."""
    if isinstance(expr, Call) and (expr.star or is_aggregate(expr.name, len(expr.args))):
        if inside:
            raise SqlError(f"Kümeleme işlevi iç içe olamaz: {to_sql(expr)}")
        for arg in expr.args:
            collect_aggregates(arg, found, inside=True)
        if expr not in found:
            found.append(expr)
        return
    for child in _children(expr):
        collect_aggregates(child, found, inside)


def _children(expr: Expr) -> list[Expr]:
    if isinstance(expr, Case):
        parts = [part for pair in expr.whens for part in pair]
        return parts + [e for e in (expr.operand, expr.default) if e is not None]
    names = ("operand", "left", "right", "low", "high", "pattern")
    children = [getattr(expr, name) for name in names if hasattr(expr, name)]
    return children + list(getattr(expr, "items", ())) + list(getattr(expr, "args", ()))


class SelectPlanner:
    def __init__(self, tables: dict[str, Table], params: Sequence[Value]) -> None:
        self.tables = tables
        self.params = params

    def _table(self, name: str) -> Table:
        if name not in self.tables:
            raise SqlError(f"'{name}' tablosu yok. Önce CREATE TABLE {name} (...) çalıştırın.")
        return self.tables[name]

    def _scope_of(self, table: Table, alias: str) -> list[tuple[str, str]]:
        return [(alias, column.name) for column in table.columns]

    def plan(self, select: Select) -> Plan:
        root, scope = self._source(select)
        where = None if select.where is None else qualify(select.where, scope)
        if where is not None:
            predicate = Compiler(scope, self.params, context="WHERE").compile(where)
            root = Filter(root, predicate, to_sql(where))
        items, names, alias_positions = self._expand_items(select, scope)
        order_refs = self._order_refs(select, items, alias_positions, scope)
        hidden_exprs = [ref for ref, _ in order_refs if not isinstance(ref, int)]
        aggregates: list[Call] = []
        having = None if select.having is None else qualify(select.having, scope)
        for expr in [*items, *hidden_exprs, *([having] if having is not None else [])]:
            collect_aggregates(expr, aggregates)
        compiler = Compiler(scope, self.params, context="SELECT")
        if select.group_by or aggregates or having is not None:
            root, compiler = self._aggregate(root, select, items, aggregates, scope)
            if having is not None:
                root = Filter(root, compiler.compile(having), to_sql(having))
        evaluators = [compiler.compile(expr) for expr in items]
        evaluators += [compiler.compile(expr) for expr in hidden_exprs]
        root = Project(root, evaluators, ", ".join(to_sql(e) for e in items + hidden_exprs))
        if select.distinct:
            if hidden_exprs:
                raise SqlError("DISTINCT ile ORDER BY'daki ifadeler SELECT listesinde de olmalı.")
            root = Distinct(root)
        sort_keys = self._sort_keys(order_refs, len(items))
        if sort_keys:
            text = ", ".join(f"{p + 1}{' DESC' if d else ''}" for p, d in sort_keys)
            root = Sort(root, sort_keys, text)
        if select.limit is not None or select.offset is not None:
            root = Limit(root, *self._limit(select))
        if hidden_exprs:
            width = len(items)
            root = Project(root, [_pick(i) for i in range(width)], f"ilk {width} sütun")
        return Plan(root, names)

    # ── Kaynak: tarama ve birleşmeler ──────────────────────────────────────────────────────────

    def _source(self, select: Select) -> tuple[Operator, Scope]:
        if select.from_table is None:
            return OneRow(), Scope([])
        first = select.from_table
        table = self._table(first.name)
        scope = Scope(self._scope_of(table, first.alias))
        root: Operator = SeqScan(table, first.alias)
        if not select.joins and select.where is not None:
            choice = choose_index(table, first.alias, qualify(select.where, scope), self.params)
            if choice is not None:
                root = IndexScan(table, first.alias, *choice)
        aliases = {first.alias}
        for join in select.joins:
            if join.table.alias in aliases:
                raise SqlError(f"'{join.table.alias}' takma adı iki kez kullanılmış.")
            aliases.add(join.table.alias)
            right_table = self._table(join.table.name)
            right_scope = self._scope_of(right_table, join.table.alias)
            left_scope = scope
            scope = Scope(scope.columns + right_scope)
            right = SeqScan(right_table, join.table.alias)
            root = self._join(root, right, join.kind, join.condition, left_scope, scope)
        return root, scope

    def _join(
        self,
        left: Operator,
        right: Operator,
        kind: str,
        condition: Expr | None,
        left_scope: Scope,
        scope: Scope,
    ) -> Operator:
        width = len(scope.columns) - len(left_scope.columns)
        if condition is None:
            loop = NestedLoopJoin(left, right, kind, None, "")
            loop.right_width = width
            return loop
        qualified = qualify(condition, scope)
        compiler = Compiler(scope, self.params, context="ON")
        parts = split_and(qualified)
        left_aliases = {alias for alias, _ in left_scope.columns}
        for position, part in enumerate(parts):
            keys = _equi_keys(part, left_aliases)
            if keys is None:
                continue
            left_key = Compiler(left_scope, self.params).compile(keys[0])
            right_key = Compiler(Scope(scope.columns[len(left_scope.columns) :]), self.params)
            rest = parts[:position] + parts[position + 1 :]
            residual = _and_all(rest)
            hash_join = HashJoin(
                left,
                right,
                kind,
                (left_key, right_key.compile(keys[1])),
                None if residual is None else compiler.compile(residual),
                to_sql(qualified),
            )
            hash_join.right_width = width
            return hash_join
        loop = NestedLoopJoin(left, right, kind, compiler.compile(qualified), to_sql(qualified))
        loop.right_width = width
        return loop

    # ── SELECT listesi, ORDER BY, kümeleme, LIMIT ───────────────────────────────────────────────

    def _expand_items(
        self, select: Select, scope: Scope
    ) -> tuple[list[Expr], list[str], dict[str, int]]:
        """SELECT listesi: `*` açılır; (ifadeler, çıktı adları, takma ad → çıktı konumu)."""
        items: list[Expr] = []
        names: list[str] = []
        alias_positions: dict[str, int] = {}
        for item in select.items:
            if item.expr is None:
                columns = [
                    (alias, name)
                    for alias, name in scope.columns
                    if item.star_table is None or alias == item.star_table
                ]
                if not columns:
                    raise SqlError(f"'{item.star_table}.*' için tablo bulunamadı.")
                items += [Column(alias, name) for alias, name in columns]
                names += [name for _, name in columns]
                continue
            items.append(qualify(item.expr, scope))
            if item.alias is not None:
                alias_positions.setdefault(item.alias, len(names))
                names.append(item.alias)
            elif isinstance(item.expr, Column):
                names.append(item.expr.name)
            else:
                names.append(to_sql(item.expr))
        return items, names, alias_positions

    def _order_refs(
        self, select: Select, items: list[Expr], aliases: dict[str, int], scope: Scope
    ) -> list[tuple[Expr | int, bool]]:
        """Her ORDER BY öğesi için (çıktı konumu ya da gizli ifade, azalan_mı)."""
        refs: list[tuple[Expr | int, bool]] = []
        for order in select.order_by:
            expr = order.expr
            if isinstance(expr, Literal) and isinstance(expr.value, int):
                if not 1 <= expr.value <= len(items):
                    raise SqlError(f"ORDER BY {expr.value}: 1 ile {len(items)} arasında olmalı.")
                refs.append((expr.value - 1, order.descending))
            elif isinstance(expr, Column) and expr.table is None and expr.name in aliases:
                refs.append((aliases[expr.name], order.descending))
            else:
                qualified = qualify(expr, scope)
                position = items.index(qualified) if qualified in items else None
                refs.append((qualified if position is None else position, order.descending))
        return refs

    def _sort_keys(self, refs: list[tuple[Expr | int, bool]], width: int) -> list[tuple[int, bool]]:
        keys: list[tuple[int, bool]] = []
        hidden = width
        for ref, descending in refs:
            if isinstance(ref, int):
                keys.append((ref, descending))
            else:
                keys.append((hidden, descending))
                hidden += 1
        return keys

    def _aggregate(
        self, root: Operator, select: Select, items: list[Expr], aggregates: list[Call], scope: Scope
    ) -> tuple[Operator, Compiler]:
        groups: list[Expr] = []
        for expr in select.group_by:
            if isinstance(expr, Literal) and isinstance(expr.value, int):
                if not 1 <= expr.value <= len(items):
                    raise SqlError(f"GROUP BY {expr.value}: 1 ile {len(items)} arasında olmalı.")
                groups.append(items[expr.value - 1])
            else:
                groups.append(qualify(expr, scope))
        compiler = Compiler(scope, self.params, context="GROUP BY")
        for group in groups:
            found: list[Call] = []
            collect_aggregates(group, found)
            if found:
                raise SqlError("GROUP BY içinde kümeleme işlevi kullanılamaz.")
        group_evals = [compiler.compile(group) for group in groups]
        specs: list[tuple[str, Evaluator | None, bool]] = []
        for call in aggregates:
            if call.star:
                specs.append(("count", None, False))
            elif len(call.args) != 1:
                raise SqlError(f"{call.name}() tek argüman alır.")
            else:
                specs.append((call.name, compiler.compile(call.args[0]), call.distinct))
        text = f"group=[{', '.join(to_sql(g) for g in groups)}] "
        text += f"aggs=[{', '.join(to_sql(a) for a in aggregates)}]"
        precomputed: dict[Expr, int] = {group: i for i, group in enumerate(groups)}
        for j, call in enumerate(aggregates):
            precomputed[call] = len(groups) + j
        return Aggregate(root, group_evals, specs, text), Compiler(Scope([]), self.params, precomputed)

    def _limit(self, select: Select) -> tuple[int | None, int]:
        def constant(expr: Expr) -> int:
            value = Compiler(Scope([]), self.params, context="LIMIT").compile(expr)(())
            if value is None or isinstance(value, str | bytes):
                raise SqlError("LIMIT/OFFSET tamsayı olmalı.")
            return int(to_number(value))

        limit = None if select.limit is None else constant(select.limit)
        offset = 0 if select.offset is None else constant(select.offset)
        return (None if limit is not None and limit < 0 else limit), max(0, offset)


def _pick(position: int) -> Evaluator:
    return lambda row: row[position]


def _and_all(parts: list[Expr]) -> Expr | None:
    if not parts:
        return None
    combined = parts[0]
    for part in parts[1:]:
        combined = Binary("and", combined, part)
    return combined


def _aliases_in(expr: Expr) -> set[str]:
    if isinstance(expr, Column):
        return {expr.table} if expr.table else set()
    found: set[str] = set()
    for child in _children(expr):
        found |= _aliases_in(child)
    return found


def _equi_keys(part: Expr, left_aliases: set[str]) -> tuple[Expr, Expr] | None:
    """`sol_ifade = sağ_ifade` biçimindeyse (sol anahtar, sağ anahtar); değilse None."""
    if not isinstance(part, Binary) or part.op != "=":
        return None
    left_side, right_side = _aliases_in(part.left), _aliases_in(part.right)
    if left_side and right_side and left_side <= left_aliases and not right_side & left_aliases:
        return part.left, part.right
    if left_side and right_side and right_side <= left_aliases and not left_side & left_aliases:
        return part.right, part.left
    return None
