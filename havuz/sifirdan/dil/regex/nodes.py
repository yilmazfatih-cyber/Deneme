"""Düzenli ifade AST düğümleri, hata türü ve karakter sınıfı denetimi.

Desen ayrıştırıcısı (parser.py) bu düğümleri kurar; derleyici (compiler.py) onları NFA
programına çevirir. `\\d \\w \\s` Python `re` ile aynı Unicode tanımını kullanır:
`\\d` = str.isdecimal, `\\w` = str.isalnum ya da "_", `\\s` = str.isspace.
Genişletme: yeni bir düğüm için buraya dataclass + `Node` birleşimine ad, derleyiciye bir dal.
"""

from __future__ import annotations

from dataclasses import dataclass


class RegexError(ValueError):
    """Desen hatası: konum (0'dan başlar) + ne bulundu + öneri."""

    def __init__(self, message: str, pattern: str, pos: int, hint: str | None = None) -> None:
        self.message = message
        self.pattern = pattern
        self.pos = pos
        self.hint = hint
        super().__init__(self.render())

    def render(self) -> str:
        lines = [f"Desen hatası (konum {self.pos}): {self.message}", f"  {self.pattern}"]
        lines.append("  " + " " * self.pos + "^")
        if self.hint:
            lines.append(f"İpucu: {self.hint}")
        return "\n".join(lines)


def is_word(ch: str) -> bool:
    return ch.isalnum() or ch == "_"


CATEGORIES = {
    "d": str.isdecimal,
    "w": is_word,
    "s": str.isspace,
}


def category_matches(name: str, ch: str) -> bool:
    """`d w s` ve büyük harfli tersleri `D W S`."""
    if name.islower():  # tr-güvenli: yalnız ASCII d/w/s/D/W/S harfleri
        return CATEGORIES[name](ch)
    return not CATEGORIES[name.lower()](ch)  # tr-güvenli: ASCII


@dataclass(frozen=True)
class CharClass:
    """`[a-zç\\d]` gibi bir sınıf; `ranges` kapsayıcı aralıklardır, `categories` d/w/s/D/W/S."""

    ranges: tuple[tuple[str, str], ...]
    categories: tuple[str, ...]
    negated: bool

    def matches(self, ch: str) -> bool:
        hit = any(lo <= ch <= hi for lo, hi in self.ranges) or any(
            category_matches(c, ch) for c in self.categories
        )
        return hit != self.negated


@dataclass(frozen=True)
class Char:
    ch: str


@dataclass(frozen=True)
class AnyChar:
    """`.` — satır sonu (\\n) dışında her karakter."""


@dataclass(frozen=True)
class ClassNode:
    cls: CharClass


@dataclass(frozen=True)
class Anchor:
    kind: str  # "^" "$" "A" "Z" "b" "B"


@dataclass(frozen=True)
class Group:
    node: Node
    index: int | None  # None: yakalamayan grup (?:…)
    name: str | None = None


@dataclass(frozen=True)
class Concat:
    items: tuple[Node, ...]


@dataclass(frozen=True)
class Alt:
    options: tuple[Node, ...]


@dataclass(frozen=True)
class Repeat:
    node: Node
    min: int
    max: int | None  # None: sınırsız
    greedy: bool


Node = Char | AnyChar | ClassNode | Anchor | Group | Concat | Alt | Repeat
