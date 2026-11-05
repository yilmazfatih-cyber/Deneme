"""Model yanıtından SQL çıkarma, ifade bölme ve salt okunur denetimi.

Tam bir SQL ayrıştırıcısı değildir; tırnaklar, tanımlayıcı tırnakları ve yorumlar doğru
atlanacak kadar küçük bir sözcük çözümleyici kullanır.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .errors import ReadOnlyError, SQLNotFoundError

# İfadenin başında görülebilecek anahtar kelimeler (çıkarma için).
STATEMENT_STARTS = (
    "SELECT", "WITH", "VALUES", "EXPLAIN", "SHOW", "DESCRIBE", "DESC", "PRAGMA",
    "INSERT", "UPDATE", "DELETE", "REPLACE", "MERGE", "UPSERT",
    "CREATE", "DROP", "ALTER", "TRUNCATE", "RENAME", "GRANT", "REVOKE",
    "ATTACH", "DETACH", "VACUUM", "REINDEX", "ANALYZE", "COPY", "CALL", "DO", "SET", "LOCK",
    "BEGIN", "COMMIT", "ROLLBACK", "USE", "LOAD", "HANDLER",
)
READ_STARTS = {"SELECT", "WITH", "VALUES", "EXPLAIN", "SHOW", "DESCRIBE", "DESC", "PRAGMA"}
# Okuma ifadesinin içinde geçerse yazma sayılan kelimeler (ör. PostgreSQL'de WITH ... DELETE, SELECT ... INTO).
WRITE_WORDS = {
    "INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT", "CREATE", "DROP", "ALTER",
    "TRUNCATE", "GRANT", "REVOKE", "ATTACH", "DETACH", "INTO", "COPY", "VACUUM", "REINDEX", "LOCK",
}
# Satır başı SQL olmayan bir kelimeyle başlayan, noktayla biten satırlar yorum sayılır.
SQL_WORDS = set(STATEMENT_STARTS) | {
    "FROM", "WHERE", "GROUP", "ORDER", "HAVING", "LIMIT", "OFFSET", "JOIN", "LEFT", "RIGHT", "INNER",
    "OUTER", "FULL", "CROSS", "ON", "AND", "OR", "NOT", "UNION", "EXCEPT", "INTERSECT", "AS", "CASE",
    "WHEN", "THEN", "ELSE", "END", "BY", "ASC", "IN", "IS", "NULL", "BETWEEN", "LIKE", "ILIKE",
    "DISTINCT", "ALL", "EXISTS", "FETCH", "WINDOW", "OVER", "PARTITION", "USING", "NATURAL",
}

_FENCE_RE = re.compile(r"```(.*?)(?:```|\Z)", re.DOTALL)
_SPECIAL_TOKENS_RE = re.compile(r"<\|[^|>]{1,40}\|>|<\/?s>|<EOT>")


@dataclass
class Token:
    kind: str  # "word", "string", "ident", "comment", "semicolon", "space", "other"
    text: str


def tokenize(sql: str, dialect: str | None = None) -> list[Token]:
    """Ters bölü kaçışı lehçeye bağlıdır: MySQL'de her dizgide; PostgreSQL'de yalnızca E'...' dizgilerinde;
    SQLite'ta ve lehçe verilmezse hiçbir zaman (standart SQL: yalnızca '' kaçışı)."""
    out: list[Token] = []
    i, n = 0, len(sql)
    while i < n:
        c = sql[i]
        if c in "'\"`[":
            close = "]" if c == "[" else c
            backslash = (dialect == "mysql" and c in "'\"") or (
                dialect == "postgresql" and c == "'" and i > 0 and sql[i - 1] in "eE" and (i < 2 or not (sql[i - 2].isalnum() or sql[i - 2] == "_"))
            )
            j = i + 1
            while j < n:
                if sql[j] == close:
                    if close != "]" and j + 1 < n and sql[j + 1] == close:  # '' kaçışı
                        j += 2
                        continue
                    break
                if backslash and sql[j] == "\\" and j + 1 < n:  # MySQL \' ya da PostgreSQL E'\'' kaçışı
                    j += 2
                    continue
                j += 1
            if c == "[" and (j >= n or "\n" in sql[i:j]):  # köşeli parantez tanımlayıcı değilmiş
                out.append(Token("other", c))
                i += 1
                continue
            out.append(Token("string" if c == "'" else "ident", sql[i : j + 1]))
            i = j + 1
        elif sql.startswith("--", i) or c == "#" and _hash_is_comment(sql, i):
            j = sql.find("\n", i)
            j = n if j < 0 else j
            out.append(Token("comment", sql[i:j]))
            i = j
        elif sql.startswith("/*", i):
            j = sql.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(Token("comment", sql[i:j]))
            i = j
        elif c == ";":
            out.append(Token("semicolon", c))
            i += 1
        elif c.isspace():
            j = i
            while j < n and sql[j].isspace():
                j += 1
            out.append(Token("space", sql[i:j]))
            i = j
        elif c.isalnum() or c == "_":
            j = i
            while j < n and (sql[j].isalnum() or sql[j] in "_$"):
                j += 1
            out.append(Token("word", sql[i:j]))
            i = j
        else:
            out.append(Token("other", c))
            i += 1
    return out


def _hash_is_comment(sql: str, i: int) -> bool:
    # MySQL '#' yorumu; PostgreSQL '#' işlecini (a # b) yorum sanmamak için satır başında ya da boşluktan sonra
    return i == 0 or sql[i - 1] in " \t\n" and (i + 1 >= len(sql) or sql[i + 1] in " \t")


def split_statements(sql: str, dialect: str | None = None) -> list[str]:
    """Noktalı virgülle ayrılmış ifadeleri döndürür (tırnak/yorum içindekiler bölmez); boşlar atılır."""
    parts, cur = [], []
    for t in tokenize(sql, dialect):
        if t.kind == "semicolon":
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(t.text)
    parts.append("".join(cur))
    return [p.strip() for p in parts if strip_comments(p, dialect).strip()]


def strip_comments(sql: str, dialect: str | None = None) -> str:
    return "".join(" " if t.kind == "comment" else t.text for t in tokenize(sql, dialect))


def words(sql: str, dialect: str | None = None) -> list[str]:
    return [t.text.upper() for t in tokenize(sql, dialect) if t.kind == "word"]


def statement_type(sql: str) -> str:
    """İlk anahtar kelime (büyük harf); boşsa ""."""
    w = words(sql)
    return w[0] if w else ""


# Okuma PRAGMA'ları; geri kalan her PRAGMA (işlev biçimli "PRAGMA user_version(5)" dahil) yazma sayılır.
READ_PRAGMAS = {"table_info", "table_xinfo", "index_list", "index_info", "index_xinfo", "foreign_key_list",
                "database_list", "table_list", "collation_list"}
# İşlev olarak da kullanılan yazma kelimeleri: REPLACE(ad, 'a', 'b') ve MySQL INSERT(str, pos, len, yeni) okumadır.
FUNCTION_WORDS = {"REPLACE", "INSERT"}


def guard_modes(dialect: str | None) -> tuple[str | None, ...]:
    """Denetimde kullanılacak tokenize kipleri. Sunucu lehçelerinde sunucu ayarı (standard_conforming_strings,
    NO_BACKSLASH_ESCAPES) bilinmediği için iki yorum da denenir; biri bile sakıncalıysa reddedilir."""
    if dialect == "sqlite":
        return ("sqlite",)
    return ("postgresql", "mysql")


def write_reason(sql: str, dialect: str | None = None) -> str | None:
    """Sorgu veri değiştirebiliyorsa nedenini (ör. "DELETE, WITH içinde") döndürür; okumaysa None."""
    for mode in guard_modes(dialect):
        reason = _write_reason(sql, mode)
        if reason:
            return reason
    return None


def _write_reason(sql: str, mode: str | None) -> str | None:
    toks = [t for t in tokenize(sql, mode) if t.kind not in ("space", "comment")]
    w = [t.text.upper() for t in toks if t.kind == "word"]
    if not w:
        return "boş ifade"
    first = w[0]
    if first not in READ_STARTS:
        return first
    if first == "PRAGMA":
        names = {x.lower() for x in w[1:3]}  # "PRAGMA main.table_info(t)" için ilk iki kelime
        if any(t.kind == "other" and t.text == "=" for t in toks) or not (names & READ_PRAGMAS):
            return "PRAGMA " + (w[1].lower() if len(w) > 1 else "")
        return None
    if first == "EXPLAIN" and "ANALYZE" in w[:3]:  # PostgreSQL EXPLAIN ANALYZE ifadeyi gerçekten çalıştırır
        k = next(i for i, t in enumerate(toks) if t.kind == "word" and t.text.upper() == "ANALYZE")
        inner = _write_reason(" ".join(t.text for t in toks[k + 1 :]), mode)
        return f"{inner}, EXPLAIN ANALYZE içinde" if inner else None
    for i, t in enumerate(toks[1:], 1):
        word = t.text.upper()
        if t.kind != "word" or word not in WRITE_WORDS:
            continue
        if word in FUNCTION_WORDS and i + 1 < len(toks) and toks[i + 1].text == "(":
            continue
        return f"{word}, {first} içinde"
    return None


def is_read_only(sql: str, dialect: str | None = None) -> bool:
    return write_reason(sql, dialect) is None


def ensure_read_only(sql: str, dialect: str | None = None) -> None:
    reason = write_reason(sql, dialect)
    if reason:
        raise ReadOnlyError(
            f"Bu sorgu veriyi değiştirebilir ({reason}); çalıştırılmadı. "
            "Yalnızca okuma sorguları (SELECT) çalışır. Bilerek yazmak için --yaz ekleyin.",
            sql=sql,
        )


def ensure_single_statement(sql: str, dialect: str | None = None) -> None:
    """--yaz verilse de tek ifade: ikinci bir ifade (ör. COMMIT; DROP ...) salt okunur işlemi bitirebilir."""
    if max(len(split_statements(sql, mode)) for mode in guard_modes(dialect)) > 1:
        raise ReadOnlyError("Sorguda birden çok SQL ifadesi var; güvenlik için çalıştırılmadı. Tek ifade çalışır.", sql=sql)


def extract_sql(text: str, dialect: str | None = None) -> str:
    """Model yanıtından tek bir SQL ifadesi çıkarır (sonunda noktalı virgül olmadan).

    Sıra: <think> bölümü atılır; ilk ```sql (ya da dilsiz ```) bloğu (<think>/<answer> varsa sonuncusu); yoksa ilk SELECT/WITH/... ile başlayan bölüm.
    Birden çok ifade varsa yalnızca ilki alınır. Bulunamazsa SQLNotFoundError.
    """
    return extract_statements(text, dialect)[0]


def extract_statements(text: str, dialect: str | None = None) -> list[str]:
    """extract_sql ile aynı, ama bulunan bölümdeki tüm ifadeleri döndürür (ilki kırpılmış)."""
    text = _SPECIAL_TOKENS_RE.sub("", text or "").replace("\r\n", "\n")
    # Akıl yürüten modeller (<think>/<answer>) taslak yazıp sonra düzeltir: son uygun çit alınır.
    # Diğerlerinde ilk çit: sonradan eklenen "isterseniz şöyle de süzebilirsiniz" sorgusu seçilmesin.
    reasoning = bool(_REASONING_TAG_RE.search(text))
    text = _strip_reasoning(text)
    candidate = None
    for m in _FENCE_RE.finditer(text):
        body = _fence_body(m.group(1))
        start = _find_start(body) if body is not None else None
        if start is not None:
            candidate = body[start:]
            if not reasoning:
                break
    if candidate is None:
        start = _find_start(text)
        if start is None:
            raise SQLNotFoundError("Model yanıtında SQL bulunamadı. Soruyu daha açık yazıp yeniden deneyin.")
        candidate = _cut_prose(text[start:], dialect)
    stmts = [_strip_backticks(x) for x in split_statements(candidate.replace("```", " "), dialect)]
    stmts = [x for x in stmts if x]
    if not stmts:
        raise SQLNotFoundError("Model yanıtında SQL bulunamadı. Soruyu daha açık yazıp yeniden deneyin.")
    return [_trim_trailing_prose(stmts[0])] + stmts[1:]


SQL_LANGS = {"sql", "sqlite", "sqlite3", "postgresql", "postgres", "psql", "pgsql", "mysql", "mariadb", "plsql", "tsql"}
_REASONING_TAG_RE = re.compile(r"</?(think|answer)>", re.IGNORECASE)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def _strip_reasoning(text: str) -> str:
    """<think>...</think> bölümlerini siler; kapanmamış <think> varsa sonrasını atar; <answer> etiketlerini kaldırır."""
    text = _THINK_RE.sub(" ", text)
    k = text.lower().find("<think>")
    if k >= 0:
        text = text[:k]
    return re.sub(r"</?answer>", " ", text, flags=re.IGNORECASE)


def _fence_body(block: str) -> str | None:
    """Çit içeriği; dil etiketi (```sql) atılır. SQL dışı bir dil etiketiyse (```python) None."""
    s = block.lstrip(" \t")
    m = re.match(r"([A-Za-z][A-Za-z0-9_+-]*)(?=\s|$)", s)
    if not m:
        return s
    tag = m.group(1)
    if tag.lower() in SQL_LANGS:
        return s[m.end():]
    if s[m.end():m.end() + 1] in ("\n", "") and tag.upper() not in STATEMENT_STARTS:
        return None
    return s


def _strip_backticks(stmt: str) -> str:
    """Çitten kalan tek ters tırnağı temizler; MySQL `tanımlayıcı` çiftlerine dokunmaz."""
    stmt = stmt.strip()
    if stmt.count("`") % 2 == 1:
        if stmt.endswith("`"):
            stmt = stmt[:-1].rstrip()
        elif stmt.startswith("`"):
            stmt = stmt[1:].lstrip()
    return stmt


_START_RE = re.compile(r"\b(" + "|".join(STATEMENT_STARTS) + r")\b", re.I)


_STRONG = {"SELECT", "WITH", "INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "PRAGMA", "EXPLAIN",
           "REPLACE", "TRUNCATE", "MERGE", "VALUES", "ATTACH", "GRANT", "REVOKE"}
_WITH_RE = re.compile(r"WITH\s+(RECURSIVE\s+)?[\w\"`]+\s*(\([^)]*\)\s*)?AS\s*(NOT\s+)?(MATERIALIZED\s+)?\(", re.I)


def _find_start(text: str) -> int | None:
    """SQL'in başladığı yer. Metinde geçen "with", "select" gibi kelimeleri SQL sanmamak için:
    büyük harfli anahtar kelime satır başında ya da arkasından SQL'e benzer bir gövde geliyorsa;
    küçük harfli olan yalnızca satır başında (ya da "SQL:" gibi bir etiketten sonra) ve gövdesi SQL'e benziyorsa sayılır.
    """
    for m in _START_RE.finditer(text):
        word, upper = m.group(1), m.group(1).upper()
        rest = text[m.start():]
        if upper == "WITH" and not _WITH_RE.match(rest):
            continue
        line_start = text.rfind("\n", 0, m.start()) + 1
        prefix = text[line_start : m.start()].strip()
        at_line_start = prefix == "" or prefix.endswith(":")
        if word.isupper() and upper in _STRONG and (at_line_start or _looks_like_sql(rest)):
            return m.start()
        if at_line_start and upper in ("SELECT", "WITH", "INSERT", "UPDATE", "DELETE") and _looks_like_sql(rest):
            return m.start()
    return None


def _looks_like_sql(s: str) -> bool:
    head = s[:200].upper()
    return any(k in head for k in (" FROM ", "\nFROM ", "\tFROM ", " SET ", " INTO ", " AS (", " AS(", "COUNT(", " VALUES"))


def _cut_prose(s: str, dialect: str | None = None) -> str:
    """Çitsiz yanıtta: noktalı virgül yoksa boş satıra kadar al."""
    toks = tokenize(s, dialect)
    depth_text = []
    for t in toks:
        if t.kind == "semicolon":
            break
        if t.kind == "space" and t.text.count("\n") >= 2:
            break
        depth_text.append(t.text)
    return "".join(depth_text)


def _trim_trailing_prose(stmt: str) -> str:
    lines = stmt.rstrip().split("\n")
    while len(lines) > 1 and _is_prose_line(lines[-1]):
        lines.pop()
    return "\n".join(lines).strip()


def _is_prose_line(line: str) -> bool:
    s = line.strip()
    if not s:
        return True
    m = re.match(r"([^\W\d_][\w']*)\s+\S", s)
    if not m or m.group(1).upper() in SQL_WORDS:
        return False
    return s.endswith((".", "!", "?", ":")) and len(s.split()) >= 3
