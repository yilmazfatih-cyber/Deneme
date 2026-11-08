"""N07 Doğal Dil → SQL — salt-okunur ERP sorguları.

Güvenlik katmanları (hepsi zorunlu):
1. LLM yalnız izinli tabloların şemasını görür.
2. Üretilen SQL `sqlglot` ile ayrıştırılır: tek ifade, kökü SELECT (veya SELECT'lerden oluşan UNION/INTERSECT/EXCEPT),
   hiçbir alt düğümde DDL/DML/komut yok, tüm tablolar beyaz listede, LIMIT yoksa eklenir (varsayılan 200).
   sqlglot kurulu değilse sorgu ÇALIŞTIRILMAZ (ModuleNotReady).
3. Çalıştırma `erp.connector.run_readonly` ile salt-okunur bağlantıda (bağlayıcı kendi denetimini de yapar).
"""

from __future__ import annotations

import asyncio
import re

from ..base import register
from ._common import BaseRuntime, ModuleError, RunContext, get_settings, has_package, not_ready, note, require

SCHEMA = {
    "type": "object",
    "required": ["sql", "explanation"],
    "properties": {"sql": {"type": "string"}, "explanation": {"type": "string"}},
}
DEFAULT_LIMIT = 200
_FORBIDDEN_NODES = (
    "Insert",
    "Update",
    "Delete",
    "Drop",
    "Create",
    "Alter",
    "AlterTable",
    "Command",
    "Merge",
    "Into",
    "TruncateTable",
    "Grant",
    "Use",
    "Set",
    "Pragma",
    "Transaction",
    "Commit",
    "Rollback",
    "Copy",
    "LoadData",
    "Kill",
    "Lock",
)
_FORBIDDEN_FUNCS = {
    "pg_sleep",
    "sleep",
    "benchmark",
    "load_file",
    "pg_read_file",
    "pg_ls_dir",
    "xp_cmdshell",
    "dblink",
    "lo_import",
    "lo_export",
    "openrowset",
    "opendatasource",
}


def _bare(name: str) -> str:
    return name.strip().strip('"`[]').split(".")[-1].lower()


def validate_sql(
    sql: str, allowed_tables: list[str], dialect: str | None = None, limit: int = DEFAULT_LIMIT
) -> str:
    """Doğrulanmış ve LIMIT eklenmiş SQL'i döner; kural dışıysa ModuleError."""
    try:
        import sqlglot
        from sqlglot import exp
    except ImportError as e:
        raise not_ready("sqlglot", "dogal-dil-sql") from e

    text = (sql or "").strip().rstrip(";").strip()
    if not text:
        raise ModuleError("Boş SQL")
    try:
        stmts = [s for s in sqlglot.parse(text, read=dialect) if s is not None]
    except Exception as e:  # sqlglot.errors.ParseError
        raise ModuleError(f"SQL ayrıştırılamadı: {str(e)[:200]}") from e
    if len(stmts) != 1:
        raise ModuleError("Yalnız tek bir sorguya izin verilir")
    stmt = stmts[0]
    set_ops = tuple(
        c for c in (getattr(exp, n, None) for n in ("Union", "Intersect", "Except")) if c is not None
    )
    if not isinstance(stmt, (exp.Select, *set_ops)):
        raise ModuleError("Yalnız SELECT sorgularına izin verilir")
    forbidden = tuple(getattr(exp, n) for n in _FORBIDDEN_NODES if hasattr(exp, n))
    bad = stmt.find(*forbidden)
    if bad is not None:
        raise ModuleError(f"Sorguda izin verilmeyen ifade var: {type(bad).__name__}")
    for fn in stmt.find_all(exp.Anonymous):
        if str(fn.name).lower() in _FORBIDDEN_FUNCS:
            raise ModuleError(f"İzin verilmeyen fonksiyon: {fn.name}")

    cte_names = {_bare(c.alias_or_name) for c in stmt.find_all(exp.CTE)}
    tables = {_bare(t.name) for t in stmt.find_all(exp.Table) if t.name} - cte_names
    allowed = {_bare(t) for t in allowed_tables}
    if not allowed:
        raise ModuleError("İzinli tablo listesi boş; bağlantıda tablo beyaz listesi tanımlayın")
    outside = sorted(tables - allowed)
    if outside:
        raise ModuleError(f"İzinli olmayan tablo: {', '.join(outside)}")

    if stmt.args.get("limit") is None:
        try:
            stmt = stmt.limit(limit)
        except AttributeError:  # eski sqlglot: küme işlemlerinde limit() yok
            stmt = sqlglot.parse_one(
                f"SELECT * FROM ({stmt.sql(dialect=dialect)}) AS q LIMIT {int(limit)}", read=dialect
            )
    return stmt.sql(dialect=dialect)


def tables_from_ddl(ddl: str) -> list[str]:
    return sorted(
        {
            _bare(m)
            for m in re.findall(
                r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w.\"`\[\]]+)", ddl or "", re.IGNORECASE
            )
        }
    )


def _connection_tables(cid: str) -> list[str] | None:
    try:
        from ...erp.connector import list_connections
    except ImportError:
        return None
    for c in list_connections():
        if c.get("id") == cid:
            return list(c.get("allowed_tables") or [])
    raise ModuleError(f"ERP bağlantısı bulunamadı: {cid}")


def _connection_dialect(cid: str) -> str | None:
    try:
        from ...erp.connector import get_connector

        engine = getattr(get_connector(cid), "engine", None)
        name = getattr(getattr(engine, "dialect", None), "name", None)
    except Exception:  # noqa: BLE001
        return None
    return {
        "postgresql": "postgres",
        "mssql": "tsql",
        "mysql": "mysql",
        "sqlite": "sqlite",
        "oracle": "oracle",
    }.get(name or "")


@register("dogal-dil-sql")
class DogalDilSql(BaseRuntime):
    uses_llm = True
    requires = ("sqlglot",)

    async def _schema_and_tables(self, payload: dict) -> tuple[str, list[str], str | None]:
        cid = payload.get("connection_id")
        schema_text, tables, dialect = "", [], payload.get("dialect")
        if cid:
            try:
                from ...erp.connector import get_schema_summary
            except ImportError:
                get_schema_summary = None
            if get_schema_summary is not None:
                try:
                    schema_text = await asyncio.to_thread(get_schema_summary, cid)
                except Exception as e:
                    raise ModuleError(getattr(e, "message", None) or str(e)) from e
                conn_tables = await asyncio.to_thread(_connection_tables, cid)
                tables = conn_tables or tables_from_ddl(schema_text)
                if payload.get("allowed_tables"):  # gövde listeyi daraltabilir, genişletemez
                    narrow = {_bare(t) for t in payload["allowed_tables"]}
                    tables = [t for t in tables if _bare(t) in narrow]
                dialect = dialect or _connection_dialect(cid)
        if not schema_text:
            schema_text = str(payload.get("schema_ddl") or "")
            tables = list(
                payload.get("allowed_tables")
                or get_settings().erp_allowed_tables
                or tables_from_ddl(schema_text)
            )
        if not schema_text:
            raise ModuleError("Şema bulunamadı: 'connection_id' (ERP bağlantısı) veya 'schema_ddl' verin")
        return schema_text, tables, dialect

    async def do_schema(self, payload: dict, ctx: RunContext) -> dict:
        schema_text, tables, dialect = await self._schema_and_tables(payload)
        return {"schema": schema_text, "tables": tables, "dialect": dialect}

    async def do_ask(self, payload: dict, ctx: RunContext) -> dict:
        require(payload, "question")
        if not has_package("sqlglot"):
            raise not_ready("sqlglot", "dogal-dil-sql")
        schema_text, tables, dialect = await self._schema_and_tables(payload)
        limit = int(payload.get("limit") or DEFAULT_LIMIT)
        extra = f"İzinli tablolar: {', '.join(tables)}." + (f" SQL lehçesi: {dialect}." if dialect else "")
        user = f"ŞEMA:\n{schema_text}\n\nSORU: {payload['question']}"
        res = await self.llm_prompt(
            ctx, "dogal_dil_sql", user, schema=SCHEMA, system_extra=extra, temperature=0.0
        )
        try:
            sql = validate_sql(str(res.parsed.get("sql", "")), tables, dialect, limit)
        except ModuleError as first_error:  # bir kez düzeltme şansı
            fix = await self.llm_prompt(
                ctx,
                "dogal_dil_sql",
                f"{user}\n\nÖnceki sorgun reddedildi: {first_error}\nÖnceki sorgu: {res.parsed.get('sql')}\nKurallara uyan yeni sorgu yaz.",
                schema=SCHEMA,
                system_extra=extra,
                temperature=0.0,
            )
            res = fix
            sql = validate_sql(str(fix.parsed.get("sql", "")), tables, dialect, limit)
        out = {"sql": sql, "explanation": res.parsed.get("explanation", ""), "columns": [], "rows": []}
        cid = payload.get("connection_id")
        if payload.get("dry_run") or not cid:
            out["dry_run"] = True
            return out
        try:
            from ...erp.connector import run_readonly
        except ImportError:
            out["dry_run"] = True
            note(ctx, run="ERP bağlayıcısı kurulu değil; sorgu çalıştırılmadı")
            return out
        try:
            data = await asyncio.to_thread(run_readonly, cid, sql)
        except Exception as e:
            raise ModuleError(getattr(e, "message", None) or str(e)) from e
        out.update(
            {
                "columns": data.get("columns", []),
                "rows": data.get("rows", []),
                "row_count": data.get("row_count", len(data.get("rows", []))),
                "truncated": data.get("truncated", False),
                "dry_run": False,
            }
        )
        return out
