"""JSON yazıcı: Python değerini JSON metnine çevirir (çıktı stdlib `json.dumps` ile birebir aynı).

Desteklenen: dict (yalnız dizgi anahtar), list/tuple, str, int, float (sonlu), bool, None.
Güvenli varsayılanlar: NaN/Infinity hatadır (RFC'de yoklar), dizgi olmayan anahtar hatadır (stdlib
sessizce dizgiye çevirir ve `{1: …, "1": …}` iki aynı anahtar üretebilir), döngüsel başvuru ve
aşırı derinlik hatadır. `ensure_ascii=True` ASCII dışını `\\uXXXX` (gerekirse vekil çifti) yazar.
Genişletme: yeni bir tür için `default=` işlevi verin ya da `write` içine bir dal ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable

ESCAPES = {
    '"': '\\"',
    "\\": "\\\\",
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}


class JsonWriteError(ValueError):
    """Değer JSON'a çevrilemedi; ileti yolu (ör. `$["a"][2]`) gösterir."""


def escape_string(s: str, ensure_ascii: bool) -> str:
    out = ['"']
    for ch in s:
        code = ord(ch)
        if ch in ESCAPES:
            out.append(ESCAPES[ch])
        elif code < 0x20 or (ensure_ascii and code > 0x7E):
            if code > 0xFFFF:
                code -= 0x10000
                out.append(f"\\u{0xD800 | (code >> 10):04x}\\u{0xDC00 | (code & 0x3FF):04x}")
            else:
                out.append(f"\\u{code:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


class Writer:
    def __init__(
        self,
        indent: str | None,
        sort_keys: bool,
        ensure_ascii: bool,
        separators: tuple[str, str],
        default: Callable[[object], object] | None,
        max_depth: int,
    ) -> None:
        self.indent = indent
        self.sort_keys = sort_keys
        self.ensure_ascii = ensure_ascii
        self.item_sep, self.key_sep = separators
        self.default = default
        self.max_depth = max_depth
        self.active: set[int] = set()  # şu an yazılmakta olan kapsayıcılar (döngü denetimi)
        self.parts: list[str] = []

    def newline(self, level: int) -> str:
        assert self.indent is not None
        return "\n" + self.indent * level

    def write(self, obj: object, level: int, path: str) -> None:
        if obj is None:
            self.parts.append("null")
        elif obj is True:
            self.parts.append("true")
        elif obj is False:
            self.parts.append("false")
        elif isinstance(obj, str):
            self.parts.append(escape_string(obj, self.ensure_ascii))
        elif isinstance(obj, int):
            self.parts.append(int.__repr__(obj))
        elif isinstance(obj, float):
            if obj != obj or obj in (float("inf"), float("-inf")):
                raise JsonWriteError(f"{path}: {obj!r} JSON'da yazılamaz (NaN/Infinity yoktur)")
            self.parts.append(float.__repr__(obj))
        elif isinstance(obj, (list, tuple, dict)):
            self.container(obj, level, path)
        elif self.default is not None:
            self.write(self.default(obj), level, path)
        else:
            raise JsonWriteError(
                f"{path}: {type(obj).__name__} türü JSON'a çevrilemez",
            )

    def container(
        self, obj: list[object] | tuple[object, ...] | dict[object, object], level: int, path: str
    ) -> None:
        if level >= self.max_depth:
            raise JsonWriteError(f"{path}: çok derin iç içe yapı (en fazla {self.max_depth} düzey)")
        if id(obj) in self.active:
            raise JsonWriteError(f"{path}: döngüsel başvuru (yapı kendini içeriyor)")
        opener, closer = ("{", "}") if isinstance(obj, dict) else ("[", "]")
        if not obj:
            self.parts.append(opener + closer)
            return
        self.active.add(id(obj))
        self.parts.append(opener)
        inner = level + 1
        sep = self.item_sep if self.indent is None else self.item_sep + self.newline(inner)
        if self.indent is not None:
            self.parts.append(self.newline(inner))
        if isinstance(obj, dict):
            items = list(obj.items())
            for key, _ in items:
                if not isinstance(key, str):
                    raise JsonWriteError(f"{path}: sözlük anahtarı dizgi olmalı, {key!r} verildi")
            if self.sort_keys:
                items.sort(key=lambda kv: str(kv[0]))
            for n, (key, value) in enumerate(items):
                if n:
                    self.parts.append(sep)
                self.parts.append(escape_string(str(key), self.ensure_ascii) + self.key_sep)
                self.write(value, inner, f"{path}[{key!r}]")
        else:
            for n, value in enumerate(obj):
                if n:
                    self.parts.append(sep)
                self.write(value, inner, f"{path}[{n}]")
        if self.indent is not None:
            self.parts.append(self.newline(level))
        self.parts.append(closer)
        self.active.discard(id(obj))


def dumps(
    obj: object,
    *,
    indent: int | str | None = None,
    sort_keys: bool = False,
    ensure_ascii: bool = True,
    separators: tuple[str, str] | None = None,
    default: Callable[[object], object] | None = None,
    max_depth: int = 400,
) -> str:
    """Değeri JSON metnine çevirir; parametreler stdlib `json.dumps` ile aynı anlamdadır."""
    if separators is None:
        separators = (", ", ": ") if indent is None else (",", ": ")
    indent_text = " " * indent if isinstance(indent, int) else indent
    writer = Writer(indent_text, sort_keys, ensure_ascii, separators, default, max_depth)
    writer.write(obj, 0, "$")
    return "".join(writer.parts)
