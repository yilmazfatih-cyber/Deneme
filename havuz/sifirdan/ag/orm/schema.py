"""Şema: CREATE TABLE üretimi ve basit migrasyon (modelle veritabanı arasındaki farktan ALTER).

    plan = plan_migration(db, [Kullanici, Not])   → [MigrationStep("not.etiket sütunu eklenecek",
    "ALTER …")]
    migrate(db, [Kullanici, Not])                  → planı TEK işlemde uygular (hata olursa hiçbiri)
Desteklenen: yeni tablo, yeni sütun (null=True ya da sabit varsayılanla), sütun silme
(`allow_drop=True` ile; veri kaybolur). Desteklenmeyen (açık hata iletisiyle durur): sütun türü
değişimi, sonradan UNIQUE, varsayılansız NOT NULL sütun. Bunlar için yeni sütun + veri taşıma +
eskiyi silme adımlarını elle yazın.
Genişletme: yeni bir fark türü için `plan_migration`'a dal + `tests/orm/test_migrasyon.py`'ye test.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from typing import TYPE_CHECKING

from orm.fields import Field, ForeignKey
from orm.model import Model

if TYPE_CHECKING:
    from orm.db import Database


class MigrationError(Exception):
    """Migrasyon güvenle otomatik yapılamaz; ileti ne yapılacağını söyler."""


@dataclass(frozen=True)
class MigrationStep:
    description: str
    sql: str


def create_table_sql(model: type[Model]) -> str:
    columns = ", ".join(field.column_sql() for field in model.fields.values())
    return f'CREATE TABLE "{model.table}" ({columns})'


def _index_sql(model: type[Model], field: Field) -> str:
    return (
        f'CREATE INDEX IF NOT EXISTS "ix_{model.table}_{field.column}" '
        f'ON "{model.table}" ("{field.column}")'
    )


def _needs_index(field: Field) -> bool:
    return field.index or isinstance(field, ForeignKey)


def _add_column_steps(model: type[Model], field: Field) -> list[MigrationStep]:
    where = f"{model.table}.{field.column}"
    if field.unique or field.primary_key:
        raise MigrationError(f"{where}: UNIQUE sütun ALTER ile eklenemez; tabloyu yeniden kurun.")
    static_default = field.has_default() and not callable(field.default)
    if not field.null and not static_default:
        raise MigrationError(
            f"{where}: NOT NULL ve varsayılansız; null=True ya da sabit default verin."
        )
    sql = f'ALTER TABLE "{model.table}" ADD COLUMN {field.column_sql()}'
    steps = [MigrationStep(f"{where} sütunu eklenecek", sql)]
    if _needs_index(field):
        steps.append(MigrationStep(f"{where} dizini", _index_sql(model, field)))
    return steps


def plan_migration(
    db: Database, models: list[type[Model]], allow_drop: bool = False
) -> list[MigrationStep]:
    rows = db.execute("SELECT name FROM sqlite_master WHERE type = 'table'").fetchall()
    existing = {row[0] for row in rows}
    steps: list[MigrationStep] = []
    for model in models:
        if model.table not in existing:
            steps.append(
                MigrationStep(f"{model.table} tablosu oluşturulacak", create_table_sql(model))
            )
            for field in model.fields.values():
                if _needs_index(field):
                    steps.append(
                        MigrationStep(
                            f"{model.table}.{field.column} dizini", _index_sql(model, field)
                        )
                    )
            continue
        info = {
            row["name"]: row for row in db.execute(f'PRAGMA table_info("{model.table}")').fetchall()
        }
        wanted = {field.column: field for field in model.fields.values()}
        for column, field in wanted.items():
            if column not in info:
                steps += _add_column_steps(model, field)
            elif str(info[column]["type"]).upper() != field.sql_type:
                old_type = info[column]["type"]
                raise MigrationError(
                    f"{model.table}.{column}: tür {old_type} → {field.sql_type} değişimi otomatik "
                    "yapılmaz; yeni sütun ekleyip veriyi taşıyın."
                )
        for column in info:
            if column in wanted:
                continue
            if not allow_drop:
                raise MigrationError(
                    f"{model.table}.{column} modelde yok. Sütun silinecek ve VERİSİ KAYBOLACAK; "
                    "eminseniz migrate(..., allow_drop=True) ile çalıştırın."
                )
            steps += _drop_column_steps(db, model.table, column)
    return steps


def _drop_column_steps(db: Database, table: str, column: str) -> list[MigrationStep]:
    """Sütunu silmeden önce onu kullanan dizinleri siler (SQLite aksi hâlde reddeder)."""
    steps: list[MigrationStep] = []
    for index in db.execute(f'PRAGMA index_list("{table}")').fetchall():
        columns = [row["name"] for row in db.execute(f'PRAGMA index_info("{index["name"]}")')]
        if column not in columns:
            continue
        if index["origin"] != "c":  # "u": UNIQUE kısıtı, "pk": birincil anahtar
            raise MigrationError(
                f"{table}.{column} bir UNIQUE/PK kısıtına bağlı; tabloyu yeniden kurun."
            )
        steps.append(
            MigrationStep(f"{table}.{column} dizini silinecek", f'DROP INDEX "{index["name"]}"')
        )
    sql = f'ALTER TABLE "{table}" DROP COLUMN "{column}"'
    steps.append(MigrationStep(f"{table}.{column} sütunu silinecek", sql))
    return steps


def migrate(
    db: Database, models: list[type[Model]], allow_drop: bool = False
) -> list[MigrationStep]:
    steps = plan_migration(db, models, allow_drop)
    with db.transaction():
        for step in steps:
            try:
                db.execute(step.sql)
            except sqlite3.OperationalError as exc:  # ör. yabancı anahtarda kullanılan sütunu silme
                raise MigrationError(f"'{step.description}' uygulanamadı: {exc}") from exc
    return steps
