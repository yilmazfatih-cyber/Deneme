"""Hat depoları: JSONL, CSV, SQLite ve (kuruluysa) DuckDB — hepsi anahtara göre "upsert" eder.

Idempotent yükleme: aynı satırları ikinci kez yüklemek hiçbir şeyi değiştirmez (``degismeyen``
artar); anahtarı aynı ama içeriği farklı satır güncellenir; yeni anahtar eklenir.
SQL her zaman parametrelidir; tablo/sütun adları (parametre olamazlar) ``_check_name`` ile
yalnız küçük harf, rakam ve alt çizgiye izin verilerek denetlenir.
Tutarlar (``Decimal``) SQL'de METİN olarak saklanır (kuruş kaybı olmasın); hesaplarken
``CAST(x AS DECIMAL(18,4))`` kullanın.
Genişletme: yeni bir depo için ``upsert`` + ``read`` yöntemli bir sınıf yazın ve ``open_store``
içine adını ekleyin; ``tests/test_hat.py``deki depo testine ekleyin.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Protocol

from verihavuzu.files import cell_text, read_csv, read_jsonl, write_csv, write_jsonl

Row = dict[str, Any]
_NAME = re.compile(r"[a-z_][a-z0-9_]*")


@dataclass
class UpsertStats:
    eklenen: int = 0
    guncellenen: int = 0
    degismeyen: int = 0


class Store(Protocol):
    def upsert(self, table: str, rows: Sequence[Row], key: Sequence[str]) -> UpsertStats: ...
    def read(self, table: str) -> list[Row]: ...
    def close(self) -> None: ...


def _check_name(name: str) -> str:
    if not _NAME.fullmatch(name):
        raise ValueError(f"Geçersiz tablo/sütun adı: {name!r} (yalnız a-z, 0-9 ve _ kullanın).")
    return name


def _plain(value: Any) -> Any:
    """Dosyaya yazılacak sade değer: Decimal → metin (kesinlik korunur), tarih → ISO metin."""
    if value is None or isinstance(value, bool | int | float | str):
        return value
    return cell_text(value)


def _merge(
    existing: list[Row], rows: Sequence[Row], key: Sequence[str]
) -> tuple[list[Row], UpsertStats]:
    stats = UpsertStats()
    by_key = {tuple(str(row.get(k)) for k in key): row for row in existing}
    for row in rows:
        plain = {name: _plain(value) for name, value in row.items()}
        identity = tuple(str(plain.get(k)) for k in key)
        current = by_key.get(identity)
        if current is None:
            stats.eklenen += 1
        elif {k: cell_text(v) for k, v in current.items()} == {
            k: cell_text(v) for k, v in plain.items()
        }:
            stats.degismeyen += 1
            continue
        else:
            stats.guncellenen += 1
        by_key[identity] = plain
    merged = [by_key[identity] for identity in sorted(by_key)]
    return merged, stats


class JsonlStore:
    """Her tablo bir ``<klasör>/<tablo>.jsonl`` dosyası; yükleme dosyayı atomik yeniden yazar."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def read(self, table: str) -> list[Row]:
        path = self.directory / f"{_check_name(table)}.jsonl"
        return read_jsonl(path) if path.is_file() else []

    def upsert(self, table: str, rows: Sequence[Row], key: Sequence[str]) -> UpsertStats:
        merged, stats = _merge(self.read(table), rows, key)
        write_jsonl(self.directory / f"{table}.jsonl", merged)
        return stats

    def close(self) -> None:
        """Dosya deposunda açık kaynak yoktur; arayüz birliği için vardır."""


class CsvStore:
    """Her tablo bir ``<klasör>/<tablo>.csv`` dosyası (değerler metin olarak okunur)."""

    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def read(self, table: str) -> list[Row]:
        path = self.directory / f"{_check_name(table)}.csv"
        return [dict(row) for row in read_csv(path)] if path.is_file() else []

    def upsert(self, table: str, rows: Sequence[Row], key: Sequence[str]) -> UpsertStats:
        text_rows = [{k: cell_text(v) for k, v in row.items()} for row in rows]
        merged, stats = _merge(self.read(table), text_rows, key)
        write_csv(self.directory / f"{table}.csv", merged)
        return stats

    def close(self) -> None:
        """Dosya deposunda açık kaynak yoktur; arayüz birliği için vardır."""


def _sql_type(value: Any) -> str:
    """64 bitlik türler: DuckDB'de REAL/INTEGER 32 bittir; SQLite bu adları da doğru eşler."""
    if isinstance(value, bool | int):
        return "BIGINT"
    if isinstance(value, float):
        return "DOUBLE"
    return "TEXT"


class SqlStore:
    """SQLite (ya da DB-API uyumlu DuckDB) bağlantısı üzerinde anahtarlı upsert."""

    def __init__(self, connection: Any) -> None:
        self.connection = connection

    def _columns(self, table: str) -> list[str]:
        try:
            cursor = self.connection.execute(f"SELECT * FROM {table} LIMIT 0")  # noqa: S608
        except Exception:
            return []
        return [item[0] for item in cursor.description]

    def _ensure(self, table: str, rows: Sequence[Row], key: Sequence[str]) -> list[str]:
        columns = list(dict.fromkeys(_check_name(c) for row in rows for c in row))
        sample = {c: next((r[c] for r in rows if r.get(c) is not None), None) for c in columns}
        existing = self._columns(table)
        if not existing:
            definitions = ", ".join(f"{c} {_sql_type(sample[c])}" for c in columns)
            primary = ", ".join(_check_name(k) for k in key)
            self.connection.execute(
                f"CREATE TABLE {table} ({definitions}, PRIMARY KEY ({primary}))"
            )
            return columns
        for column in columns:
            if column not in existing:
                self.connection.execute(
                    f"ALTER TABLE {table} ADD COLUMN {column} {_sql_type(sample[column])}"
                )
        return existing + [c for c in columns if c not in existing]

    def upsert(self, table: str, rows: Sequence[Row], key: Sequence[str]) -> UpsertStats:
        _check_name(table)
        stats = UpsertStats()
        if not rows:
            return stats
        columns = self._ensure(table, rows, key)
        where = " AND ".join(f"{k} = ?" for k in key)
        for row in rows:
            values = {
                c: (cell_text(v) if isinstance(v, Decimal) else _plain(v)) for c, v in row.items()
            }
            params = [values.get(k) for k in key]
            query = f"SELECT {', '.join(columns)} FROM {table} WHERE {where}"  # noqa: S608
            found = self.connection.execute(query, params).fetchone()
            if found is None:
                names = list(values)
                marks = ", ".join("?" for _ in names)
                self.connection.execute(
                    f"INSERT INTO {table} ({', '.join(names)}) VALUES ({marks})",  # noqa: S608
                    [values[n] for n in names],
                )
                stats.eklenen += 1
                continue
            current = dict(zip(columns, found, strict=True))
            if all(cell_text(current.get(c)) == cell_text(v) for c, v in values.items()):
                stats.degismeyen += 1
                continue
            assignments = ", ".join(f"{c} = ?" for c in values)
            self.connection.execute(
                f"UPDATE {table} SET {assignments} WHERE {where}",  # noqa: S608
                [*values.values(), *params],
            )
            stats.guncellenen += 1
        self.connection.commit()
        return stats

    def read(self, table: str) -> list[Row]:
        columns = self._columns(_check_name(table))
        if not columns:
            return []
        cursor = self.connection.execute(f"SELECT * FROM {table}")  # noqa: S608
        return [dict(zip(columns, values, strict=True)) for values in cursor.fetchall()]

    def close(self) -> None:
        self.connection.close()


def open_store(kind: str, path: Path) -> JsonlStore | CsvStore | SqlStore:
    """``kind``: jsonl, csv, sqlite ya da duckdb. ``path`` klasör (jsonl/csv) ya da dosyadır."""
    if kind == "jsonl":
        return JsonlStore(path)
    if kind == "csv":
        return CsvStore(path)
    if kind == "sqlite":
        path.parent.mkdir(parents=True, exist_ok=True)
        return SqlStore(sqlite3.connect(path))
    if kind == "duckdb":
        try:
            import duckdb
        except ImportError as error:
            raise RuntimeError('DuckDB deposu için: pip install -e ".[analiz]"') from error
        path.parent.mkdir(parents=True, exist_ok=True)
        return SqlStore(duckdb.connect(str(path)))
    raise ValueError(f"Bilinmeyen depo türü: {kind} (jsonl, csv, sqlite, duckdb).")
