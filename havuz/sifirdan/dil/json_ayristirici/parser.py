"""RFC 8259 JSON ayrıştırıcı (özyinelemeli iniş) ve `JsonError`.

Kurallar (RFC 8259): boşluk yalnız boşluk/sekme/satır sonu/satırbaşı; sayı baştaki sıfırsız, `+`
ve `.5` yok; NaN/Infinity yok; dizgide denetim karakterleri kaçışlı; `\\uXXXX` vekil çiftleri
birleşir, eşi olmayan vekil varsayılan olarak hatadır. Sınırlar: iç içe derinlik (varsayılan 400)
ve sayı uzunluğu (1000 karakter) — kötü niyetli girdi yığını taşırmasın, CPU'yu kilitlemesin.
Hata: satır + sütun + ne beklendi + ne bulundu + ipucu (ör. "sondaki virgül").
Genişletme: yeni bir seçenek için `Options`'a alan ekleyip ilgili tarama işlevine geçirin.
"""

from __future__ import annotations

from dataclasses import dataclass

from .scanner import (
    WHITESPACE,
    ScanError,
    after_item,
    bom_error,
    duplicate_key,
    expected_colon,
    expected_key,
    extra_data,
    scan_literal,
    scan_number,
    scan_string,
    too_deep,
    trailing_comma,
    unclosed,
    unexpected_value,
)


class JsonError(ValueError):
    """JSON hatası: `line`/`col` 1'den başlar."""

    def __init__(self, message: str, line: int, col: int, hint: str | None = None) -> None:
        self.message = message
        self.line = line
        self.col = col
        self.hint = hint
        tail = f" İpucu: {hint}" if hint else ""
        super().__init__(f"JSON hatası (satır {line}, sütun {col}): {message}.{tail}")

    def render(self, text: str) -> str:
        """Hatayı ilgili satır ve şapkayla (^) gösterir."""
        lines = [f"JSON hatası (satır {self.line}, sütun {self.col}): {self.message}"]
        source = text.split("\n")
        if 1 <= self.line <= len(source):
            lines.append(f"{self.line:>4} | {source[self.line - 1]}")
            lines.append("     | " + " " * (self.col - 1) + "^")
        if self.hint:
            lines.append(f"İpucu: {self.hint}")
        return "\n".join(lines)


@dataclass(frozen=True)
class Options:
    max_depth: int = 400
    max_number_length: int = 1000
    allow_lone_surrogates: bool = False  # True: Python json gibi eşi olmayan vekili kabul et
    reject_duplicate_keys: bool = False  # True: aynı anahtar iki kez geçerse hata


def position(text: str, index: int) -> tuple[int, int]:
    line = text.count("\n", 0, index) + 1
    return line, index - (text.rfind("\n", 0, index) + 1) + 1


class Parser:
    def __init__(self, text: str, options: Options) -> None:
        self.text = text
        self.n = len(text)
        self.i = 0
        self.opt = options

    def peek(self) -> str:
        return self.text[self.i] if self.i < self.n else ""

    def skip_ws(self) -> None:
        while self.i < self.n and self.text[self.i] in WHITESPACE:
            self.i += 1

    def parse(self) -> object:
        if self.text.startswith("\ufeff"):
            raise bom_error()
        self.skip_ws()
        value = self.value(0)
        self.skip_ws()
        if self.i < self.n:
            raise extra_data(self.i)
        return value

    def value(self, depth: int) -> object:
        c = self.peek()
        if c == "{":
            return self.object(depth + 1)
        if c == "[":
            return self.array(depth + 1)
        if c == '"':
            text, self.i = scan_string(self.text, self.i, True, self.opt.allow_lone_surrogates)
            return text
        if c == "-" or "0" <= c <= "9":
            number, self.i = scan_number(self.text, self.i, True, self.opt.max_number_length)
            return number
        if c in ("t", "f", "n"):
            literal, self.i = scan_literal(self.text, self.i, True)
            return literal
        raise unexpected_value(self.text, self.i)

    def open_container(self, depth: int) -> int:
        """Açılış ayracını geçer; konumunu döndürür (satır/sütun yalnız hata anında hesaplanır)."""
        if depth > self.opt.max_depth:
            raise too_deep(self.opt.max_depth, self.i)
        opened = self.i
        self.i += 1
        self.skip_ws()
        return opened

    def unclosed(self, kind: str, opened: int) -> ScanError:
        return unclosed(kind, self.i, position(self.text, opened))

    def array(self, depth: int) -> list[object]:
        opened = self.open_container(depth)
        items: list[object] = []
        if self.peek() == "]":
            self.i += 1
            return items
        while True:
            if self.i >= self.n:
                raise self.unclosed("dizi", opened)
            items.append(self.value(depth))
            self.skip_ws()
            c = self.peek()
            if c == "]":
                self.i += 1
                return items
            if c != ",":
                if c == "":
                    raise self.unclosed("dizi", opened)
                raise after_item("dizi", c, self.i)
            self.i += 1
            self.skip_ws()
            if self.peek() == "]":
                raise trailing_comma("]", self.i)

    def object(self, depth: int) -> dict[str, object]:
        opened = self.open_container(depth)
        result: dict[str, object] = {}
        if self.peek() == "}":
            self.i += 1
            return result
        while True:
            c = self.peek()
            if c == "":
                raise self.unclosed("nesne", opened)
            if c != '"':
                raise expected_key(c, self.i)
            key_at = self.i
            key, self.i = scan_string(self.text, self.i, True, self.opt.allow_lone_surrogates)
            self.skip_ws()
            c = self.peek()
            if c != ":":
                if c == "":
                    raise self.unclosed("nesne", opened)
                raise expected_colon(c, self.i)
            self.i += 1
            self.skip_ws()
            if self.i >= self.n:
                raise self.unclosed("nesne", opened)
            if self.opt.reject_duplicate_keys and key in result:
                raise duplicate_key(key, key_at)
            result[key] = self.value(depth)
            self.skip_ws()
            c = self.peek()
            if c == "}":
                self.i += 1
                return result
            if c != ",":
                if c == "":
                    raise self.unclosed("nesne", opened)
                raise after_item("nesne", c, self.i)
            self.i += 1
            self.skip_ws()
            if self.peek() == "}":
                raise trailing_comma("}", self.i)


def loads(text: str, options: Options | None = None) -> object:
    """JSON metnini Python değerine çevirir; hatada `JsonError` (satır/sütunlu) fırlatır."""
    parser = Parser(text, options or Options())
    try:
        return parser.parse()
    except ScanError as err:
        line, col = position(text, err.index)
        raise JsonError(err.message, line, col, err.hint) from None


def loads_bytes(data: bytes, options: Options | None = None) -> object:
    """UTF-8 baytları ayrıştırır (RFC 8259 §8.1); baştaki BOM yok sayılır."""
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as err:
        prefix = data[: err.start].decode("utf-8", errors="replace")
        line, col = position(prefix + "?", len(prefix))
        raise JsonError(f"geçersiz UTF-8 baytı (bayt {err.start})", line, col) from None
    return loads(text, options)
