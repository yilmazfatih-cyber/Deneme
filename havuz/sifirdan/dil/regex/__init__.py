"""Doğrusal zamanlı düzenli ifade motoru (Thompson NFA + Pike VM), Python `re` uyumlu alt küme.

Hızlı kullanım:
    >>> import regex
    >>> regex.search(r"(\\d+)-(\\d+)", "tel: 0212-555").groups()
    ('0212', '555')
    >>> regex.sub(r"(?P<ad>\\w+)", r"<\\g<ad>>", "iyi gün")
    '<iyi> <gün>'

Boru hattı: parser.py (desen → AST) → compiler.py (AST → NFA programı) → pikevm.py (eşzamanlı
benzetim) → api.py (Pattern/Match). Felaket desenler (`(a+)+b`) doğrusal zamanda çalışır.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator

from .api import Match, Pattern, compile
from .nodes import RegexError

__all__ = [
    "Match",
    "Pattern",
    "RegexError",
    "compile",
    "findall",
    "finditer",
    "fullmatch",
    "match",
    "search",
    "sub",
]


def search(pattern: str, text: str) -> Match | None:
    return compile(pattern).search(text)


def match(pattern: str, text: str) -> Match | None:
    return compile(pattern).match(text)


def fullmatch(pattern: str, text: str) -> Match | None:
    return compile(pattern).fullmatch(text)


def findall(pattern: str, text: str) -> list[str | tuple[str, ...]]:
    return compile(pattern).findall(text)


def finditer(pattern: str, text: str) -> Iterator[Match]:
    return compile(pattern).finditer(text)


def sub(pattern: str, repl: str | Callable[[Match], str], text: str, count: int = 0) -> str:
    return compile(pattern).sub(repl, text, count)
