"""Belirteç (token) türleri ve Türkçe anahtar sözcük tablosu.

Her anahtar sözcüğün Türkçe yazımı ve ASCII karşılığı vardır (`eğer`/`eger`); ikisi de aynı
belirteç türüne çevrilir. Belirteç türünün değeri, hata iletisinde görünen metindir.
Genişletme: yeni anahtar sözcük için `TokenType`'a bir üye, `KEYWORDS`'e iki satır (Türkçe + ASCII)
ekleyin; sonra ayrıştırıcıda (parser.py) onu işleyin.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from .errors import Pos


class TokenType(Enum):
    # Değişmezler ve adlar
    NUMBER = "sayı"
    STRING = "dizgi"
    IDENT = "ad"
    # Anahtar sözcükler
    VAR = "değişken"
    FUNC = "işlev"
    RETURN = "döndür"
    IF = "eğer"
    ELSE = "değilse"
    WHILE = "iken"
    FOR = "için"
    IN = "içinde"
    TRUE = "doğru"
    FALSE = "yanlış"
    NONE = "yok"
    AND = "ve"
    OR = "veya"
    NOT = "değil"
    BREAK = "kır"
    CONTINUE = "devam"
    # İşleçler
    PLUS = "+"
    MINUS = "-"
    STAR = "*"
    SLASH = "/"
    PERCENT = "%"
    POWER = "**"
    EQ = "=="
    NE = "!="
    LT = "<"
    LE = "<="
    GT = ">"
    GE = ">="
    ASSIGN = "="
    PLUS_ASSIGN = "+="
    MINUS_ASSIGN = "-="
    STAR_ASSIGN = "*="
    SLASH_ASSIGN = "/="
    # Ayraçlar
    LPAREN = "("
    RPAREN = ")"
    LBRACKET = "["
    RBRACKET = "]"
    LBRACE = "{"
    RBRACE = "}"
    COMMA = ","
    COLON = ":"
    SEMICOLON = ";"
    NEWLINE = "yeni satır"
    EOF = "dosya sonu"


# Türkçe yazım ve ASCII karşılığı -> belirteç türü. YENİ ANAHTAR SÖZCÜK BURAYA.
KEYWORDS: dict[str, TokenType] = {
    "değişken": TokenType.VAR,
    "degisken": TokenType.VAR,
    "işlev": TokenType.FUNC,
    "islev": TokenType.FUNC,
    "döndür": TokenType.RETURN,
    "dondur": TokenType.RETURN,
    "eğer": TokenType.IF,
    "eger": TokenType.IF,
    "değilse": TokenType.ELSE,
    "degilse": TokenType.ELSE,
    "iken": TokenType.WHILE,
    "için": TokenType.FOR,
    "icin": TokenType.FOR,
    "içinde": TokenType.IN,
    "icinde": TokenType.IN,
    "doğru": TokenType.TRUE,
    "dogru": TokenType.TRUE,
    "yanlış": TokenType.FALSE,
    "yanlis": TokenType.FALSE,
    "yok": TokenType.NONE,
    "ve": TokenType.AND,
    "veya": TokenType.OR,
    "değil": TokenType.NOT,
    "degil": TokenType.NOT,
    "kır": TokenType.BREAK,
    "kir": TokenType.BREAK,
    "devam": TokenType.CONTINUE,
}

# İki karakterli işleçler önce denenir (en uzun eşleşme kuralı).
TWO_CHAR_OPS: dict[str, TokenType] = {
    "**": TokenType.POWER,
    "==": TokenType.EQ,
    "!=": TokenType.NE,
    "<=": TokenType.LE,
    ">=": TokenType.GE,
    "+=": TokenType.PLUS_ASSIGN,
    "-=": TokenType.MINUS_ASSIGN,
    "*=": TokenType.STAR_ASSIGN,
    "/=": TokenType.SLASH_ASSIGN,
}

ONE_CHAR_OPS: dict[str, TokenType] = {
    "+": TokenType.PLUS,
    "-": TokenType.MINUS,
    "*": TokenType.STAR,
    "/": TokenType.SLASH,
    "%": TokenType.PERCENT,
    "<": TokenType.LT,
    ">": TokenType.GT,
    "=": TokenType.ASSIGN,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    "[": TokenType.LBRACKET,
    "]": TokenType.RBRACKET,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
    ",": TokenType.COMMA,
    ":": TokenType.COLON,
    ";": TokenType.SEMICOLON,
}


@dataclass(frozen=True, slots=True)
class Token:
    """Bir belirteç: türü, kaynaktaki metni, (varsa) değeri ve başladığı konum."""

    type: TokenType
    text: str
    value: object
    pos: Pos

    def describe(self) -> str:
        """Hata iletisinde gösterilecek kısa ad: `'{'`, `ad 'x'`, `yeni satır`…"""
        if self.type in (TokenType.NEWLINE, TokenType.EOF):
            return str(self.type.value)
        if self.type is TokenType.IDENT:
            return f"ad '{self.text}'"
        return f"'{self.text}'"
