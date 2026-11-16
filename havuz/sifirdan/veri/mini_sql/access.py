"""Erişim yolu seçimi: WHERE koşulundan bir dizin araması çıkarılabiliyor mu?

Basit kural tabanlı planlayıcı: koşul AND parçalarına bölünür; dizinli bir sütun için
`sütun = sabit`, `sütun IN (sabitler)`, `sütun <,<=,>,>= sabit`, `sütun BETWEEN sabit AND sabit`
parçalarından ilki (eşitlik > IN > aralık önceliğiyle) seçilir. Dizin yalnız ADAYLARI verir; koşulun
tamamı yine Filter'da denetlenir, bu yüzden dizin seçimi sonucu asla değiştirmez (testle kanıtlı).

Genişletme: maliyet tahmini (satır sayısı / seçicilik) eklemek için `choose_index` içinde adayları
puanlayın; birleşmelerde iç tarafa dizinli iç içe döngü (index nested loop) için buradan başlayın.
"""

from __future__ import annotations

from collections.abc import Sequence

from .compile import Compiler, Scope
from .operators import IndexLookup
from .storage import Index, Table
from .syntax import Between, Binary, Column, Expr, InList, Literal, Param, Value, to_sql

_FLIP = {"=": "=", "<": ">", "<=": ">=", ">": "<", ">=": "<="}


def split_and(expr: Expr | None) -> list[Expr]:
    """`a AND (b AND c)` → [a, b, c]."""
    if expr is None:
        return []
    if isinstance(expr, Binary) and expr.op == "and":
        return split_and(expr.left) + split_and(expr.right)
    return [expr]


def _constant(expr: Expr, params: Sequence[Value]) -> tuple[bool, Value]:
    """İfade satırdan bağımsız bir sabit mi? (sabit_mi, değeri)."""
    if isinstance(expr, Literal | Param):
        return True, Compiler(Scope([]), params).compile(expr)(())
    return False, None


def _index_on(table: Table, alias: str, expr: Expr) -> Index | None:
    if not isinstance(expr, Column) or expr.table != alias:
        return None
    return next((i for i in table.indexes.values() if i.column_name == expr.name), None)


def _lookup_for(
    table: Table, alias: str, part: Expr, params: Sequence[Value]
) -> tuple[int, Index, IndexLookup] | None:
    """Bir AND parçası için (öncelik, dizin, arama); uygun değilse None. Küçük öncelik = daha
    iyi."""
    text = to_sql(part)
    if isinstance(part, Binary) and part.op in _FLIP:
        for column, other, op in (
            (part.left, part.right, part.op),
            (part.right, part.left, _FLIP[part.op]),
        ):
            index = _index_on(table, alias, column)
            is_constant, value = _constant(other, params)
            if index is None or not is_constant:
                continue
            if op == "=":
                return 0, index, IndexLookup(text, equals=[value])
            bound = (value, op in ("<=", ">="))
            if op in (">", ">="):
                return 2, index, IndexLookup(text, low=bound)
            return 2, index, IndexLookup(text, high=bound)
    if isinstance(part, InList) and not part.negated:
        index = _index_on(table, alias, part.operand)
        constants = [_constant(item, params) for item in part.items]
        if index is not None and all(ok for ok, _ in constants):
            return 1, index, IndexLookup(text, equals=[value for _, value in constants])
    if isinstance(part, Between) and not part.negated:
        index = _index_on(table, alias, part.operand)
        (low_ok, low), (high_ok, high) = _constant(part.low, params), _constant(part.high, params)
        if index is not None and low_ok and high_ok:
            return 2, index, IndexLookup(text, low=(low, True), high=(high, True))
    return None


def choose_index(
    table: Table, alias: str, where: Expr | None, params: Sequence[Value]
) -> tuple[Index, IndexLookup] | None:
    """Nitelikli (qualify edilmiş) WHERE için en iyi dizin araması; yoksa None (tam tarama)."""
    candidates = [
        found
        for part in split_and(where)
        if (found := _lookup_for(table, alias, part, params)) is not None
    ]
    if not candidates:
        return None
    _, index, lookup = min(candidates, key=lambda candidate: candidate[0])
    return index, lookup
