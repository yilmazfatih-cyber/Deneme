"""Desen ayrıştırıcı: düzenli ifade metnini AST'ye (nodes.py) çeviren özyinelemeli iniş.

Dilbilgisi:  almaşma = birleşim ("|" birleşim)* ;  birleşim = nicelenmiş* ;
             nicelenmiş = öğe [ ("*" | "+" | "?" | "{m,n}") ["?"] ] ;
             öğe = "(" … ")" | "[" sınıf "]" | "." | "^" | "$" | "\\" kaçış | karakter
Python `re` ile aynı kurallar: `{` geçerli bir niceleyici değilse düz karakterdir; `]` sınıfın ilk
öğesiyse düz karakterdir; grup numaraları açılış parantezinin sırasıdır.
Doğrusal zaman garantisini bozacak özellikler (geri başvuru, ileri/geri bakış) açık bir hata verir.
Genişletme: yeni bir kaçış için `ESCAPES`'e ya da `escape` içine, yeni grup türü için `group`'a dal.
"""

from __future__ import annotations

from .nodes import (
    Alt,
    Anchor,
    AnyChar,
    Char,
    CharClass,
    ClassNode,
    Concat,
    Group,
    Node,
    RegexError,
    Repeat,
)

ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "f": "\f", "v": "\v", "a": "\a"}
HEX_LENGTHS = {"x": 2, "u": 4, "U": 8}
MAX_REPEAT = 1000
MAX_NESTING = 200


class PatternParser:
    def __init__(self, pattern: str) -> None:
        self.p = pattern
        self.i = 0
        self.groups = 0
        self.names: dict[str, int] = {}
        self.depth = 0

    def error(self, message: str, pos: int | None = None, hint: str | None = None) -> RegexError:
        return RegexError(message, self.p, self.i if pos is None else pos, hint)

    def peek(self, offset: int = 0) -> str:
        j = self.i + offset
        return self.p[j] if j < len(self.p) else ""

    # --- yapı ----------------------------------------------------------------
    def parse(self) -> Node:
        node = self.alternation()
        if self.i < len(self.p):
            raise self.error("eşi olmayan ')'", hint="Düz parantez için `\\)` yazın.")
        return node

    def alternation(self) -> Node:
        options = [self.concat()]
        while self.peek() == "|":
            self.i += 1
            options.append(self.concat())
        return options[0] if len(options) == 1 else Alt(tuple(options))

    def concat(self) -> Node:
        items: list[Node] = []
        while self.i < len(self.p) and self.p[self.i] not in "|)":
            items.append(self.quantified())
        return items[0] if len(items) == 1 else Concat(tuple(items))

    def quantified(self) -> Node:
        start = self.i
        atom = self.atom()
        quant = self.quantifier()
        if quant is None:
            return atom
        if isinstance(atom, Anchor):
            raise self.error("tekrarlanacak bir şey yok", start, "Çapalar (^ $ \\b) tekrarlanamaz.")
        low, high = quant
        greedy = True
        if self.peek() == "?":
            self.i += 1
            greedy = False
        elif self.peek() == "+":
            raise self.error("iyelik niceleyicisi (`*+`) desteklenmiyor")
        if self.peek() in ("*", "+", "?") or (self.peek() == "{" and self.brace_quantifier(False)):
            raise self.error("üst üste iki niceleyici", hint="`a**` yerine `a*` yazın.")
        return Repeat(atom, low, high, greedy)

    def quantifier(self) -> tuple[int, int | None] | None:
        c = self.peek()
        if c in ("*", "+", "?"):
            self.i += 1
            return {"*": (0, None), "+": (1, None), "?": (0, 1)}[c]
        if c == "{":
            return self.brace_quantifier(True)
        return None

    def brace_quantifier(self, consume: bool) -> tuple[int, int | None] | None:
        """`{m}`, `{m,}`, `{m,n}`, `{,n}`, `{,}`; geçersizse None (o zaman `{` düz karakterdir)."""
        j = self.i + 1
        low_text = ""
        while j < len(self.p) and self.p[j].isdigit() and self.p[j].isascii():
            low_text += self.p[j]
            j += 1
        high_text: str | None = low_text
        if j < len(self.p) and self.p[j] == ",":
            j += 1
            high_text = ""
            while j < len(self.p) and self.p[j].isdigit() and self.p[j].isascii():
                high_text += self.p[j]
                j += 1
        if j >= len(self.p) or self.p[j] != "}":
            return None
        if not consume:
            return (0, None)
        start = self.i
        self.i = j + 1
        low = int(low_text) if low_text else 0
        high = int(high_text) if high_text else None
        if max(low, high or 0) > MAX_REPEAT:
            raise self.error(f"tekrar sayısı çok büyük (en fazla {MAX_REPEAT})", start)
        if high is not None and low > high:
            raise self.error("en az sayısı en çok sayısından büyük", start + 1)
        return (low, high)

    def atom(self) -> Node:
        c = self.p[self.i]
        if c == "(":
            return self.group()
        if c == "[":
            return ClassNode(self.char_class())
        if c == "\\":
            return self.escape()
        if c in "*+?" or (c == "{" and self.brace_quantifier(False)):
            raise self.error(
                "tekrarlanacak bir şey yok", hint="Düz karakter için önüne `\\` koyun."
            )
        self.i += 1
        if c == ".":
            return AnyChar()
        if c in "^$":
            return Anchor(c)
        return Char(c)

    def group(self) -> Node:
        open_pos = self.i
        self.i += 1
        capturing = True
        name: str | None = None
        if self.peek() == "?":
            if self.peek(1) == ":":
                self.i += 2
                capturing = False
            elif self.peek(1) == "P" and self.peek(2) == "<":
                self.i += 3
                end = self.p.find(">", self.i)
                name = self.p[self.i : end] if end != -1 else ""
                if end == -1 or not name.isidentifier():
                    raise self.error("geçersiz grup adı", self.i, "Biçim: (?P<ad>…)")
                if name in self.names:
                    raise self.error(f"'{name}' grup adı iki kez kullanılmış", self.i)
                self.i = end + 1
            else:
                raise self.unsupported_group()
        index: int | None = None
        if capturing:
            self.groups += 1
            index = self.groups
            if name is not None:
                self.names[name] = index
        self.depth += 1
        if self.depth > MAX_NESTING:
            raise self.error(f"çok derin iç içe grup (en fazla {MAX_NESTING})", open_pos)
        inner = self.alternation()
        self.depth -= 1
        if self.peek() != ")":
            raise self.error("grup kapanmadı", open_pos, "Eksik `)` ekleyin.")
        self.i += 1
        return Group(inner, index, name)

    def unsupported_group(self) -> RegexError:
        rest = self.p[self.i - 1 : self.i + 3]  # "(" ile başlayan ilk dört karakter
        if rest.startswith(("(?=", "(?!", "(?<=", "(?<!")):
            what = "ileri/geri bakış (lookaround)"
        elif rest.startswith("(?P="):
            what = "geri başvuru"
        elif rest.startswith("(?>"):
            what = "atomik grup"
        else:
            what = "bu grup türü (satır içi bayrak ya da yorum)"
        return self.error(
            f"{what} desteklenmiyor",
            hint="Bu motor doğrusal zaman garantisi verir; desteklenenler: (…), (?:…), (?P<ad>…).",
        )

    # --- kaçışlar ve sınıflar -----------------------------------------------------
    def escape_char(self, in_class: bool) -> str | None:
        """Ters bölüden sonraki tek karakterlik kaçışı çözer; sınıf kategorisiyse None döner."""
        start = self.i
        self.i += 1
        c = self.peek()
        if c == "":
            raise self.error(
                "desen ters bölüyle bitemez", start, "Ters bölünün kendisi için `\\\\`."
            )
        self.i += 1
        if c in "dDwWsS":
            return None
        if c in ESCAPES:
            return ESCAPES[c]
        if in_class and c == "b":
            return "\b"
        if c in HEX_LENGTHS:
            digits = self.p[self.i : self.i + HEX_LENGTHS[c]]
            if len(digits) != HEX_LENGTHS[c] or any(
                d not in "0123456789abcdefABCDEF" for d in digits
            ):
                raise self.error(f"eksik `\\{c}` kaçışı", start)
            self.i += len(digits)
            try:
                return chr(int(digits, 16))
            except ValueError:
                raise self.error("geçersiz Unicode kod noktası", start) from None
        if c.isdigit() and c.isascii():
            raise self.error(
                "geri başvuru ve sekizlik kaçış desteklenmiyor",
                start,
                "Doğrusal zaman için geri başvuru (\\1) yoktur; NUL için `\\x00` yazın.",
            )
        if c.isascii() and c.isalpha():
            raise self.error(f"bilinmeyen kaçış `\\{c}`", start)
        return c

    def escape(self) -> Node:
        if self.peek(1) in ("b", "B", "A", "Z"):
            self.i += 2
            return Anchor(self.p[self.i - 1])
        ch = self.escape_char(in_class=False)
        if ch is None:
            return ClassNode(CharClass((), (self.p[self.i - 1],), False))
        return Char(ch)

    def class_item(self) -> tuple[str | None, str]:
        """Sınıfın tek öğesi: (karakter ya da None, kategori adı)."""
        if self.peek() == "\\":
            ch = self.escape_char(in_class=True)
            return (ch, "" if ch is not None else self.p[self.i - 1])
        self.i += 1
        return (self.p[self.i - 1], "")

    def char_class(self) -> CharClass:
        open_pos = self.i
        self.i += 1
        negated = self.peek() == "^"
        if negated:
            self.i += 1
        ranges: list[tuple[str, str]] = []
        categories: list[str] = []
        first = True
        while self.peek() != "]" or first:
            if self.peek() == "":
                raise self.error("karakter sınıfı kapanmadı", open_pos, "Eksik `]` ekleyin.")
            first = False
            item_pos = self.i
            low, category = self.class_item()
            if self.peek() == "-" and self.peek(1) not in ("]", ""):
                self.i += 1
                high, _ = self.class_item()
                if low is None or high is None:
                    raise self.error("geçersiz aralık: uçlar tek karakter olmalı", item_pos)
                if low > high:
                    raise self.error(
                        f"geçersiz aralık {low}-{high}", item_pos, "Küçük uç önce gelir."
                    )
                ranges.append((low, high))
            elif low is None:
                categories.append(category)
            else:
                ranges.append((low, low))
        self.i += 1
        return CharClass(tuple(ranges), tuple(categories), negated)


def parse_pattern(pattern: str) -> tuple[Node, int, dict[str, int]]:
    """Deseni ayrıştırır: (AST, yakalama grubu sayısı, ad -> grup numarası)."""
    parser = PatternParser(pattern)
    node = parser.parse()
    return node, parser.groups, dict(parser.names)
