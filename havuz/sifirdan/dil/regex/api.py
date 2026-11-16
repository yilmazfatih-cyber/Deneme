"""Kullanıcı arayüzü: `compile`, `Pattern`, `Match`; search/match/fullmatch/findall/finditer/sub.

Davranış Python `re` ile aynıdır (desteklenen alt kümede): findall gruplar varsa grupları döndürür,
eşleşmeyen grup "" olur; boş eşleşmeden sonra aynı konumda yeniden boş eşleşme sayılmaz; sub
şablonunda `\\1`, `\\g<1>`, `\\g<ad>`, `\\n` gibi kaçışlar çözülür, eşleşmeyen grup "" yazılır.
Genişletme: `split` gibi yeni bir işlev için `finditer` üstüne kurun ve `__init__.py`'ye ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator

from .compiler import Inst, compile_regex
from .nodes import RegexError
from .parser import parse_pattern
from .pikevm import Caps, Stats, run

TEMPLATE_ESCAPES = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "f": "\f",
    "v": "\v",
    "a": "\a",
    "b": "\b",
    "\\": "\\",
}


class Match:
    def __init__(self, pattern: Pattern, string: str, caps: Caps) -> None:
        self.re = pattern
        self.string = string
        self._caps = caps

    def _index(self, group: int | str) -> int:
        if isinstance(group, str):
            if group not in self.re.groupindex:
                raise IndexError(f"böyle bir grup adı yok: {group!r}")
            return self.re.groupindex[group]
        if not 0 <= group <= self.re.groups:
            raise IndexError(f"böyle bir grup yok: {group}")
        return group

    def span(self, group: int | str = 0) -> tuple[int, int]:
        i = self._index(group)
        start, end = self._caps[2 * i], self._caps[2 * i + 1]
        return (-1, -1) if start is None or end is None else (start, end)

    def start(self, group: int | str = 0) -> int:
        return self.span(group)[0]

    def end(self, group: int | str = 0) -> int:
        return self.span(group)[1]

    def group(self, group: int | str = 0) -> str | None:
        start, end = self.span(group)
        return None if start < 0 else self.string[start:end]

    def __getitem__(self, group: int | str) -> str | None:
        return self.group(group)

    def groups(self, default: str | None = None) -> tuple[str | None, ...]:
        found = (self.group(i) for i in range(1, self.re.groups + 1))
        return tuple(default if g is None else g for g in found)

    def groupdict(self, default: str | None = None) -> dict[str, str | None]:
        found = {name: self.group(i) for name, i in self.re.groupindex.items()}
        return {name: default if g is None else g for name, g in found.items()}

    def __repr__(self) -> str:
        return f"<regex.Match span={self.span()}, match={self.group()!r}>"


class Pattern:
    def __init__(self, pattern: str) -> None:
        node, groups, names = parse_pattern(pattern)
        self.pattern = pattern
        self.groups = groups
        self.groupindex = names
        self.program: list[Inst] = compile_regex(pattern, node)
        self.stats = Stats()

    def _run(
        self, text: str, pos: int, *, anchored: bool, full: bool, reject: int | None
    ) -> Match | None:
        caps = run(
            self.program,
            self.groups,
            text,
            pos,
            anchored=anchored,
            full=full,
            reject_empty_at=reject,
            stats=self.stats,
        )
        return None if caps is None else Match(self, text, caps)

    def search(self, text: str, pos: int = 0) -> Match | None:
        return self._run(text, pos, anchored=False, full=False, reject=None)

    def match(self, text: str, pos: int = 0) -> Match | None:
        return self._run(text, pos, anchored=True, full=False, reject=None)

    def fullmatch(self, text: str, pos: int = 0) -> Match | None:
        return self._run(text, pos, anchored=True, full=True, reject=None)

    def finditer(self, text: str) -> Iterator[Match]:
        pos, must_advance = 0, False
        while pos <= len(text):
            found = self._run(
                text, pos, anchored=False, full=False, reject=pos if must_advance else None
            )
            if found is None:
                return
            yield found
            start, end = found.span()
            must_advance = start == end
            pos = end

    def findall(self, text: str) -> list[str | tuple[str, ...]]:
        out: list[str | tuple[str, ...]] = []
        for m in self.finditer(text):
            if self.groups == 0:
                out.append(m.group() or "")
            elif self.groups == 1:
                out.append(m.group(1) or "")
            else:
                out.append(tuple(g or "" for g in m.groups()))
        return out

    def sub(self, repl: str | Callable[[Match], str], text: str, count: int = 0) -> str:
        expand = repl if callable(repl) else self._template(repl)
        pieces: list[str] = []
        last = 0
        for done, m in enumerate(self.finditer(text)):
            if count and done >= count:
                break
            start, end = m.span()
            pieces.append(text[last:start])
            pieces.append(expand(m))
            last = end
        pieces.append(text[last:])
        return "".join(pieces)

    def _template(self, repl: str) -> Callable[[Match], str]:
        """Değiştirme şablonunu (sabit metin, grup numarası) parçalarına ayırır."""
        parts: list[str | int] = []
        i = 0
        while i < len(repl):
            c = repl[i]
            if c != "\\" or i + 1 >= len(repl):
                parts.append(c)
                i += 1
                continue
            nxt = repl[i + 1]
            if nxt == "g" and repl[i + 2 : i + 3] == "<":
                end = repl.find(">", i + 3)
                ref = repl[i + 3 : end] if end != -1 else ""
                parts.append(self._group_ref(ref, repl, i))
                i = end + 1
            elif nxt in "01234567" and _octal(repl[i + 1 : i + 4], nxt == "0"):
                digits = _octal(repl[i + 1 : i + 4], nxt == "0")
                parts.append(chr(int(digits, 8) & 0xFF))
                i += 1 + len(digits)
            elif nxt.isdigit() and nxt.isascii():
                digits = nxt + (repl[i + 2] if repl[i + 2 : i + 3].isdigit() else "")
                parts.append(self._group_ref(digits, repl, i))
                i += 1 + len(digits)
            elif nxt in TEMPLATE_ESCAPES:
                parts.append(TEMPLATE_ESCAPES[nxt])
                i += 2
            elif nxt.isascii() and nxt.isalpha():
                raise RegexError(f"şablonda bilinmeyen kaçış `\\{nxt}`", repl, i)
            else:
                parts.append("\\" + nxt)
                i += 2

        def expand(m: Match) -> str:
            return "".join(p if isinstance(p, str) else (m.group(p) or "") for p in parts)

        return expand

    def _group_ref(self, ref: str, repl: str, at: int) -> int:
        if ref.isdigit() and ref.isascii():
            number = int(ref)
        elif ref in self.groupindex:
            number = self.groupindex[ref]
        else:
            raise RegexError(f"geçersiz grup başvurusu: {ref!r}", repl, at)
        if number > self.groups:
            raise RegexError(f"geçersiz grup başvurusu: {number}", repl, at)
        return number

    def __repr__(self) -> str:
        return f"regex.compile({self.pattern!r})"


def _octal(chunk: str, leading_zero: bool) -> str:
    """Şablondaki sekizlik kaçış: `\\0`, `\\01`, `\\012` ya da üç sekizlik basamak (`\\101`)."""
    octal = "01234567"
    if leading_zero:
        digits = chunk[:1]
        for d in chunk[1:3]:
            if d not in octal:
                break
            digits += d
        return digits
    return chunk if len(chunk) == 3 and all(d in octal for d in chunk) else ""


_CACHE: dict[str, Pattern] = {}


def compile(pattern: str) -> Pattern:  # `re.compile` ile aynı ad bilerek seçildi
    """Deseni derler (son 256 desen önbellekte tutulur)."""
    cached = _CACHE.get(pattern)
    if cached is None:
        if len(_CACHE) >= 256:
            _CACHE.clear()
        cached = _CACHE[pattern] = Pattern(pattern)
    return cached
