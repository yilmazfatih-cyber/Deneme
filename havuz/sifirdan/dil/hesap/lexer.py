"""Hesap ifadesi belirteçleri: sayı, ad, işleç, parantez, ayraç, dönüşüm sözcüğü.

`kaç`, `to` ve `->` dönüşüm işlecidir (`5 km kaç m`). `°C`/`°F` tek ad sayılır. Türkçe kipte
bağımsız değişken ayracı `;`, uluslararası kipte `,` olur. Uzunluk sınırı vardır.
Genişletme: yeni işleç için `OPERATORS` dizgisine karakteri ekleyin ve shunting.py'de
önceliğini verin.
"""

from __future__ import annotations

from dataclasses import dataclass

from .errors import CalcError
from .numfmt import scan_number

OPERATORS = "+-*/%^!="
CONVERT_WORDS = {"kaç", "kac", "to"}
MAX_LENGTH = 2000


@dataclass(frozen=True)
class Token:
    kind: str  # "sayı", "ad", "işleç", "(", ")", "ayraç", "dönüştür"
    text: str
    pos: int
    value: float = 0.0


def tokenize(text: str, turkish: bool) -> list[Token]:
    if len(text) > MAX_LENGTH:
        raise CalcError(f"ifade çok uzun (en fazla {MAX_LENGTH} karakter)", MAX_LENGTH)
    separator = ";" if turkish else ","
    tokens: list[Token] = []
    i = 0
    while i < len(text):
        c = text[i]
        if c.isspace():
            i += 1
        elif c.isdigit() or (c in ".," and text[i + 1 : i + 2].isdigit() and c != separator):
            value, end = scan_number(text, i, turkish)
            tokens.append(Token("sayı", text[i:end], i, value))
            i = end
        elif c.isalpha() or c in "_°π":
            end = i + 1
            while end < len(text) and (text[end].isalnum() or text[end] == "_"):
                end += 1
            word = text[i:end]
            kind = "dönüştür" if word in CONVERT_WORDS else "ad"
            tokens.append(Token(kind, word, i))
            i = end
        elif text.startswith("->", i):
            tokens.append(Token("dönüştür", "->", i))
            i += 2
        elif c in OPERATORS:
            tokens.append(Token("işleç", c, i))
            i += 1
        elif c in "()":
            tokens.append(Token(c, c, i))
            i += 1
        elif c == separator:
            tokens.append(Token("ayraç", c, i))
            i += 1
        else:
            hint = None
            if c in ",;":
                hint = (
                    "Türkçe kipte bağımsız değişkenler ';' ile ayrılır."
                    if turkish
                    else "Ondalık ayırıcı noktadır; Türkçe biçim için --tr kullanın."
                )
            elif c == "×":
                hint = "Çarpma için * yazın."
            raise CalcError(f"beklenmeyen karakter '{c}'", i, hint)
    return tokens
