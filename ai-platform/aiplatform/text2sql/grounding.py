"""Sütun bağlama (grounding): üretilen SQL'deki her tablo ve sütun şemada var mı?

Model "sütun uydurmasın" demek yetmez; uydurduğunda yakalanmalı. sqlglot'un `qualify` geçişi sorgudaki her
sütunu (takma adlar, CTE'ler, alt sorgular, `*` genişletmesi dahil) şemadaki bir tabloya bağlar. Bağlanamayan
sütun → `GroundingError`; mesaj modelin bir sonraki turda düzeltebilmesi için **en yakın gerçek sütunları** sayar.

Hata türleri (`GroundingError.kind`), BIRD üzerindeki gerçek model hatalarından çıkarıldı:
- `wrong_table`   : sütun var ama yazıldığı tabloda yok (`f.MailStreet`, sütun `schools`'ta). Küçük modellerin en
                    sık hatası; mesaj sütunun gerçek sahibini söyler.
- `unknown_column`: hiçbir tabloda yok (`School_Type`); en yakın adaylar büyük/küçük harf ve `_`/boşluk farkı
                    gözetmeden sıralanır (`School Type`).
- `ambiguous`     : çıplak sütun birden çok tabloda var.
- `unknown_table`, `parse`.
`render(lang)` metni modelin istem diliyle verir (İngilizce istemle çalışan modele Türkçe hata gitmez).

Ayrıca sorgunun kullandığı (tablo, sütun) çiftleri döner; bunlar denetim günlüğüne ve KVKK kontrolüne gider.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .schema import SchemaIndex, quote_ident

try:
    from rapidfuzz import process as rf_process
    from rapidfuzz.utils import default_process as rf_default_process
except ImportError:  # pragma: no cover
    rf_process = None
    rf_default_process = None


class GroundingError(ValueError):
    """Sorgu şemaya bağlanamadı. `message` (Türkçe) kullanıcıya gösterilir; `render("en")` modele İngilizce verir."""

    def __init__(
        self,
        message: str,
        *,
        column: str | None = None,
        suggestions: list[str] | None = None,
        kind: str = "other",
        table: str | None = None,
        owners: list[str] | None = None,
        detail: str = "",
    ):
        super().__init__(message)
        self.message = message
        self.column = column
        self.suggestions = suggestions or []
        self.kind = kind
        self.table = table
        self.owners = owners or []
        self.detail = detail

    def render(self, lang: str = "tr") -> str:
        if lang != "en":
            return self.message
        c, s = self.column, ", ".join(self.suggestions)
        if self.kind == "wrong_table":
            return (
                f"Column {c} does not exist in table {self.table}. It exists in: {s}. "
                "Join the right table and qualify the column with that table's alias."
            )
        if self.kind == "unknown_column":
            return f"Column {c} does not exist in any table. Use only schema columns; closest matches: {s}."
        if self.kind == "ambiguous":
            return f"Column {c} exists in several tables ({', '.join(self.owners)}); qualify it, e.g. {s}."
        if self.kind == "unknown_table":
            return f"Table {c} does not exist. Closest tables: {s}."
        if self.kind == "parse":
            return f"The SQL could not be parsed: {self.detail}"
        return f"The query could not be matched to the schema: {self.detail or self.message}"


@dataclass
class Grounded:
    sql: str  # tüm sütunları tablo adıyla nitelenmiş hâli
    tables: list[str]
    columns: list[str] = field(default_factory=list)  # "tablo.sütun"

    def as_dict(self) -> dict:
        return {"tables": self.tables, "columns": self.columns}


def _bare(name: str) -> str:
    return name.strip().strip('"`[]').split(".")[-1].strip('"`[]')


def _fold(name: str) -> str:
    """Karşılaştırma anahtarı: küçük harf, `_`/boşluk/noktalama farksız (School_Type ≈ `School Type`)."""
    return "".join(ch for ch in name.lower() if ch.isalnum())


def _ref(index: SchemaIndex, table: str, column: str) -> str:
    return f"{table}.{quote_ident(column, index.dialect)}"


def nearest_columns(index: SchemaIndex, name: str, limit: int = 5) -> list[str]:
    """Şemadaki en yakın sütunlar ("tablo.sütun", gerekirse tırnaklı). Biçim farkı yok sayılır."""
    pairs = index.all_columns()
    if not pairs:
        return []
    exact = [_ref(index, t, c) for t, c in pairs if _fold(c) == _fold(name)]
    if exact:
        return exact[:limit]
    if rf_process is None:
        return [_ref(index, t, c) for t, c in pairs][:limit]
    cands = {i: c for i, (_t, c) in enumerate(pairs)}
    hits = rf_process.extract(name, cands, limit=limit, score_cutoff=50, processor=rf_default_process)
    return [_ref(index, *pairs[i]) for _value, _score, i in hits]


def _owners(index: SchemaIndex, column: str) -> list[str]:
    return [t.name for t in index.tables.values() if t.column(column)]


def _check_qualified_columns(tree, index: SchemaIndex) -> None:
    """`alias.sütun` biçimindeki her sütunu takma adın gerçek tablosuna karşı denetler (qualify'dan önce, özgün yazımla)."""
    from sqlglot import exp

    alias_tables: dict[str, set[str]] = {}
    for t in tree.find_all(exp.Table):
        real = index.table(t.name) if t.name else None
        if real is None:
            continue
        for key in {t.alias_or_name.lower(), t.name.lower()}:
            alias_tables.setdefault(key, set()).add(real.name)
    derived = {a.alias.lower() for a in tree.find_all(exp.Subquery) if a.alias}
    derived |= {c.alias_or_name.lower() for c in tree.find_all(exp.CTE)}
    for c in tree.find_all(exp.Column):
        if not c.table or not c.name or isinstance(c.this, exp.Star):
            continue
        key = c.table.lower()
        if key in derived or key not in alias_tables:
            continue
        tables = alias_tables[key]
        if any(index.table(tn).column(c.name) for tn in tables):
            continue
        shown_table = " / ".join(sorted(tables)) + (
            f" (alias {c.table})" if key not in {x.lower() for x in tables} else ""
        )
        owners = _owners(index, c.name)
        if owners:
            refs = [_ref(index, o, index.table(o).column(c.name).name) for o in owners]
            raise GroundingError(
                f"'{c.name}' sütunu {shown_table} tablosunda yok; şu tablolarda var: {', '.join(refs)}. "
                "Doğru tabloyu JOIN et ve sütunu o tablonun takma adıyla nitele.",
                column=c.name,
                suggestions=refs,
                kind="wrong_table",
                table=shown_table,
                owners=owners,
            )
        near = nearest_columns(index, c.name)
        raise GroundingError(
            f"Şemada olmayan sütun: '{c.name}'."
            + (f" Yalnız şemadaki sütunları kullan; yakın adaylar: {', '.join(near)}." if near else ""),
            column=c.name,
            suggestions=near,
            kind="unknown_column",
            table=shown_table,
        )


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
        detail = str(e).splitlines()[0][:200]
        raise GroundingError(f"SQL ayrıştırılamadı: {detail}", kind="parse", detail=detail) from e

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
                suggestions=near or index.table_names,
                kind="unknown_table",
            )

    _check_qualified_columns(tree, index)
    original_names = {c.name.lower(): c.name for c in tree.find_all(exp.Column) if c.name}

    try:
        q = qualify(
            tree.copy(),
            schema=index.to_sqlglot(),
            dialect=d,
            validate_qualify_columns=True,
        )
    except OptimizeError as e:
        raise _explain(e, index, original_names) from e

    # qualify bazı yerlerde (ör. HAVING) bilinmeyen adı sessizce bırakır; niteliksiz kalan her sütun ya bir
    # SELECT takma adıdır ya da uydurmadır.
    aliases = {a.lower() for sel in q.find_all(exp.Select) for a in sel.named_selects}
    for c in q.find_all(exp.Column):
        if not c.table and c.name and c.name.lower() not in aliases:
            raise _explain(OptimizeError(f"Unknown column: {c.name}"), index, original_names)

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
    return [
        n
        for n, _s, _i in rf_process.extract(
            name, names, limit=limit, score_cutoff=40, processor=rf_default_process
        )
    ]


def _explain(
    err: Exception, index: SchemaIndex, original_names: dict[str, str] | None = None
) -> GroundingError:
    msg = str(err)
    col = None
    for marker in ("Unknown column: ", "Column '"):
        if marker in msg:
            rest = msg.split(marker, 1)[1]
            col = rest.split("'", 1)[0] if marker == "Column '" else rest.split(".", 1)[0].strip()
            break
    if col is None:
        detail = msg.splitlines()[0][:200]
        return GroundingError(f"Sorgu şemaya bağlanamadı: {detail}", detail=detail)
    bare = _bare(col)
    bare = (original_names or {}).get(bare.lower(), bare)  # qualify adları küçültür; özgün yazımı geri al
    owners = _owners(index, bare)
    if len(owners) >= 2:
        refs = [_ref(index, o, index.table(o).column(bare).name) for o in owners]
        return GroundingError(
            f"'{bare}' sütunu birden çok tabloda var ({', '.join(owners)}); tablo adıyla nitele: "
            + ", ".join(refs),
            column=bare,
            suggestions=refs,
            kind="ambiguous",
            owners=owners,
        )
    near = nearest_columns(index, bare)
    text = f"Şemada olmayan sütun: '{bare}'."
    if near:
        text += f" Yalnız şemadaki sütunları kullan; yakın adaylar: {', '.join(near)}."
    return GroundingError(text, column=bare, suggestions=near, kind="unknown_column")
