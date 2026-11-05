"""Veritabanı şemasını çıkarır ve modele verilecek kısa DDL metnine çevirir.

SQLite: standart kütüphane (``sqlite3``), salt okunur açılır.
PostgreSQL / MySQL: SQLAlchemy (``pip install -e ".[db]"``), tembel içe aktarılır.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from .errors import MissingExtraError, SchemaError

DIALECTS = ("sqlite", "postgresql", "mysql")
DIALECT_NAMES = {"sqlite": "SQLite", "postgresql": "PostgreSQL", "mysql": "MySQL"}


@dataclass
class Column:
    name: str
    type: str = ""
    primary_key: bool = False
    not_null: bool = False
    references: tuple[str, str] | None = None  # (tablo, sütun)
    comment: str = ""  # SQLite CREATE metnindeki "-- ..." açıklaması ya da veritabanı yorumu


@dataclass
class Table:
    name: str
    columns: list[Column] = field(default_factory=list)
    kind: str = "table"  # "table" | "view"
    composite_pk: list[str] = field(default_factory=list)
    sample_columns: list[str] = field(default_factory=list)
    sample_rows: list[tuple] = field(default_factory=list)


@dataclass
class Schema:
    dialect: str
    tables: list[Table] = field(default_factory=list)

    def table_names(self) -> list[str]:
        return [t.name for t in self.tables]

    def to_ddl(self, include_samples: bool = True) -> str:
        return "\n\n".join(_table_ddl(t, self.dialect, include_samples) for t in self.tables)


# --------------------------------------------------------------------------- bağlantı adresi


def detect_dialect(db: str) -> str:
    """Bağlantı adresinden ya da dosya yolundan lehçeyi çıkarır."""
    low = db.strip().lower()
    if low.startswith(("postgresql", "postgres:", "postgres+", "pgsql:")):
        return "postgresql"
    if low.startswith(("mysql", "mariadb")):
        return "mysql"
    if low.startswith("sqlite") or "://" not in low:
        return "sqlite"
    raise SchemaError(f"Veritabanı adresi tanınmadı: {db}. Örnek: dukkan.sqlite, postgresql://kullanici@localhost/vt, mysql://kullanici@localhost/vt")


def sqlite_path(db: str) -> Path:
    """'sqlite:///yol.db' ya da düz dosya yolu -> Path."""
    s = db.strip()
    if s.lower().startswith("sqlite:///"):
        s = s[len("sqlite:///") :]
    elif s.lower().startswith("sqlite://"):
        s = s[len("sqlite://") :]
    return Path(s).expanduser()


def sqlalchemy_url(db: str) -> str:
    """Kısa adresleri kurulu sürücüye yönlendirir: postgresql:// -> psycopg 3, mysql:// -> PyMySQL."""
    s = db.strip()
    scheme, _, rest = s.partition("://")
    low = scheme.lower()
    if low in ("postgres", "postgresql", "pgsql"):
        return "postgresql+psycopg://" + rest
    if low in ("mysql", "mariadb"):
        return "mysql+pymysql://" + rest
    return s


def connect_sqlite(db: str, write: bool = False) -> sqlite3.Connection:
    path = sqlite_path(db)
    if not path.is_file():
        raise SchemaError(f"Veritabanı dosyası bulunamadı: {path}")
    if write:
        return sqlite3.connect(str(path))
    uri = path.resolve().as_uri() + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


def create_engine(db: str, read_only: bool = True):
    """SQLAlchemy motoru. PostgreSQL'de ``read_only`` iken her bağlantı oturum düzeyinde salt okunurdur."""
    try:
        import sqlalchemy
    except ImportError:
        raise MissingExtraError("db", "PostgreSQL / MySQL") from None
    url = sqlalchemy_url(db)
    kwargs = {}
    if read_only and url.lower().startswith("postgresql"):
        kwargs["connect_args"] = {"options": "-c default_transaction_read_only=on"}
    try:
        return sqlalchemy.create_engine(url, **kwargs)
    except ImportError as exc:  # sürücü (psycopg / pymysql) eksik
        raise MissingExtraError("db", f"Veritabanı sürücüsü ({exc.name or exc})") from None
    except Exception as exc:  # noqa: BLE001 - adres biçimi hatası
        raise SchemaError(f"Bağlantı adresi geçersiz: {exc}") from None


# --------------------------------------------------------------------------- çıkarma


def extract_schema(db: str, sample_rows: int = 0, tables: list[str] | None = None) -> Schema:
    dialect = detect_dialect(db)
    if dialect == "sqlite" and not db.strip().lower().startswith("sqlite+"):
        schema = extract_sqlite(db, sample_rows)
    else:
        schema = extract_sqlalchemy(db, sample_rows, dialect)
    if tables:
        wanted = {t.strip().lower() for t in tables if t.strip()}
        missing = wanted - {t.name.lower() for t in schema.tables}
        if missing:
            raise SchemaError(f"Tablo bulunamadı: {', '.join(sorted(missing))}")
        schema.tables = [t for t in schema.tables if t.name.lower() in wanted]
    if not schema.tables:
        raise SchemaError("Veritabanında tablo yok.")
    return schema


def _qi(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def extract_sqlite(db: str, sample_rows: int = 0) -> Schema:
    con = connect_sqlite(db)
    try:
        rows = con.execute(
            "SELECT name, type, sql FROM sqlite_master WHERE type IN ('table','view') "
            "AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' ORDER BY type, name"
        ).fetchall()
        schema = Schema("sqlite")
        for name, kind, create_sql in rows:
            t = Table(name=name, kind=kind)
            comments = _column_comments(create_sql or "")
            fks = {}
            for fk in con.execute(f"PRAGMA foreign_key_list({_qi(name)})").fetchall():
                # (id, seq, table, from, to, on_update, on_delete, match)
                fks[fk[3]] = (fk[2], fk[4] or "")
            pk_cols = []
            for _cid, cname, ctype, notnull, _dflt, pk in con.execute(f"PRAGMA table_info({_qi(name)})").fetchall():
                col = Column(cname, ctype or "", bool(pk), bool(notnull), fks.get(cname), comments.get(cname.lower(), ""))
                if pk:
                    pk_cols.append(col)
                t.columns.append(col)
            if len(pk_cols) > 1:  # bileşik anahtar: sütun düzeyinde değil, tablo düzeyinde yazılır
                for c in pk_cols:
                    c.primary_key = False
                t.composite_pk = [c.name for c in pk_cols]
            if sample_rows > 0:
                try:
                    cur = con.execute(f"SELECT * FROM {_qi(name)} LIMIT ?", (sample_rows,))
                    t.sample_columns = [d[0] for d in cur.description]
                    t.sample_rows = cur.fetchall()
                except sqlite3.Error:
                    pass
            schema.tables.append(t)
        return schema
    except sqlite3.DatabaseError as exc:
        raise SchemaError(f"SQLite dosyası okunamadı: {exc}") from None
    finally:
        con.close()


def _column_comments(create_sql: str) -> dict[str, str]:
    """CREATE TABLE metninde "sutun TÜR ... -- açıklama" satırlarından {sütun: açıklama}."""
    out = {}
    for line in create_sql.splitlines():
        code, sep, comment = line.partition("--")
        words = code.strip().split()
        if sep and words and comment.strip():
            out[words[0].strip('"`[]').lower()] = comment.strip()
    return out


def extract_sqlalchemy(db: str, sample_rows: int = 0, dialect: str | None = None) -> Schema:
    engine = create_engine(db)  # sqlalchemy yoksa burada anlaşılır bir hata verir
    import sqlalchemy

    try:
        insp = sqlalchemy.inspect(engine)
        schema = Schema(dialect or detect_dialect(db))
        names = [(n, "table") for n in sorted(insp.get_table_names())]
        try:
            names += [(n, "view") for n in sorted(insp.get_view_names())]
        except NotImplementedError:
            pass
        for name, kind in names:
            t = Table(name=name, kind=kind)
            pk = set((insp.get_pk_constraint(name) or {}).get("constrained_columns") or []) if kind == "table" else set()
            fks = {}
            if kind == "table":
                for fk in insp.get_foreign_keys(name):
                    for local, remote in zip(fk.get("constrained_columns", []), fk.get("referred_columns", []), strict=False):
                        fks[local] = (fk.get("referred_table", ""), remote)
            for c in insp.get_columns(name):
                ctype = c.get("type")
                try:
                    tname = ctype.compile(dialect=engine.dialect) if ctype is not None else ""
                except Exception:  # noqa: BLE001 - bilinmeyen tür
                    tname = str(ctype)
                t.columns.append(Column(c["name"], tname, c["name"] in pk and len(pk) == 1, not c.get("nullable", True),
                                        fks.get(c["name"]), (c.get("comment") or "").replace("\n", " ")))
            if len(pk) > 1:
                t.composite_pk = [c.name for c in t.columns if c.name in pk]
            if sample_rows > 0:
                try:
                    with engine.connect() as conn:
                        q = sqlalchemy.select(sqlalchemy.text("*")).select_from(sqlalchemy.table(name)).limit(sample_rows)
                        res = conn.execute(q)
                        t.sample_columns = list(res.keys())
                        t.sample_rows = [tuple(r) for r in res.fetchall()]
                except Exception:  # noqa: BLE001 - yetki yoksa örnek satırsız devam
                    pass
            schema.tables.append(t)
        return schema
    except sqlalchemy.exc.SQLAlchemyError as exc:
        raise SchemaError(f"Veritabanına bağlanılamadı: {exc.__class__.__name__}: {str(exc).splitlines()[0]}") from None
    finally:
        engine.dispose()


# --------------------------------------------------------------------------- DDL metni


def quote_ident(name: str, dialect: str) -> str:
    if name.replace("_", "").isalnum() and name.isascii() and not name[:1].isdigit() and name == name.lower():
        return name
    if dialect == "mysql":
        return "`" + name.replace("`", "``") + "`"
    return _qi(name)


def _fmt_value(v, max_len: int = 40) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(v))} bayt>"
    s = str(v).replace("\n", " ")
    return s if len(s) <= max_len else s[: max_len - 1] + "…"


def _table_ddl(t: Table, dialect: str, include_samples: bool) -> str:
    q = lambda n: quote_ident(n, dialect)  # noqa: E731
    if t.kind == "view":
        head = f"CREATE VIEW {q(t.name)} ({', '.join(q(c.name) for c in t.columns)});"
    else:
        lines = []
        comments = []
        for c in t.columns:
            parts = [q(c.name)]
            if c.type:
                parts.append(c.type)
            if c.primary_key:
                parts.append("PRIMARY KEY")
            elif c.not_null:
                parts.append("NOT NULL")
            if c.references:
                parts.append(f"REFERENCES {q(c.references[0])}({q(c.references[1]) if c.references[1] else ''})")
            lines.append("  " + " ".join(parts))
            comments.append(c.comment)
        if t.composite_pk:
            lines.append("  PRIMARY KEY (" + ", ".join(q(n) for n in t.composite_pk) + ")")
            comments.append("")
        body = []
        for i, (line, comment) in enumerate(zip(lines, comments, strict=True)):
            line += "," if i < len(lines) - 1 else ""
            body.append(f"{line}  -- {comment}" if comment else line)
        head = f"CREATE TABLE {q(t.name)} (\n" + "\n".join(body) + "\n);"
    if include_samples and t.sample_rows:
        body = [" | ".join(t.sample_columns)] + [" | ".join(_fmt_value(v) for v in r) for r in t.sample_rows]
        head += f"\n/* {len(t.sample_rows)} example rows from {t.name}:\n" + "\n".join(body) + "\n*/"
    return head
