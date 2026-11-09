"""Şema dizini: tablolar, sütunlar, tipler, anahtarlar ve örnek değerler.

Üç kaynaktan kurulur:
- `SchemaIndex.from_ddl(text)`      — `CREATE TABLE` metni (ERP bağlayıcısının `schema_summary()` çıktısı dahil;
                                      `-- örnek satırlar (tablo): a | b` yorumları örnek değer olarak okunur).
- `SchemaIndex.from_sqlite(path)`   — SQLite dosyası (BIRD/Spider veritabanları); PRAGMA ile tam bilgi + örnek değer.
- `SchemaIndex.from_mapping(dict)`  — {"tablo": {"sutun": "tip"}} sözlüğü.

Dizin iki şeye hizmet eder: (1) modele gösterilecek kısa DDL (`to_prompt`), (2) sqlglot'un sütun çözümlemesi için
`MappingSchema` (`to_sqlglot`). İkisi aynı kaynaktan geldiği için model ancak gördüğü sütunu kullanabilir.
"""

from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

MAX_SAMPLES = 3
_SAMPLE_LEN = 40


@dataclass
class Column:
    name: str
    type: str = ""
    primary_key: bool = False
    nullable: bool = True
    references: tuple[str, str] | None = None  # (tablo, sütun)
    samples: list[str] = field(default_factory=list)
    description: str = ""  # BIRD database_description veya ERP yorumu


@dataclass
class Table:
    name: str
    columns: list[Column] = field(default_factory=list)
    description: str = ""

    def column(self, name: str) -> Column | None:
        key = name.lower()
        for c in self.columns:
            if c.name.lower() == key:
                return c
        return None

    @property
    def column_names(self) -> list[str]:
        return [c.name for c in self.columns]


def _short(v: Any) -> str:
    s = str(v).replace("\n", " ").strip()
    return s if len(s) <= _SAMPLE_LEN else s[: _SAMPLE_LEN - 1] + "…"


def quote_ident(name: str, dialect: str | None = None) -> str:
    """Boşluk/özel karakter içeren adları lehçeye göre tırnaklar (BIRD'de `Free Meal Count (K-12)` gibi)."""
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name):
        return name
    if dialect in ("mysql", "sqlite", None):
        return "`" + name.replace("`", "``") + "`"
    if dialect == "tsql":
        return "[" + name.replace("]", "]]") + "]"
    return '"' + name.replace('"', '""') + '"'


class SchemaIndex:
    def __init__(self, tables: list[Table] | None = None, dialect: str | None = None, name: str = ""):
        self.tables: dict[str, Table] = {}
        self.dialect = dialect
        self.name = name
        for t in tables or []:
            self.add(t)

    # ------------------------------------------------------------------ kurucular
    def add(self, table: Table) -> None:
        self.tables[table.name.lower()] = table

    def table(self, name: str) -> Table | None:
        return self.tables.get(name.strip().strip('"`[]').split(".")[-1].lower())

    @property
    def table_names(self) -> list[str]:
        return [t.name for t in self.tables.values()]

    def all_columns(self) -> list[tuple[str, str]]:
        return [(t.name, c.name) for t in self.tables.values() for c in t.columns]

    @classmethod
    def from_mapping(cls, mapping: dict[str, dict[str, str]], dialect: str | None = None) -> SchemaIndex:
        idx = cls(dialect=dialect)
        for tname, cols in mapping.items():
            idx.add(Table(tname, [Column(c, str(t or "")) for c, t in cols.items()]))
        return idx

    @classmethod
    def from_ddl(cls, ddl: str, dialect: str | None = None) -> SchemaIndex:
        idx = cls(dialect=dialect)
        _parse_ddl_into(idx, ddl or "", dialect)
        _parse_sample_comments_into(idx, ddl or "")
        return idx

    @classmethod
    def from_sqlite(
        cls, path: str | Path, samples: int = MAX_SAMPLES, mask_personal: bool = False
    ) -> SchemaIndex:
        """SQLite dosyasından tam dizin. `mask_personal` kişisel görünen sütunların örnek değerini gizler."""
        p = Path(path)
        idx = cls(dialect="sqlite", name=p.stem)
        con = sqlite3.connect(f"file:{p}?mode=ro", uri=True)
        try:
            con.text_factory = lambda b: b.decode("utf-8", "replace")
            names = [
                r[0]
                for r in con.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
            ]
            for tname in names:
                q = '"' + tname.replace('"', '""') + '"'
                cols = []
                for _cid, cname, ctype, notnull, _default, pk in con.execute(f"PRAGMA table_info({q})"):
                    cols.append(Column(cname, ctype or "", primary_key=bool(pk), nullable=not notnull))
                for row in con.execute(f"PRAGMA foreign_key_list({q})"):
                    _id, _seq, ref_table, from_col, to_col = row[0], row[1], row[2], row[3], row[4]
                    for c in cols:
                        if c.name == from_col:
                            c.references = (ref_table, to_col or "")
                if samples > 0 and cols:
                    try:
                        rows = con.execute(f"SELECT * FROM {q} LIMIT {int(samples)}").fetchall()
                    except sqlite3.DatabaseError:
                        rows = []
                    for i, c in enumerate(cols):
                        if mask_personal and _looks_personal(c.name):
                            continue
                        c.samples = _dedupe([_short(r[i]) for r in rows if r[i] is not None])
                idx.add(Table(tname, cols))
        finally:
            con.close()
        return idx

    # ------------------------------------------------------------------ dönüşümler
    def to_sqlglot(self):
        """sqlglot `MappingSchema` (sütun çözümlemesi için)."""
        from sqlglot.schema import MappingSchema

        mapping = {t.name: {c.name: (c.type or "UNKNOWN") for c in t.columns} for t in self.tables.values()}
        return MappingSchema(mapping, dialect=self.dialect)

    def subset(self, table_names: list[str], columns: dict[str, list[str]] | None = None) -> SchemaIndex:
        """Yalnız verilen tablolar (ve istenirse sütunlar); anahtarlar her zaman korunur."""
        out = SchemaIndex(dialect=self.dialect, name=self.name)
        for tname in table_names:
            t = self.table(tname)
            if t is None:
                continue
            if columns and t.name in columns:
                keep = {c.lower() for c in columns[t.name]}
                cols = [c for c in t.columns if c.name.lower() in keep or c.primary_key or c.references]
            else:
                cols = list(t.columns)
            out.add(Table(t.name, cols, t.description))
        return out

    def to_prompt(self, samples: bool = True, dialect: str | None = None) -> str:
        """Modele gösterilen kısa DDL. Her sütun: ad, tip, PK/FK, örnek değerler, açıklama."""
        d = dialect or self.dialect
        parts: list[str] = []
        for t in self.tables.values():
            lines = []
            for c in t.columns:
                line = f"  {quote_ident(c.name, d)} {c.type}".rstrip()
                if c.primary_key:
                    line += " PRIMARY KEY"
                if c.references:
                    line += (
                        f" REFERENCES {quote_ident(c.references[0], d)}({quote_ident(c.references[1], d)})"
                    )
                notes = []
                if c.description:
                    notes.append(c.description)
                if samples and c.samples:
                    notes.append("örnek: " + ", ".join(c.samples[:MAX_SAMPLES]))
                lines.append((line, "  -- " + " | ".join(notes) if notes else ""))
            head = f"CREATE TABLE {quote_ident(t.name, d)} ("
            if t.description:
                head = f"-- {t.description}\n" + head
            body = []
            for i, (line, comment) in enumerate(lines):
                body.append(line + ("," if i < len(lines) - 1 else "") + comment)
            parts.append(head + "\n" + "\n".join(body) + "\n);")
        return "\n".join(parts)

    def column_catalog(self) -> list[dict]:
        return [
            {
                "table": t.name,
                "column": c.name,
                "type": c.type,
                "samples": c.samples,
                "description": c.description,
            }
            for t in self.tables.values()
            for c in t.columns
        ]


# ---------------------------------------------------------------------- DDL ayrıştırma

_CREATE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>[\w.\"`\[\]\s]+?)\s*\((?P<body>.*?)\)\s*;",
    re.IGNORECASE | re.DOTALL,
)
_SAMPLE_HEAD_RE = re.compile(r"^--\s*örnek satırlar\s*\(([^)]+)\)\s*:\s*(.*)$", re.IGNORECASE)
_TABLE_CONSTRAINT_RE = re.compile(
    r"^\s*(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|KEY|INDEX)\b", re.IGNORECASE
)
_FK_TABLE_RE = re.compile(
    r"FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+([\w.\"`\[\]]+)\s*\(([^)]+)\)", re.IGNORECASE
)
_COL_REF_RE = re.compile(r"REFERENCES\s+([\w.\"`\[\]]+)\s*\(([^)]+)\)", re.IGNORECASE)


def _bare(name: str) -> str:
    return name.strip().strip('"`[]').split(".")[-1].strip('"`[]')


def _split_top_level(body: str) -> list[str]:
    """Virgüllerden böler ama parantez içini (NUMERIC(10,2), CHECK(x IN (1,2))) korur."""
    parts, depth, cur = [], 0, []
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    if "".join(cur).strip():
        parts.append("".join(cur))
    return parts


def _strip_line_comments(text: str) -> str:
    return "\n".join(line.split("--", 1)[0] for line in text.splitlines())


def _parse_ddl_into(idx: SchemaIndex, ddl: str, dialect: str | None) -> None:
    # Önce sqlglot ile dene (lehçe farklarını iyi bilir); olmazsa dayanıklı regex.
    parsed = _parse_ddl_sqlglot(ddl, dialect)
    if parsed:
        for t in parsed:
            idx.add(t)
        return
    for m in _CREATE_RE.finditer(_strip_line_comments(ddl) + "\n;"):
        tname = _bare(m.group("name"))
        cols: list[Column] = []
        fks: list[tuple[str, str, str]] = []
        for piece in _split_top_level(m.group("body")):
            piece = piece.strip()
            if not piece:
                continue
            if _TABLE_CONSTRAINT_RE.match(piece):
                fk = _FK_TABLE_RE.search(piece)
                if fk:
                    for src, dst in zip(fk.group(1).split(","), fk.group(3).split(","), strict=False):
                        fks.append((_bare(src), _bare(fk.group(2)), _bare(dst)))
                elif piece.upper().startswith("PRIMARY KEY"):
                    inner = piece[piece.find("(") + 1 : piece.rfind(")")]
                    for pkc in inner.split(","):
                        for c in cols:
                            if c.name.lower() == _bare(pkc).lower():
                                c.primary_key = True
                continue
            toks = _tokenize_column(piece)
            if not toks:
                continue
            cname, rest = toks
            upper = rest.upper()
            col = Column(
                name=cname,
                type=_column_type(rest),
                primary_key="PRIMARY KEY" in upper,
                nullable="NOT NULL" not in upper and "PRIMARY KEY" not in upper,
            )
            ref = _COL_REF_RE.search(rest)
            if ref:
                col.references = (_bare(ref.group(1)), _bare(ref.group(2).split(",")[0]))
            cols.append(col)
        for src, rt, rc in fks:
            for c in cols:
                if c.name.lower() == src.lower():
                    c.references = (rt, rc)
        idx.add(Table(tname, cols))


def _tokenize_column(piece: str) -> tuple[str, str] | None:
    piece = piece.strip()
    if not piece:
        return None
    if piece[0] in '"`[':
        close = {'"': '"', "`": "`", "[": "]"}[piece[0]]
        end = piece.find(close, 1)
        if end < 0:
            return None
        return piece[1:end], piece[end + 1 :].strip()
    parts = piece.split(None, 1)
    return parts[0], (parts[1] if len(parts) > 1 else "")


def _column_type(rest: str) -> str:
    m = re.match(
        r"\s*([A-Za-z][\w]*(?:\s*\([^)]*\))?(?:\s+(?:UNSIGNED|VARYING|PRECISION|WITHOUT TIME ZONE))?)", rest
    )
    if not m:
        return ""
    t = m.group(1).strip()
    if t.upper().split("(")[0] in {
        "PRIMARY",
        "NOT",
        "NULL",
        "REFERENCES",
        "UNIQUE",
        "DEFAULT",
        "CHECK",
        "CONSTRAINT",
    }:
        return ""
    return t


def _parse_ddl_sqlglot(ddl: str, dialect: str | None) -> list[Table] | None:
    try:
        import sqlglot
        from sqlglot import exp
    except ImportError:
        return None
    try:
        stmts = sqlglot.parse(_strip_line_comments(ddl), read=dialect)
    except Exception:  # noqa: BLE001 - sqlglot.errors.ParseError ve lehçe sürprizleri
        return None
    tables: list[Table] = []
    for st in stmts:
        if not isinstance(st, exp.Create) or st.args.get("kind") != "TABLE":
            continue
        schema_node = st.this
        if not isinstance(schema_node, exp.Schema):
            continue
        tname = schema_node.this.name if isinstance(schema_node.this, exp.Table) else str(schema_node.this)
        cols: list[Column] = []
        pk_cols: set[str] = set()
        fks: dict[str, tuple[str, str]] = {}
        flat = []
        for e in schema_node.expressions:  # CONSTRAINT ad FOREIGN KEY (...) → iç kısıtlar
            flat.extend(e.expressions if isinstance(e, exp.Constraint) else [e])
        for e in flat:
            if isinstance(e, exp.ColumnDef):
                kinds = {type(c.kind).__name__ for c in e.constraints}
                col = Column(
                    name=e.name,
                    type=e.args.get("kind").sql(dialect=dialect) if e.args.get("kind") else "",
                    primary_key="PrimaryKeyColumnConstraint" in kinds,
                    nullable="NotNullColumnConstraint" not in kinds
                    and "PrimaryKeyColumnConstraint" not in kinds,
                )
                for c in e.constraints:
                    if isinstance(c.kind, exp.Reference) and isinstance(c.kind.this, exp.Schema):
                        ref_t = c.kind.this.this.name
                        ref_c = c.kind.this.expressions[0].name if c.kind.this.expressions else ""
                        col.references = (ref_t, ref_c)
                cols.append(col)
            elif isinstance(e, exp.PrimaryKey):
                pk_cols |= {c.name.lower() for c in e.expressions}
            elif isinstance(e, exp.ForeignKey):
                ref = e.args.get("reference")
                if ref is not None and isinstance(ref.this, exp.Schema):
                    ref_t = ref.this.this.name
                    ref_cols = [c.name for c in ref.this.expressions]
                    for i, c in enumerate(e.expressions):
                        fks[c.name.lower()] = (ref_t, ref_cols[i] if i < len(ref_cols) else "")
        for c in cols:
            if c.name.lower() in pk_cols:
                c.primary_key = True
            if c.name.lower() in fks:
                c.references = fks[c.name.lower()]
        if cols:
            tables.append(Table(tname, cols))
    return tables or None


def _parse_sample_comments_into(idx: SchemaIndex, ddl: str) -> None:
    """ERP bağlayıcısının `-- örnek satırlar (tablo): a | b` / `--   v1 | v2` yorumlarını örnek değere çevirir."""
    current: Table | None = None
    col_names: list[str] = []
    for line in ddl.splitlines():
        m = _SAMPLE_HEAD_RE.match(line.strip())
        if m:
            current = idx.table(m.group(1))
            col_names = [c.strip() for c in m.group(2).split("|")]
            continue
        if current is not None and line.startswith("--   "):
            vals = [v.strip() for v in line[5:].split("|")]
            for cname, v in zip(col_names, vals, strict=False):
                col = current.column(cname)
                if (
                    col is not None
                    and v
                    and v != "***"
                    and len(col.samples) < MAX_SAMPLES
                    and v not in col.samples
                ):
                    col.samples.append(_short(v))
            continue
        if line.strip() and not line.startswith("--"):
            current = None


def _dedupe(values: list[str]) -> list[str]:
    out: list[str] = []
    for v in values:
        if v not in out:
            out.append(v)
    return out[:MAX_SAMPLES]


def _looks_personal(name: str) -> bool:
    try:
        from ..erp.sql_readonly import is_personal_column

        return is_personal_column(name)
    except Exception:  # noqa: BLE001
        return False
