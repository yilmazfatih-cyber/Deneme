"""Belirteçleyici (lexer): SQL metnini belirteç (token) listesine çevirir.

Belirteç türleri: KEYWORD, IDENT, NUMBER, STRING, PARAM (`?`), OP (`=`, `<=`, `||`, `(`, `,` ...), EOF.
Tanımlayıcılar küçük harfe çevrilir (SQL'de büyük/küçük harf duyarsız); `"çift tırnaklı"` adlar da.
Metin sabitleri tek tırnaklıdır, içteki `''` tek bir tırnak demektir. `--` satır sonuna dek yorumdur.

Genişletme: yeni anahtar sözcük → `KEYWORDS` kümesine ekleyin (ayrıştırıcıda da kullanın).
"""

from __future__ import annotations

from dataclasses import dataclass

from .errors import SqlError

KEYWORDS = frozenset(
    """
    select distinct all from where group by having order asc desc limit offset as and or not
    null is in between like case when then else end insert into values update set delete
    create table index unique primary key drop if exists join inner left outer cross on
    explain default true false
    """.split()
)
_TWO_CHAR_OPS = ("<=", ">=", "<>", "!=", "==", "||")
_ONE_CHAR_OPS = "=<>+-*/%(),.;"


@dataclass(frozen=True)
class Token:
    kind: str  # KEYWORD, IDENT, NUMBER, STRING, PARAM, OP, EOF
    value: str
    position: int  # metindeki başlangıç (hata iletileri için)


def tokenize(sql: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    while i < len(sql):
        char = sql[i]
        if char.isspace():
            i += 1
        elif sql.startswith("--", i):
            end = sql.find("\n", i)
            i = len(sql) if end < 0 else end
        elif char == "'":
            value, i = _read_quoted(sql, i, "'")
            tokens.append(Token("STRING", value, i))
        elif char == '"':
            value, i = _read_quoted(sql, i, '"')
            tokens.append(Token("IDENT", value.lower(), i))
        elif char.isdigit() or (char == "." and i + 1 < len(sql) and sql[i + 1].isdigit()):
            start = i
            i = _read_number(sql, i)
            tokens.append(Token("NUMBER", sql[start:i], start))
        elif char.isalpha() or char == "_":
            start = i
            while i < len(sql) and (sql[i].isalnum() or sql[i] == "_"):
                i += 1
            word = sql[start:i].lower()
            tokens.append(Token("KEYWORD" if word in KEYWORDS else "IDENT", word, start))
        elif char == "?":
            tokens.append(Token("PARAM", "?", i))
            i += 1
        elif sql[i : i + 2] in _TWO_CHAR_OPS:
            tokens.append(Token("OP", sql[i : i + 2], i))
            i += 2
        elif char in _ONE_CHAR_OPS:
            tokens.append(Token("OP", char, i))
            i += 1
        else:
            raise SqlError(f"{i}. karakterde beklenmeyen işaret: {char!r}")
    tokens.append(Token("EOF", "", len(sql)))
    return tokens


def _read_quoted(sql: str, start: int, quote: str) -> tuple[str, int]:
    parts: list[str] = []
    i = start + 1
    while True:
        end = sql.find(quote, i)
        if end < 0:
            raise SqlError(f"{start}. karakterde açılan tırnak kapanmamış")
        parts.append(sql[i:end])
        if sql.startswith(quote * 2, end):  # '' → '
            parts.append(quote)
            i = end + 2
        else:
            return "".join(parts), end + 1


def _read_number(sql: str, i: int) -> int:
    while i < len(sql) and sql[i].isdigit():
        i += 1
    if i < len(sql) and sql[i] == ".":
        i += 1
        while i < len(sql) and sql[i].isdigit():
            i += 1
    if i < len(sql) and sql[i] in "eE":
        j = i + 1
        if j < len(sql) and sql[j] in "+-":
            j += 1
        if j < len(sql) and sql[j].isdigit():
            i = j
            while i < len(sql) and sql[i].isdigit():
                i += 1
    return i
