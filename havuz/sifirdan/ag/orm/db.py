"""Veritabanı bağlantısı: kaydet/sil/getir, işlem (transaction) bağlamı, ilişki ön yükleme, sorgu
sayacı.

    db = Database("notlar.sqlite3")       # ":memory:" testler için
    db.migrate([Kullanici, Not])          # tablo yoksa oluşturur, yeni sütunu ekler
    with db.transaction():                # hata olursa hepsi geri alınır; iç içe kullanılabilir
    (SAVEPOINT)
        db.save(Kullanici(ad="ayse"))
Bağlantı otomatik onay kipindedir; işlemler açıkça BEGIN/COMMIT ile yönetilir. Yabancı anahtarlar
açıktır (PRAGMA foreign_keys). İş parçacıkları aynı bağlantıyı bir kilitle sırayla kullanır (web
örneği için yeterli).
Genişletme: yeni bir toplu işlem (ör. `bulk_insert`) için `save` örneğini izleyin; hep `?`
parametresi.
"""

from __future__ import annotations

import sqlite3
import threading
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from typing import Any, TypeVar

from orm.fields import ForeignKey
from orm.model import Model, Reverse
from orm.query import Query
from orm.schema import MigrationStep, migrate
from orm.turkish import lower_tr

M = TypeVar("M", bound=Model)


def _cache(obj: Model) -> dict[str, Any]:
    """Nesnenin ilişki önbelleği (ForeignKey/Reverse tanımlayıcıları da buraya bakar)."""
    cache: dict[str, Any] = obj.__dict__.setdefault("_related", {})
    return cache


class QueryCounter:
    def __init__(self) -> None:
        self.statements: list[str] = []

    @property
    def count(self) -> int:
        return len(self.statements)


class Database:
    def __init__(self, path: str = ":memory:") -> None:
        self.conn = sqlite3.connect(path, isolation_level=None, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.create_function("tr_lower", 1, lower_tr, deterministic=True)
        self._lock = threading.RLock()
        self._depth = 0
        self._counters: list[QueryCounter] = []

    def close(self) -> None:
        self.conn.close()

    def execute(self, sql: str, params: Sequence[Any] = ()) -> sqlite3.Cursor:
        with self._lock:
            for counter in self._counters:
                counter.statements.append(sql)
            return self.conn.execute(sql, params)

    @contextmanager
    def count_queries(self) -> Iterator[QueryCounter]:
        """Bu blokta çalışan SQL deyimlerini sayar (N+1 sorununu görmek için)."""
        counter = QueryCounter()
        self._counters.append(counter)
        try:
            yield counter
        finally:
            self._counters.remove(counter)

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            name = f"sp{self._depth}"
            self.conn.execute("BEGIN" if self._depth == 0 else f"SAVEPOINT {name}")
            self._depth += 1
            try:
                yield
            except BaseException:
                self._depth -= 1
                self.conn.execute("ROLLBACK" if self._depth == 0 else f"ROLLBACK TO {name}")
                if self._depth:
                    self.conn.execute(f"RELEASE {name}")
                raise
            self._depth -= 1
            self.conn.execute("COMMIT" if self._depth == 0 else f"RELEASE {name}")

    def migrate(self, models: list[type[Model]], allow_drop: bool = False) -> list[MigrationStep]:
        return migrate(self, models, allow_drop)

    def query(self, model: type[M]) -> Query[M]:
        return Query(self, model)

    def get(self, model: type[M], id: int) -> M | None:
        return self.query(model).filter(id=id).first()

    def save(self, obj: Model) -> Model:
        """Yeni nesneyse INSERT, değilse UPDATE. Alanlar burada doğrulanır."""
        row = obj.to_row()
        table = type(obj).table
        columns = ", ".join(f'"{c}"' for c in row)
        if obj.id is None:
            marks = ", ".join("?" for _ in row)
            cursor = self.execute(
                f'INSERT INTO "{table}" ({columns}) VALUES ({marks})', list(row.values())
            )
            obj.id = cursor.lastrowid
        else:
            sets = ", ".join(f'"{c}" = ?' for c in row)
            self.execute(f'UPDATE "{table}" SET {sets} WHERE "id" = ?', [*row.values(), obj.id])
        obj._db = self
        return obj

    def delete(self, obj: Model) -> None:
        if obj.id is None:
            raise ValueError("Kaydedilmemiş nesne silinemez.")
        self.execute(f'DELETE FROM "{type(obj).table}" WHERE "id" = ?', [obj.id])
        obj.id = None

    def prefetch(self, objects: list[M], name: str) -> None:
        """`objects` için `name` ilişkisini TEK sorguyla yükleyip her nesnenin önbelleğine koyar."""
        if not objects:
            return
        relation = getattr(type(objects[0]), name)
        if isinstance(relation, ForeignKey):
            keys = {o.__dict__.get(relation.column) for o in objects} - {None}
            related = self.query(relation.resolve_model()).filter(id__in=sorted(keys)).all()
            by_id = {r.id: r for r in related}
            for obj in objects:
                _cache(obj)[name] = by_id.get(obj.__dict__.get(relation.column))
        elif isinstance(relation, Reverse):
            model, field = relation.target()
            children = (
                self.query(model).filter(**{f"{field.column}__in": [o.id for o in objects]}).all()
            )
            grouped: dict[int, list[Model]] = {}
            for child in children:
                grouped.setdefault(child.__dict__[field.column], []).append(child)
            for obj in objects:
                _cache(obj)[name] = grouped.get(obj.id or -1, [])
