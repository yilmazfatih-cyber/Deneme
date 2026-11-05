"""Sorguyu güvenli çalıştırma.

--yaz verilmedikçe:
  * yazma ifadeleri (INSERT/UPDATE/DELETE/DROP/...) çalıştırılmadan reddedilir (sqlutil.ensure_read_only);
  * SQLite dosyası salt okunur açılır (file:...?mode=ro);
  * PostgreSQL'de bağlantı oturum düzeyinde salt okunur açılır (default_transaction_read_only=on; COMMIT'ten
    sonra da geçerli), MySQL'de oturum SET SESSION TRANSACTION READ ONLY ile kapatılır; işlem sonunda geri alınır.
--yaz verilse de birden çok ifade içeren sorgu çalıştırılmaz (sqlutil.ensure_single_statement).
Satır sınırı (varsayılan 200) sorguyu değiştirmeden, sonuç okunurken uygulanır.
"""

from __future__ import annotations

import sqlite3
import time
from dataclasses import dataclass, field

from .errors import ExecutionError
from .schema import connect_sqlite, create_engine, detect_dialect
from .sqlutil import ensure_read_only, ensure_single_statement


@dataclass
class QueryResult:
    columns: list[str] = field(default_factory=list)
    rows: list[tuple] = field(default_factory=list)
    truncated: bool = False
    rowcount: int | None = None  # yazma ifadelerinde etkilenen satır


def execute(db: str, sql: str, write: bool = False, limit: int = 200, timeout: float = 30.0) -> QueryResult:
    """Çalıştırma yolu ve okuma denetimi her zaman veritabanı adresinden anlaşılan lehçeye göre seçilir;
    --lehce yalnızca istemi ve SQL ayıklamayı etkiler (yanlış --lehce koruma kipini değiştiremez)."""
    dialect = detect_dialect(db)
    ensure_single_statement(sql, dialect)
    if not write:
        ensure_read_only(sql, dialect)
    if dialect == "sqlite" and not db.strip().lower().startswith("sqlite+"):
        return _execute_sqlite(db, sql, write, limit, timeout)
    return _execute_sqlalchemy(db, sql, write, limit, timeout, dialect)


def _execute_sqlite(db: str, sql: str, write: bool, limit: int, timeout: float) -> QueryResult:
    con = connect_sqlite(db, write=write)
    deadline = time.monotonic() + timeout
    con.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
    try:
        cur = con.execute(sql)
        res = _collect(cur.description, cur.fetchmany, limit)
        if write:
            res.rowcount = cur.rowcount if cur.rowcount >= 0 else None
            con.commit()
        return res
    except sqlite3.OperationalError as exc:
        if "interrupted" in str(exc):
            raise ExecutionError(f"Sorgu {timeout:g} saniyede bitmedi ve durduruldu.") from None
        if "readonly" in str(exc).lower():
            raise ExecutionError("Veritabanı salt okunur açıldı; yazmak için --yaz ekleyin.") from None
        raise ExecutionError(str(exc)) from None
    except sqlite3.Error as exc:
        raise ExecutionError(str(exc)) from None
    finally:
        con.close()


def _execute_sqlalchemy(db: str, sql: str, write: bool, limit: int, timeout: float, dialect: str) -> QueryResult:
    engine = create_engine(db, read_only=not write)  # sqlalchemy yoksa burada anlaşılır bir hata verir
    import sqlalchemy

    try:
        with engine.connect() as conn:
            if dialect == "postgresql":
                if not write:
                    conn.exec_driver_sql("SET TRANSACTION READ ONLY")
                conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout * 1000)}")
            elif dialect == "mysql":
                if not write:
                    conn.exec_driver_sql("SET SESSION TRANSACTION READ ONLY")
                conn.exec_driver_sql(f"SET SESSION MAX_EXECUTION_TIME = {int(timeout * 1000)}")
            # exec_driver_sql: SQLAlchemy ':isim' bağlama ayrıştırması yapılmaz, sorgu olduğu gibi gider
            cur = conn.exec_driver_sql(sql)
            if cur.returns_rows:
                res = _collect([(k,) for k in cur.keys()], cur.fetchmany, limit)
            else:
                res = QueryResult(rowcount=cur.rowcount)
            if write:
                conn.commit()
            else:
                conn.rollback()
            return res
    except sqlalchemy.exc.DBAPIError as exc:
        msg = str(exc.orig) if exc.orig is not None else str(exc)
        raise ExecutionError(msg.strip().splitlines()[0] if msg.strip() else exc.__class__.__name__) from None
    except sqlalchemy.exc.SQLAlchemyError as exc:
        raise ExecutionError(str(exc).splitlines()[0]) from None
    finally:
        engine.dispose()


def _collect(description, fetchmany, limit: int) -> QueryResult:
    if not description:
        return QueryResult()
    cols = [d[0] for d in description]
    rows = [tuple(r) for r in fetchmany(limit + 1)] if limit > 0 else []
    truncated = len(rows) > limit
    return QueryResult(cols, rows[:limit], truncated)
