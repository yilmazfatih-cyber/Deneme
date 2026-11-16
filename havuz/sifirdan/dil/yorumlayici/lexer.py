"""Sözcük çözümleyici: kaynak metni belirteç listesine çevirir.

Kurallar: kaynak önce Unicode NFC'ye getirilir (ğ = g + birleşik işaret yazımı da tanınır);
`#` satır sonuna kadar yorumdur; yeni satır deyim ayırıcıdır, ancak `(` ve `[` içinde yok sayılır
(uzun çağrılar birkaç satıra bölünebilsin diye); adlar Unicode harfleriyle başlayabilir.
Kullanan: parser.py (`tokenize`). Genişletme: yeni bir işleç için tokens.py'deki tabloya ekleyin;
yeni bir kaçış dizisi için `ESCAPES` sözlüğüne bir satır ekleyin.
"""

from __future__ import annotations

import unicodedata

from .errors import Pos, syntax_error
from .tokens import KEYWORDS, ONE_CHAR_OPS, TWO_CHAR_OPS, Token, TokenType

ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "\\": "\\", '"': '"', "0": "\0"}
MAX_NUMBER_DIGITS = 4000  # Python'un 4300 basamaklık int<->str sınırının altında kalır.

# Sık yapılan karakter hatalarına özel ipuçları.
CHAR_HINTS = {
    "!": "Değilleme için `değil x`, eşitsizlik için `!=` yazın.",
    "&": "Mantıksal 've' için `ve` yazın.",
    "|": "Mantıksal 'veya' için `veya` yazın.",
    "'": 'Dizgiler çift tırnakla yazılır: "merhaba".',
    ".": 'Tohum\'da üye erişimi yok; sözlükte `kisi["ad"]` biçimini kullanın.',
}


class Lexer:
    def __init__(self, source: str) -> None:
        self.src = unicodedata.normalize("NFC", source)
        self.i = 0
        self.line = 1
        self.col = 1
        self.depth = 0  # açık ( ve [ sayısı; sıfırdan büyükse yeni satır yok sayılır
        self.tokens: list[Token] = []

    # --- yardımcılar -------------------------------------------------------
    def peek(self, offset: int = 0) -> str:
        j = self.i + offset
        return self.src[j] if j < len(self.src) else ""

    def advance(self) -> str:
        ch = self.src[self.i]
        self.i += 1
        if ch == "\n":
            self.line += 1
            self.col = 1
        else:
            self.col += 1
        return ch

    def add(self, type_: TokenType, text: str, pos: Pos, value: object = None) -> None:
        self.tokens.append(Token(type_, text, value, pos))

    # --- ana döngü ---------------------------------------------------------
    def run(self) -> list[Token]:
        while self.i < len(self.src):
            ch = self.peek()
            pos = Pos(self.line, self.col)
            if ch == "\n":
                self.advance()
                if (
                    self.depth == 0
                    and self.tokens
                    and self.tokens[-1].type is not TokenType.NEWLINE
                ):
                    self.add(TokenType.NEWLINE, "\\n", pos)
            elif ch in " \t\r﻿":
                self.advance()
            elif ch == "#":
                while self.i < len(self.src) and self.peek() != "\n":
                    self.advance()
            elif ch.isdigit() and ch.isascii():
                self.number(pos)
            elif ch == '"':
                self.string(pos)
            elif ch.isalpha() or ch == "_":
                self.identifier(pos)
            else:
                self.operator(pos)
        self.add(TokenType.EOF, "", Pos(self.line, self.col))
        return self.tokens

    def operator(self, pos: Pos) -> None:
        two = self.peek() + self.peek(1)
        if two in TWO_CHAR_OPS:
            self.advance()
            self.advance()
            self.add(TWO_CHAR_OPS[two], two, pos)
            return
        ch = self.peek()
        if ch in ONE_CHAR_OPS:
            self.advance()
            type_ = ONE_CHAR_OPS[ch]
            if type_ in (TokenType.LPAREN, TokenType.LBRACKET):
                self.depth += 1
            elif type_ in (TokenType.RPAREN, TokenType.RBRACKET):
                self.depth = max(0, self.depth - 1)
            self.add(type_, ch, pos)
            return
        name = unicodedata.name(ch, "adsız karakter")
        raise syntax_error(f"beklenmeyen karakter '{ch}' ({name})", pos, CHAR_HINTS.get(ch))

    def digits(self) -> str:
        """Rakamları ve rakamlar arasındaki `_` ayraçlarını okur (1_000_000)."""
        out = []
        while True:
            ch = self.peek()
            if ch.isdigit() and ch.isascii():
                out.append(self.advance())
            elif ch == "_" and out and self.peek(1).isdigit() and self.peek(1).isascii():
                self.advance()
            else:
                return "".join(out)

    def number(self, pos: Pos) -> None:
        start = self.i
        text = self.digits()
        is_float = False
        if self.peek() == "." and self.peek(1).isdigit():
            self.advance()
            text += "." + self.digits()
            is_float = True
        elif self.peek() == ".":
            raise syntax_error(
                "ondalık noktadan sonra rakam bekleniyordu",
                Pos(self.line, self.col),
                "Ondalık sayıları `3.0` gibi yazın.",
            )
        if self.peek() in ("e", "E") and (
            self.peek(1).isdigit() or (self.peek(1) in "+-" and self.peek(2).isdigit())
        ):
            text += self.advance()
            if self.peek() in "+-":
                text += self.advance()
            text += self.digits()
            is_float = True
        if len(text) > MAX_NUMBER_DIGITS:
            raise syntax_error(f"sayı çok uzun ({len(text)} karakter)", pos)
        if self.peek().isalpha() or self.peek() == "_":
            raise syntax_error(
                f"sayıdan hemen sonra harf geldi: '{self.src[start : self.i]}{self.peek()}'",
                Pos(self.line, self.col),
                "Ad rakamla başlayamaz; sayı ile ad arasına işleç ya da boşluk koyun.",
            )
        value: object = float(text) if is_float else int(text)
        if isinstance(value, float) and value in (float("inf"), float("-inf")):
            raise syntax_error(f"sayı çok büyük: {text}", pos)
        self.add(TokenType.NUMBER, self.src[start : self.i], pos, value)

    def string(self, pos: Pos) -> None:
        start = self.i
        self.advance()  # açılış tırnağı
        out: list[str] = []
        while True:
            ch = self.peek()
            if ch == "" or ch == "\n":
                raise syntax_error(
                    "dizgi kapanmadı",
                    pos,
                    'Satır bitmeden `"` ile kapatın; çok satırlı metin için `\\n` kullanın.',
                    at_eof=(ch == ""),
                )
            if ch == '"':
                self.advance()
                break
            if ch == "\\":
                out.append(self.escape())
            else:
                out.append(self.advance())
        self.add(TokenType.STRING, self.src[start : self.i], pos, "".join(out))

    def escape(self) -> str:
        pos = Pos(self.line, self.col)
        self.advance()  # ters bölü
        ch = self.peek()
        if ch in ESCAPES:
            self.advance()
            return ESCAPES[ch]
        if ch == "u" and self.peek(1) == "{":
            self.advance()
            self.advance()
            hex_digits = ""
            while self.peek() not in ("}", "", "\n") and len(hex_digits) < 7:
                hex_digits += self.advance()
            if self.peek() != "}" or not hex_digits:
                raise syntax_error("`\\u{…}` kaçışı kapanmadı", pos, "Örnek: `\\u{1F600}`.")
            self.advance()
            try:
                code = int(hex_digits, 16)
                if 0xD800 <= code <= 0xDFFF:
                    raise ValueError
                return chr(code)
            except ValueError:
                raise syntax_error(f"geçersiz Unicode kod noktası: {hex_digits}", pos) from None
        shown = ch if ch else "dosya sonu"
        raise syntax_error(
            f"bilinmeyen kaçış dizisi '\\{shown}'",
            pos,
            'Geçerli kaçışlar: \\n \\t \\r \\\\ \\" \\0 \\u{…}. Ters bölünün kendisi için `\\\\`.',
        )

    def identifier(self, pos: Pos) -> None:
        start = self.i
        while self.peek() and (self.peek().isalnum() or self.peek() == "_"):
            self.advance()
        text = self.src[start : self.i]
        type_ = KEYWORDS.get(text, TokenType.IDENT)
        self.add(type_, text, pos, text if type_ is TokenType.IDENT else None)


def tokenize(source: str) -> list[Token]:
    """Kaynak metni belirteçlere böler; son belirteç her zaman EOF'tur."""
    return Lexer(source).run()
