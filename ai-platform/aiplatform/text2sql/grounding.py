"""Sütun bağlama (grounding): üretilen SQL'deki her tablo ve sütun şemada var mı?

Model "sütun uydurmasın" demek yetmez; uydurduğunda yakalanmalı. sqlglot'un `qualify` geçişi sorgudaki her
sütunu (takma adlar, CTE'ler, alt sorgular, `*` genişletmesi dahil) şemadaki bir tabloya bağlar. Bağlanamayan
sütun → `GroundingError`; mesaj modelin bir sonraki turda düzeltebilmesi için **en yakın gerçek sütunları** sayar.

Ayrıca sorgunun kullandığı (tablo, sütun) çiftleri döner; bunlar denetim günlüğüne ve KVKK kontrolüne gider.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .schema import SchemaIndex

try:
    from rapidfuzz import process as rf_process
except ImportError:  # pragma: no cover
    rf_process = None


class GroundingError(ValueError):
    """Sorgu şemaya bağlanamadı. `message` kullanıcıya/modele gösterilebilir; `suggestions` yakın adaylar."""

    def __init__(self, message: str, *, column: str | None = None, suggestions: list[str] | None = None):
        super().__init__(message)
        self.message = message
        self.column = column
        self.suggestions = suggestions or []


@dataclass
class Grounded:
    sql: str  # tüm sütunları tablo adıyla nitelenmiş hâli
    tables: list[str]
    columns: list[str] = field(default_factory=list)  # "tablo.sütun"

    def as_dict(self) -> dict:
        return {"tables": self.tables, "columns": self.columns}


def _bare(name: str) -> str:
    return name.strip().strip('"`[]').split(".")[-1].strip('"`[]')


def nearest_columns(index: SchemaIndex, name: str, limit: int = 5) -> list[str]:
    """Şemadaki en yakın sütun adları ("tablo.sütun")."""
    cands = {f"{t}.{c}": c for t, c in index.all_columns()}
    if not cands:
        return []
    if rf_process is None:
        return sorted(cands)[:limit]
    hits = rf_process.extract(name, cands, limit=limit, score_cutoff=40)
    return [key for _value, _score, key in hits]


def ground(sql: str, index: SchemaIndex, dialect: str | None = None) -> Grounded:
    """SQL'i şemaya bağlar; tablo/sütun uydurulmuşsa GroundingError."""
    import sqlglot
    from sqlglot import exp
    from sqlglot.errors import OptimizeError, ParseError
    from sqlglot.optimizer.qualify import qualify

    d = dialect or index.dialect
    try:
        tree = sqlglot.parse_one(sql, read=d)
    except ParseError as e:
        raise GroundingError(f"SQL ayrıştırılamadı: {str(e).splitlines()[0][:200]}") from e

    known = {t.lower() for t in index.table_names}
    ctes = {_bare(c.alias_or_name).lower() for c in tree.find_all(exp.CTE)}
    for t in tree.find_all(exp.Table):
        if not t.name:
            continue
        n = _bare(t.name).lower()
        if n not in known and n not in ctes:
            near = _nearest_tables(index, t.name)
            hint = f" Şemadaki tablolar: {', '.join(index.table_names)}." if index.table_names else ""
            raise GroundingError(
                f"Şemada olmayan tablo: '{t.name}'."
                + (f" Yakın adaylar: {', '.join(near)}." if near else hint),
                column=t.name,
                suggestions=near,
            )

    try:
        q = qualify(
            tree,
            schema=index.to_sqlglot(),
            dialect=d,
            validate_qualify_columns=True,
        )
    except OptimizeError as e:
        raise _explain(e, index) from e

    # qualify bazı yerlerde (ör. HAVING) bilinmeyen adı sessizce bırakır; niteliksiz kalan her sütun ya bir
    # SELECT takma adıdır ya da uydurmadır.
    aliases = {a.lower() for sel in q.find_all(exp.Select) for a in sel.named_selects}
    for c in q.find_all(exp.Column):
        if not c.table and c.name and c.name.lower() not in aliases:
            raise _explain(OptimizeError(f"Unknown column: {c.name}"), index)

    tables = sorted(
        {index.table(t.name).name for t in q.find_all(exp.Table) if t.name and index.table(t.name)}
    )
    cols: set[str] = set()
    alias_to_table = {}
    for t in q.find_all(exp.Table):
        if t.alias and index.table(t.name):
            alias_to_table[t.alias.lower()] = index.table(t.name).name
    for c in q.find_all(exp.Column):
        if not c.table:
            continue
        tname = alias_to_table.get(c.table.lower())
        if tname is None and index.table(c.table):
            tname = index.table(c.table).name
        if tname is None:
            continue  # CTE / alt sorgu sütunu; kaynak sütunları ayrıca sayılıyor
        tcol = index.table(tname).column(c.name)
        if tcol is not None:
            cols.add(f"{tname}.{tcol.name}")
    return Grounded(sql=q.sql(dialect=d), tables=tables, columns=sorted(cols))


def _nearest_tables(index: SchemaIndex, name: str, limit: int = 3) -> list[str]:
    names = index.table_names
    if not names or rf_process is None:
        return names[:limit]
    return [n for n, _s, _i in rf_process.extract(name, names, limit=limit, score_cutoff=40)]


def _explain(err: Exception, index: SchemaIndex) -> GroundingError:
    msg = str(err)
    col = None
    for marker in ("Unknown column: ", "Column '"):
        if marker in msg:
            rest = msg.split(marker, 1)[1]
            col = rest.split("'", 1)[0] if marker == "Column '" else rest.split(".", 1)[0].strip()
            break
    if col is None:
        return GroundingError(f"Sorgu şemaya bağlanamadı: {msg.splitlines()[0][:200]}")
    bare = _bare(col)
    owners = [t.name for t in index.tables.values() if t.column(bare)]
    if len(owners) >= 2:
        return GroundingError(
            f"'{bare}' sütunu birden çok tabloda var ({', '.join(owners)}); tablo adıyla nitele: "
            + ", ".join(f"{o}.{bare}" for o in owners),
            column=bare,
            suggestions=[f"{o}.{bare}" for o in owners],
        )
    near = nearest_columns(index, bare)
    text = f"Şemada olmayan sütun: '{bare}'."
    if near:
        text += f" Yalnız şemadaki sütunları kullan; yakın adaylar: {', '.join(near)}."
    return GroundingError(text, column=bare, suggestions=near)
