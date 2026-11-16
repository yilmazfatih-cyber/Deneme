"""Zincirlenebilir sorgu kurucu ve `Q` (VE/VEYA/DEĞİL) koşulları — her değer PARAMETRELİ.

    db.query(Not).filter(sahip=ayse, baslik__icontains="liste").exclude(okundu=True)
      .order_by("-olusturma").limit(10).all()
    Q(ad="a") | (Q(yas__gte=18) & ~Q(sehir="İzmir"))
Arama ekleri: eq ne lt lte gt gte in contains icontains startswith isnull.
Güvenlik: değerler hiçbir zaman SQL metnine yapıştırılmaz (`?` yer tutucu); alan adları modeldeki
alanlarla karşılaştırılır (bilinmeyen ad → hata) ve çift tırnakla yazılır. LIKE'taki %, _ ve \\
kaçışlanır. `icontains` Türkçe büyük/küçük harfi doğru eşler (İ↔i, I↔ı) — SQLite'ın LIKE'ı yalnız
ASCII'yi bilir.
Genişletme: yeni bir arama eki için `_LOOKUPS`'a bir satır ve `tests/orm/test_sorgu.py`'ye test
ekleyin.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING, Any, Generic, TypeVar

from orm.fields import ForeignKey, ValidationError
from orm.model import Model, Reverse, field_for

if TYPE_CHECKING:
    from orm.db import Database

M = TypeVar("M", bound=Model)
_LOOKUPS = {"eq": "=", "ne": "!=", "lt": "<", "lte": "<=", "gt": ">", "gte": ">="}


def escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


class Q:
    """Koşul ağacı düğümü. Yaprak: (anahtar, değer) çiftleri VE ile bağlanır."""

    def __init__(self, *children: Q, **conditions: Any) -> None:
        self.children: list[Q | tuple[str, Any]] = [*children, *conditions.items()]
        self.connector = "AND"
        self.negated = False

    def _combine(self, other: Q, connector: str) -> Q:
        node = Q(self, other)
        node.connector = connector
        return node

    def __and__(self, other: Q) -> Q:
        return self._combine(other, "AND")

    def __or__(self, other: Q) -> Q:
        return self._combine(other, "OR")

    def __invert__(self) -> Q:
        node = Q(self)
        node.negated = True
        return node

    def compile(self, model: type[Model]) -> tuple[str, list[Any]]:
        parts: list[str] = []
        params: list[Any] = []
        for child in self.children:
            if isinstance(child, Q):
                sql, child_params = child.compile(model)
            else:
                sql, child_params = _condition(model, *child)
            parts.append(f"({sql})")
            params.extend(child_params)
        sql = f" {self.connector} ".join(parts) or "1"
        return (f"NOT ({sql})" if self.negated else sql), params


def _db_value(field: Any, value: Any) -> Any:
    if isinstance(value, Model):
        return value.id
    return value if isinstance(field, ForeignKey) else field.to_db(value)


def _condition(model: type[Model], key: str, value: Any) -> tuple[str, list[Any]]:
    name, _, lookup = key.partition("__")
    field = field_for(model, name)
    column = f'"{field.column}"'
    lookup = lookup or "eq"
    if lookup == "isnull":
        return f"{column} IS {'' if value else 'NOT '}NULL", []
    if lookup == "in":
        values = [_db_value(field, v) for v in value]
        if not values:
            return "0", []  # boş IN listesi hiçbir satırla eşleşmez
        return f"{column} IN ({', '.join('?' for _ in values)})", values
    if lookup in ("contains", "startswith"):
        pattern = escape_like(str(value)) + "%"
        pattern = "%" + pattern if lookup == "contains" else pattern
        return f"{column} LIKE ? ESCAPE '\\'", [pattern]
    if lookup == "icontains":
        return f"tr_lower({column}) LIKE tr_lower(?) ESCAPE '\\'", [f"%{escape_like(str(value))}%"]
    if lookup not in _LOOKUPS:
        raise ValidationError(f"Bilinmeyen arama eki: __{lookup}")
    if value is None:
        raise ValidationError(f"None ile karşılaştırma için {name}__isnull=True kullanın.")
    return f"{column} {_LOOKUPS[lookup]} ?", [_db_value(field, value)]


class Query(Generic[M]):
    def __init__(self, db: Database, model: type[M]) -> None:
        self.db = db
        self.model = model
        self._where: list[Q] = []
        self._order: list[str] = []
        self._limit: int | None = None
        self._offset = 0
        self._prefetch: list[str] = []

    def _clone(self) -> Query[M]:
        clone = Query(self.db, self.model)
        clone._where, clone._order = list(self._where), list(self._order)
        clone._limit, clone._offset, clone._prefetch = (
            self._limit,
            self._offset,
            list(self._prefetch),
        )
        return clone

    def filter(self, *conditions: Q, **lookups: Any) -> Query[M]:
        clone = self._clone()
        clone._where.append(Q(*conditions, **lookups))
        return clone

    def exclude(self, *conditions: Q, **lookups: Any) -> Query[M]:
        clone = self._clone()
        clone._where.append(~Q(*conditions, **lookups))
        return clone

    def order_by(self, *names: str) -> Query[M]:
        clone = self._clone()
        for name in names:
            field = field_for(self.model, name.removeprefix("-"))
            clone._order.append(f'"{field.column}" {"DESC" if name.startswith("-") else "ASC"}')
        return clone

    def limit(self, count: int, offset: int = 0) -> Query[M]:
        if count < 0 or offset < 0:
            raise ValueError("limit ve offset negatif olamaz.")
        clone = self._clone()
        clone._limit, clone._offset = count, offset
        return clone

    def prefetch(self, *names: str) -> Query[M]:
        """İlişkileri tek ek sorguyla önceden yükler (N+1 sorununu önler)."""
        for name in names:
            if not isinstance(getattr(self.model, name, None), ForeignKey | Reverse):
                raise ValidationError(
                    f"'{name}' bir ilişki değil (ForeignKey ya da Reverse olmalı)."
                )
        clone = self._clone()
        clone._prefetch.extend(names)
        return clone

    def _sql(self, select: str) -> tuple[str, list[Any]]:
        where, params = Q(*self._where).compile(self.model)
        sql = f'SELECT {select} FROM "{self.model.table}" WHERE {where}'
        if self._order:
            sql += " ORDER BY " + ", ".join(self._order)
        if self._limit is not None or self._offset:
            sql += " LIMIT ? OFFSET ?"
            params += [-1 if self._limit is None else self._limit, self._offset]
        return sql, params

    def all(self) -> list[M]:
        rows = self.db.execute(*self._sql("*")).fetchall()
        objects = [self.model.from_row(dict(row), self.db) for row in rows]
        for name in self._prefetch:
            self.db.prefetch(objects, name)
        return objects

    def __iter__(self) -> Iterator[M]:
        return iter(self.all())

    def first(self) -> M | None:
        found = self.limit(1, self._offset).all()
        return found[0] if found else None

    def count(self) -> int:
        sql, params = self._sql("COUNT(*)")
        return int(self.db.execute(sql, params).fetchone()[0])

    def exists(self) -> bool:
        return self.limit(1, self._offset).count() > 0

    def delete(self) -> int:
        where, params = Q(*self._where).compile(self.model)
        return self.db.execute(f'DELETE FROM "{self.model.table}" WHERE {where}', params).rowcount

    def update(self, **values: Any) -> int:
        """Toplu güncelleme (model doğrulaması alan düzeyinde yapılır, `clean()` çağrılmaz)."""
        assignments, params = [], []
        for name, value in values.items():
            field = field_for(self.model, name)
            assignments.append(f'"{field.column}" = ?')
            params.append(_db_value(field, value))
        where, where_params = Q(*self._where).compile(self.model)
        sql = f'UPDATE "{self.model.table}" SET {", ".join(assignments)} WHERE {where}'
        return self.db.execute(sql, params + where_params).rowcount
