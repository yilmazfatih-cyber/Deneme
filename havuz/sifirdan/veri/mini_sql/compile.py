"""İfade derleyici: AST'yi `satır → değer` işlevine (closure) çevirir; ad çözümleme burada yapılır.

- `Scope`: bir satırın sütun düzeni [(takma_ad, sütun_adı), ...]; `t.a` ya da `a` adını konuma
  çevirir.
- `qualify`: ifadedeki her sütunu tam nitelikli yapar (`a` → `t.a`); böylece SELECT'teki `a` ile
  GROUP BY'daki `t.a` aynı ifade sayılır.
- `Compiler(..., precomputed)`: önceden hesaplanmış ifadeler (gruplama anahtarı, kümeleme sonucu)
  için yeniden hesaplamak yerine o konumdaki değeri okur.

Genişletme: yeni ifade türü → `_compile`'a bir `case` dalı (anlamı values.py'deki yardımcılarla).
"""

from __future__ import annotations

import operator
from collections.abc import Callable, Sequence
from dataclasses import dataclass, replace

from .errors import SqlError
from .functions import SCALAR_FUNCTIONS, is_aggregate
from .syntax import (
    Between,
    Binary,
    Call,
    Case,
    Column,
    Expr,
    InList,
    Like,
    Literal,
    Param,
    Unary,
    Value,
    to_sql,
)
from .values import (
    arithmetic,
    compare,
    concat,
    like,
    logical_and,
    logical_not,
    logical_or,
    sort_key,
    to_number,
    truth,
)

Row = tuple[Value, ...]
Evaluator = Callable[[Row], Value]

_COMPARISONS: dict[str, Callable[[int], bool]] = {
    "=": lambda c: c == 0,
    "<>": lambda c: c != 0,
    "<": lambda c: c < 0,
    "<=": lambda c: c <= 0,
    ">": lambda c: c > 0,
    ">=": lambda c: c >= 0,
}


@dataclass
class Scope:
    columns: list[tuple[str, str]]

    def resolve(self, column: Column) -> int:
        matches = [
            i
            for i, (alias, name) in enumerate(self.columns)
            if name == column.name and (column.table is None or alias == column.table)
        ]
        label = to_sql(column)
        if not matches:
            raise SqlError(f"Bilinmeyen sütun: {label}. Tablo ve sütun adını denetleyin.")
        if len(matches) > 1:
            raise SqlError(f"Belirsiz sütun: {label}. Önüne tablo adı yazın (ör. t.{column.name}).")
        return matches[0]


def qualify(expr: Expr, scope: Scope) -> Expr:
    """Sütunları tam nitelikli yapar (çözümlenemeyen sütun olduğu gibi kalır; hata derlemede)."""
    match expr:
        case Column():
            try:
                alias, name = scope.columns[scope.resolve(expr)]
            except SqlError:
                return expr
            return Column(alias, name)
        case Unary():
            return replace(expr, operand=qualify(expr.operand, scope))
        case Binary():
            return replace(expr, left=qualify(expr.left, scope), right=qualify(expr.right, scope))
        case InList():
            items = tuple(qualify(item, scope) for item in expr.items)
            return replace(expr, operand=qualify(expr.operand, scope), items=items)
        case Between():
            return replace(
                expr,
                operand=qualify(expr.operand, scope),
                low=qualify(expr.low, scope),
                high=qualify(expr.high, scope),
            )
        case Like():
            return replace(
                expr, operand=qualify(expr.operand, scope), pattern=qualify(expr.pattern, scope)
            )
        case Call():
            return replace(expr, args=tuple(qualify(arg, scope) for arg in expr.args))
        case Case():
            whens = tuple((qualify(c, scope), qualify(r, scope)) for c, r in expr.whens)
            operand = None if expr.operand is None else qualify(expr.operand, scope)
            default = None if expr.default is None else qualify(expr.default, scope)
            return Case(operand, whens, default)
    return expr


class Compiler:
    def __init__(
        self,
        scope: Scope,
        params: Sequence[Value],
        precomputed: dict[Expr, int] | None = None,
        context: str = "",
    ) -> None:
        self.scope = scope
        self.params = params
        self.precomputed = precomputed or {}
        self.context = context  # hata iletisinde "WHERE içinde" gibi

    def compile(self, expr: Expr) -> Evaluator:
        if expr in self.precomputed:
            return operator.itemgetter(self.precomputed[expr])
        return self._compile(expr)

    def _compile(self, expr: Expr) -> Evaluator:
        match expr:
            case Literal(value=value):
                return lambda row: value
            case Param(index=index):
                if index >= len(self.params):
                    raise SqlError(
                        f"{index + 1}. parametre verilmedi ({len(self.params)} verildi)."
                    )
                bound = self.params[index]
                return lambda row: bound
            case Column():
                if not self.scope.columns and self.precomputed:
                    raise SqlError(
                        f"'{to_sql(expr)}' sütunu GROUP BY'da yok ve bir kümeleme işlevinin içinde "
                        "değil. Sütunu GROUP BY'a ekleyin ya da min()/max() gibi bir işlevle sarın."
                    )
                return operator.itemgetter(self.scope.resolve(expr))
            case Unary(op=op, operand=operand):
                return _unary(op, self.compile(operand))
            case Binary(op=op, left=left, right=right):
                return _binary(op, self.compile(left), self.compile(right))
            case InList(operand=operand, items=items, negated=negated):
                return _in_list(self.compile(operand), [self.compile(i) for i in items], negated)
            case Between(operand=operand, low=low, high=high, negated=negated):
                subject, lo, hi = self.compile(operand), self.compile(low), self.compile(high)
                ge, le = _COMPARISONS[">="], _COMPARISONS["<="]

                def between(row: Row) -> Value:
                    v = subject(row)
                    result = logical_and(_cmp(ge, v, lo(row)), _cmp(le, v, hi(row)))
                    return logical_not(result) if negated else result

                return between
            case Like(operand=operand, pattern=pattern, negated=negated):
                text, pat = self.compile(operand), self.compile(pattern)
                if negated:
                    return lambda row: logical_not(like(text(row), pat(row)))
                return lambda row: like(text(row), pat(row))
            case Call():
                return self._call(expr)
            case Case(operand=operand, whens=whens, default=default):
                return self._case(operand, whens, default)
        raise SqlError(f"Desteklenmeyen ifade: {expr!r}")

    def _call(self, call: Call) -> Evaluator:
        if call.star or is_aggregate(call.name, len(call.args)):
            where = f" ({self.context})" if self.context else ""
            raise SqlError(f"Kümeleme işlevi {to_sql(call)} burada kullanılamaz{where}.")
        args = [self.compile(arg) for arg in call.args]
        if call.name in ("min", "max"):  # çok argümanlı min/max: satır işlevi
            pick = min if call.name == "min" else max

            def extreme(row: Row) -> Value:
                values = [arg(row) for arg in args]
                return None if any(v is None for v in values) else pick(values, key=sort_key)

            return extreme
        if call.name not in SCALAR_FUNCTIONS:
            raise SqlError(f"Bilinmeyen işlev: {call.name}(). Desteklenenler: functions.py.")
        least, most, function = SCALAR_FUNCTIONS[call.name]
        if not least <= len(args) <= most or call.distinct:
            raise SqlError(f"{call.name}() {least}–{most} argüman alır, DISTINCT almaz.")
        return lambda row: function([arg(row) for arg in args])

    def _case(
        self, operand: Expr | None, whens: tuple[tuple[Expr, Expr], ...], default: Expr | None
    ) -> Evaluator:
        subject = None if operand is None else self.compile(operand)
        branches = [(self.compile(c), self.compile(r)) for c, r in whens]
        fallback = None if default is None else self.compile(default)

        def case(row: Row) -> Value:
            value = None if subject is None else subject(row)
            for condition, result in branches:
                hit = truth(condition(row)) if subject is None else compare(value, condition(row))
                if (subject is None and hit == 1) or (subject is not None and hit == 0):
                    return result(row)
            return None if fallback is None else fallback(row)

        return case


def _cmp(test: Callable[[int], bool], left: Value, right: Value) -> int | None:
    result = compare(left, right)
    return None if result is None else int(test(result))


def _unary(op: str, operand: Evaluator) -> Evaluator:
    if op == "not":
        return lambda row: logical_not(operand(row))
    if op == "+":
        return operand

    def negate(row: Row) -> Value:
        value = operand(row)
        return None if value is None else arithmetic("-", 0, to_number(value))

    return negate


def _binary(op: str, left: Evaluator, right: Evaluator) -> Evaluator:
    if op in ("+", "-", "*", "/", "%"):
        return lambda row: arithmetic(op, left(row), right(row))
    if op == "||":
        return lambda row: concat(left(row), right(row))
    if op == "and":
        return lambda row: logical_and(left(row), right(row))
    if op == "or":
        return lambda row: logical_or(left(row), right(row))
    if op in ("is", "is not"):
        want = 1 if op == "is" else 0

        def is_(row: Row) -> Value:
            a, b = left(row), right(row)
            same = (a is None and b is None) or (
                a is not None and b is not None and compare(a, b) == 0
            )
            return want if same else 1 - want

        return is_
    test = _COMPARISONS[op]
    return lambda row: _cmp(test, left(row), right(row))


def _in_list(value: Evaluator, items: list[Evaluator], negated: bool) -> Evaluator:
    def in_list(row: Row) -> Value:
        v = value(row)
        if v is None:
            return None
        saw_null = False
        for item in items:
            candidate = item(row)
            if candidate is None:
                saw_null = True
            elif compare(v, candidate) == 0:
                return 0 if negated else 1
        if saw_null:
            return None
        return 1 if negated else 0

    return in_list
