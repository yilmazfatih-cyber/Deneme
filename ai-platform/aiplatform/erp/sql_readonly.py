"""Salt-okunur SQL bağlayıcısı (Text2SQL ve iş akışı ajanının okuma aracı).

Savunma katmanları (dıştan içe):
  1. ERP'de YALNIZ SELECT yetkili veritabanı kullanıcısı  ← asıl güvence, kurulumda zorunlu
  2. Sürücü düzeyi: SQLite `PRAGMA query_only=1` (+ yetkilendirici geri çağrısı: yalnız izinli tablolar),
     PostgreSQL her işlemde `SET TRANSACTION READ ONLY` + `statement_timeout`;
     MSSQL/MySQL'de sürücü düzeyi kilit uygulanmaz → `capabilities()` bunu açıkça söyler
  3. Sorgu denetimi: sqlglot varsa ayrıştırma (tek SELECT, beyaz liste tablolar), yoksa anahtar kelime kara listesi
  4. LIMIT eklenir, en çok `max_rows` satır döner, zaman aşımı uygulanır
"""

from __future__ import annotations

import datetime as _dt
import decimal
import logging
import re
import sqlite3
import time
from typing import Any

from sqlalchemy import create_engine, event, inspect, literal_column, select, table, text
from sqlalchemy.exc import SQLAlchemyError

from . import READONLY_WARNING
from .connector import ERPConnector, ErpError, SQLRejectedError, make_tool

try:  # isteğe bağlı: pip install aiplatform[text2sql]
    import sqlglot
    from sqlglot import exp as sg_exp
except ImportError:  # pragma: no cover - ortama bağlı
    sqlglot = None
    sg_exp = None

log = logging.getLogger("aiplatform.erp.sql")

FORBIDDEN_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE", "EXEC", "EXECUTE",
    "PRAGMA", "ATTACH", "DETACH", "MERGE", "CALL", "COPY", "VACUUM", "INTO", "SHUTDOWN",
]  # fmt: skip
FORBIDDEN_FUNCTIONS = [
    "load_extension", "readfile", "writefile", "pg_read_file", "pg_read_binary_file", "pg_ls_dir", "pg_sleep",
    "dblink", "lo_import", "lo_export", "xp_cmdshell", "openrowset", "opendatasource", "sleep", "benchmark",
]  # fmt: skip
_KW_RE = re.compile(r"\b(" + "|".join(FORBIDDEN_KEYWORDS) + r")\b", re.IGNORECASE)
_FN_RE = re.compile(r"\b(" + "|".join(FORBIDDEN_FUNCTIONS) + r")\s*\(", re.IGNORECASE)

# Kişisel veri olabilecek sütun adları (alt çizgiyle ayrılmış parçalar veya ad içinde geçen kökler)
PERSONAL_TOKENS = {"ad", "adi", "soyad", "soyadi", "isim", "tc", "tckn", "kimlik", "telefon", "tel", "gsm", "cep",
                   "email", "eposta", "mail", "iban", "adres"}  # fmt: skip
PERSONAL_SUBSTRINGS = ("soyad", "telefon", "email", "eposta", "e_posta", "iban", "tckn", "kimlik_no", "adres")

_SQLGLOT_DIALECT = {
    "sqlite": "sqlite",
    "postgresql": "postgres",
    "mssql": "tsql",
    "mysql": "mysql",
    "mariadb": "mysql",
}


def is_personal_column(name: str) -> bool:
    n = name.lower()
    if any(s in n for s in PERSONAL_SUBSTRINGS):
        return True
    return any(part in PERSONAL_TOKENS for part in re.split(r"[_\W]+", n) if part)


def _jsonable(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<ikili {len(bytes(v))} bayt>"
    return str(v)


def _short(v: Any, n: int = 40) -> str:
    s = "NULL" if v is None else str(_jsonable(v))
    return s if len(s) <= n else s[: n - 1] + "…"


def _strip_comments_and_strings(sql: str) -> str:
    """Yorumları siler, metin sabitlerini '' ile değiştirir (anahtar kelime taraması için)."""
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.DOTALL)
    sql = re.sub(r"--[^\n]*", " ", sql)
    return re.sub(r"'(?:[^']|'')*'", "''", sql)


class SQLReadOnlyConnector(ERPConnector):
    kind = "sql"
    read_only = True

    def __init__(self, url: str, allowed_tables: list[str] | None, *, use_sqlglot: bool | None = None):
        self.url = url
        self.allowed = [t.strip().lower() for t in (allowed_tables or []) if t and t.strip()]
        self.use_sqlglot = (
            (sqlglot is not None) if use_sqlglot is None else (use_sqlglot and sqlglot is not None)
        )
        try:
            kwargs: dict[str, Any] = {"pool_pre_ping": True}
            if url.startswith("sqlite"):
                kwargs["connect_args"] = {"check_same_thread": False}
            self.engine = create_engine(url, **kwargs)
        except (ImportError, ModuleNotFoundError) as e:
            raise ErpError(
                "driver_missing",
                f"Veritabanı sürücüsü kurulu değil: {e}",
                "pip install 'aiplatform[erp-sql]'",
            ) from e
        except SQLAlchemyError as e:
            raise ErpError(
                "bad_url", f"Bağlantı adresi geçersiz: {e}", "ör. postgresql+psycopg://okuyucu:***@sunucu/erp"
            ) from e
        self.dialect = self.engine.dialect.name
        if self.dialect == "sqlite":
            event.listen(self.engine, "connect", self._sqlite_on_connect)

    # ------------------------------------------------------------------ sürücü düzeyi salt-okunur
    @staticmethod
    def _sqlite_on_connect(dbapi_conn, _record) -> None:
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA query_only=1")
        cur.close()

    def capabilities(self) -> dict:
        if self.dialect == "sqlite":
            enforcement, note = "surucu", "SQLite: PRAGMA query_only=1 ve tablo yetkilendiricisi uygulanır."
        elif self.dialect == "postgresql":
            enforcement, note = (
                "surucu",
                "PostgreSQL: her sorgu SET TRANSACTION READ ONLY ve statement_timeout ile çalışır.",
            )
        else:
            enforcement = "kullanici"
            note = (
                f"{self.dialect}: sürücü düzeyinde salt-okunur kilit uygulanmıyor; bağlantı kullanıcısının "
                "yalnız SELECT yetkisi olması ZORUNLUDUR. Zaman aşımı yalnız satır okuma sınırıyla sağlanır."
            )
        return {
            "kind": self.kind,
            "dialect": self.dialect,
            "read_only": True,
            "read_only_enforcement": enforcement,
            "validator": "sqlglot" if self.use_sqlglot else "anahtar-kelime",
            "allowed_tables": self.allowed,
            "note": note,
            "warning": READONLY_WARNING,
        }

    # ------------------------------------------------------------------ beyaz liste
    def _table_allowed(self, name: str, schema: str | None = None) -> bool:
        name = name.strip('"`[]').lower()
        if schema:
            schema = schema.strip('"`[]').lower()
            return f"{schema}.{name}" in self.allowed
        return name in self.allowed or name in {a.split(".")[-1] for a in self.allowed}

    def _split_allowed(self, entry: str) -> tuple[str | None, str]:
        if "." in entry:
            schema, name = entry.rsplit(".", 1)
            return schema, name
        return None, entry

    # ------------------------------------------------------------------ sorgu denetimi
    def prepare_sql(self, sql: str, max_rows: int = 500) -> str:
        """Sorguyu denetler ve LIMIT ekler. Uygun değilse SQLRejectedError."""
        if not isinstance(sql, str) or not sql.strip():
            raise SQLRejectedError("Boş sorgu.")
        if not self.allowed:
            raise SQLRejectedError(
                "Bu bağlantıda izinli tablo yok.", "Bağlantı ayarlarında tablo beyaz listesi tanımlayın."
            )
        cleaned = _strip_comments_and_strings(sql)
        m = _FN_RE.search(cleaned)
        if m:
            raise SQLRejectedError(f"İzin verilmeyen fonksiyon: {m.group(1)}")
        if self.use_sqlglot:
            return self._prepare_sqlglot(sql, max_rows)
        return self._prepare_keywords(sql, cleaned, max_rows)

    def _prepare_sqlglot(self, sql: str, max_rows: int) -> str:
        dialect = _SQLGLOT_DIALECT.get(self.dialect)
        try:
            trees = [t for t in sqlglot.parse(sql, read=dialect) if t is not None]
        except sqlglot.errors.ParseError as e:
            raise SQLRejectedError(f"SQL ayrıştırılamadı: {str(e).splitlines()[0]}") from e
        if len(trees) != 1:
            raise SQLRejectedError("Tek bir sorgu gönderin; birden çok ifade çalıştırılmaz.")
        tree = trees[0]
        query_types = tuple(
            c for c in (sg_exp.Select, getattr(sg_exp, "SetOperation", None), sg_exp.Union) if c
        )
        if not isinstance(tree, query_types):
            raise SQLRejectedError(f"Yalnız SELECT sorgusu çalıştırılır (gelen: {tree.key.upper()}).")
        forbidden = [
            getattr(sg_exp, n)
            for n in ("Insert", "Update", "Delete", "Drop", "Create", "Alter", "AlterTable", "Command", "Merge",
                      "TruncateTable", "Pragma", "Into", "Lock", "Grant", "Use", "Set", "Transaction")
            if hasattr(sg_exp, n)
        ]  # fmt: skip
        for node in tree.walk():
            if isinstance(node, tuple(forbidden)):
                raise SQLRejectedError(f"Sorguda izin verilmeyen ifade var: {node.key.upper()}")
        cte_names = {c.alias_or_name.lower() for c in tree.find_all(sg_exp.CTE)}
        for t in tree.find_all(sg_exp.Table):
            if not isinstance(t.this, sg_exp.Identifier):
                raise SQLRejectedError("FROM içinde tablo fonksiyonu kullanılamaz.")
            if not t.db and t.name.lower() in cte_names:
                continue
            if not self._table_allowed(t.name, t.db or None):
                full = f"{t.db}.{t.name}" if t.db else t.name
                raise SQLRejectedError(
                    f"'{full}' tablosu izinli tablolar arasında değil.",
                    f"İzinli tablolar: {', '.join(self.allowed)}",
                )
        if tree.args.get("limit") is None and tree.args.get("fetch") is None:
            tree = tree.limit(max_rows + 1)
        return tree.sql(dialect=dialect)

    def _prepare_keywords(self, sql: str, cleaned: str, max_rows: int) -> str:
        body = sql.strip().rstrip(";").strip()
        cleaned = cleaned.strip().rstrip(";").strip()
        if ";" in cleaned:
            raise SQLRejectedError("Tek bir sorgu gönderin; birden çok ifade çalıştırılmaz.")
        if not re.match(r"(?is)^\s*(select|with)\b", cleaned):
            raise SQLRejectedError("Yalnız SELECT sorgusu çalıştırılır.")
        m = _KW_RE.search(cleaned)
        if m:
            raise SQLRejectedError(f"Sorguda izin verilmeyen anahtar kelime var: {m.group(1).upper()}")
        cte_names = {n.lower() for n in re.findall(r"(?i)\b(\w+)\s+as\s*\(", cleaned)}
        stop = (r"where|group|order|having|limit|union|intersect|except|join|inner|left|right|full|cross|natural|"
                r"on|using|window|offset|fetch|select|from")  # fmt: skip
        pattern = re.compile(rf"(?is)\b(?:from|join)\s+(.+?)(?=\b(?:{stop})\b|\)|$)")
        for seg in pattern.findall(cleaned):
            for part in seg.split(","):
                part = part.strip()
                if not part or part.startswith("("):
                    continue
                name = part.split()[0]
                bare = re.sub(r'["`\[\]]', "", name)
                if not re.fullmatch(r"[\w.]+", bare):
                    raise SQLRejectedError(f"Tablo adı anlaşılamadı: {name}")
                schema, _, tname = bare.rpartition(".")
                if not schema and tname.lower() in cte_names:
                    continue
                if not self._table_allowed(tname, schema or None):
                    raise SQLRejectedError(
                        f"'{bare}' tablosu izinli tablolar arasında değil.",
                        f"İzinli tablolar: {', '.join(self.allowed)}",
                    )
        if re.search(r"(?is)\blimit\s+\d+(\s*(offset|,)\s*\d+)?\s*$", cleaned) or re.search(
            r"(?is)^\s*select\s+top\s+\d+", cleaned
        ):
            return body
        if self.dialect == "mssql":
            return f"SELECT TOP {max_rows + 1} * FROM (\n{body}\n) AS _aip_q"
        return f"SELECT * FROM (\n{body}\n) AS _aip_q LIMIT {max_rows + 1}"

    # ------------------------------------------------------------------ çalıştırma
    def _sqlite_authorizer(self, action, arg1, arg2, _db, _trigger):
        ok, deny = sqlite3.SQLITE_OK, sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_SELECT:
            return ok
        if action == sqlite3.SQLITE_READ:
            return ok if arg1 and self._table_allowed(arg1) else deny
        if action == sqlite3.SQLITE_FUNCTION:
            return deny if (arg2 or "").lower() in FORBIDDEN_FUNCTIONS else ok
        if action == getattr(sqlite3, "SQLITE_RECURSIVE", 33):
            return ok
        return deny

    def run_query(self, sql: str, timeout_s: float = 15, max_rows: int = 500) -> dict:
        max_rows = max(1, min(int(max_rows), 10_000))
        final_sql = self.prepare_sql(sql, max_rows)
        deadline = time.monotonic() + float(timeout_s)
        try:
            with self.engine.connect() as conn:
                raw = None
                if self.dialect == "sqlite":
                    raw = conn.connection.driver_connection
                    raw.set_authorizer(self._sqlite_authorizer)
                    raw.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
                elif self.dialect == "postgresql":
                    conn.exec_driver_sql("SET TRANSACTION READ ONLY")
                    conn.exec_driver_sql(f"SET LOCAL statement_timeout = {int(timeout_s * 1000)}")
                try:
                    res = conn.execute(text(final_sql))
                    columns = list(res.keys())
                    rows = []
                    truncated = False
                    for r in res:
                        if len(rows) >= max_rows:
                            truncated = True
                            break
                        if time.monotonic() > deadline:
                            truncated = True
                            break
                        rows.append([_jsonable(v) for v in r])
                    res.close()
                finally:
                    if raw is not None:
                        raw.set_authorizer(None)
                        raw.set_progress_handler(None, 0)
                    conn.rollback()
        except SQLAlchemyError as e:
            msg = str(getattr(e, "orig", e)).splitlines()[0]
            if (
                "interrupted" in msg.lower()
                or "timeout" in msg.lower()
                or "canceling statement" in msg.lower()
            ):
                raise ErpError(
                    "sql_timeout",
                    f"Sorgu {timeout_s:g} saniyede bitmedi.",
                    "Sorguyu daraltın (tarih aralığı, LIMIT).",
                    408,
                ) from e
            if "not authorized" in msg.lower() or "readonly" in msg.lower() or "read-only" in msg.lower():
                raise SQLRejectedError(f"Veritabanı sorguyu reddetti: {msg}") from e
            raise ErpError(
                "sql_error",
                f"Sorgu çalıştırılamadı: {msg}",
                "Tablo ve sütun adlarını şema özetiyle karşılaştırın.",
            ) from e
        return {
            "columns": columns,
            "rows": rows,
            "row_count": len(rows),
            "truncated": truncated,
            "sql": final_sql,
        }

    # ------------------------------------------------------------------ şema
    def available_tables(self) -> list[str]:
        insp = inspect(self.engine)
        return sorted(insp.get_table_names()) + sorted(f"görünüm:{v}" for v in insp.get_view_names())

    def schema_summary(self, sample_rows: int = 3) -> str:
        if not self.allowed:
            return "-- Bu bağlantıda izinli tablo tanımlı değil."
        insp = inspect(self.engine)
        parts: list[str] = [
            f"-- Veritabanı: {self.dialect}. Yalnız aşağıdaki tablolar sorgulanabilir; yalnız SELECT."
        ]
        for entry in self.allowed:
            schema, name = self._split_allowed(entry)
            try:
                cols = insp.get_columns(name, schema=schema)
            except SQLAlchemyError:
                cols = []
            if not cols:
                parts.append(f"-- {entry}: tablo bulunamadı")
                continue
            try:
                pk = set(insp.get_pk_constraint(name, schema=schema).get("constrained_columns") or [])
            except SQLAlchemyError:
                pk = set()
            try:
                fks = insp.get_foreign_keys(name, schema=schema)
            except SQLAlchemyError:
                fks = []
            lines = []
            for c in cols:
                line = f"  {c['name']} {c['type']}"
                if c["name"] in pk:
                    line += " PRIMARY KEY"
                elif not c.get("nullable", True):
                    line += " NOT NULL"
                lines.append(line)
            for fk in fks:
                lines.append(
                    f"  FOREIGN KEY ({', '.join(fk['constrained_columns'])}) REFERENCES "
                    f"{fk['referred_table']}({', '.join(fk['referred_columns'])})"
                )
            parts.append(f"CREATE TABLE {entry} (\n" + ",\n".join(lines) + "\n);")
            col_names = [c["name"] for c in cols]
            masked = [is_personal_column(n) for n in col_names]
            try:
                with self.engine.connect() as conn:
                    q = select(literal_column("*")).select_from(table(name, schema=schema)).limit(sample_rows)
                    rows = conn.execute(q).fetchall()
                    conn.rollback()
            except SQLAlchemyError as e:
                parts.append(f"-- örnek satırlar okunamadı: {str(getattr(e, 'orig', e)).splitlines()[0]}")
                continue
            if rows:
                parts.append(f"-- örnek satırlar ({entry}): " + " | ".join(col_names))
                for r in rows:
                    vals = ["***" if masked[i] else _short(v) for i, v in enumerate(r)]
                    parts.append("--   " + " | ".join(vals))
            if any(masked):
                parts.append("-- (*** = kişisel veri olabilecek sütun; örnek değer gösterilmez)")
        return "\n".join(parts)

    def test(self) -> dict:
        try:
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))
                conn.rollback()
            available = self.available_tables()
        except SQLAlchemyError as e:
            return {
                "ok": False,
                "message": f"Bağlanılamadı: {str(getattr(e, 'orig', e)).splitlines()[0]}",
                "capabilities": self.capabilities(),
            }
        names = {a.lower() for a in available}
        missing = [t for t in self.allowed if t.split(".")[-1] not in names and t not in names]
        ok = not missing
        msg = (
            "Bağlantı başarılı."
            if ok
            else f"Bağlanıldı ama şu izinli tablolar bulunamadı: {', '.join(missing)}"
        )
        if not self.allowed:
            msg = "Bağlantı başarılı; ancak izinli tablo tanımlı değil."
        return {
            "ok": ok,
            "message": msg,
            "missing_tables": missing,
            "available_tables": available[:300],
            "capabilities": self.capabilities(),
        }

    # ------------------------------------------------------------------ araçlar
    def list_tools(self) -> list[dict]:
        tables = ", ".join(self.allowed) or "(yok)"
        return [
            make_tool(
                "sorgu_calistir",
                f"ERP veritabanında salt-okunur tek bir SELECT sorgusu çalıştırır. İzinli tablolar: {tables}.",
                {
                    "type": "object",
                    "required": ["sql"],
                    "properties": {
                        "sql": {"type": "string", "description": "Tek SELECT sorgusu"},
                        "max_rows": {"type": "integer", "minimum": 1, "maximum": 500, "default": 100},
                    },
                },
            ),
            make_tool(
                "tablo_sema",
                "İzinli tabloların sütunlarını ve örnek satırlarını (kişisel veriler maskeli) döner.",
                {"type": "object", "properties": {}},
            ),
        ]

    def call_tool(self, name: str, args: dict[str, Any]) -> dict:
        args = args or {}
        if name == "sorgu_calistir":
            return self.run_query(args.get("sql", ""), max_rows=int(args.get("max_rows", 100)))
        if name == "tablo_sema":
            return {"schema": self.schema_summary()}
        if self.is_write_tool(name):
            from .connector import ApprovalRequiredError

            raise ApprovalRequiredError(name)
        raise ErpError("unknown_tool", f"Bilinmeyen araç: '{name}'", "GET /api/erp/tools", 404)

    def close(self) -> None:
        self.engine.dispose()
