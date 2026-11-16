"""csv — RFC 4180 CSV ayrıştırıcı ve yazıcı; Türkçe Excel uyumu (";" ayırıcı, ondalık virgül, UTF-8 BOM, CRLF),
formül enjeksiyonuna karşı koruma, parça parça (akışla) ayrıştırma. TypeScript eşiyle birebir aynı kurallar.

Kullanım:
    parse_csv("ad;yaş\r\nAyşe;30")                     # [["ad", "yaş"], ["Ayşe", "30"]]  (ayırıcı kendiliğinden)
    parse_csv_objects("ad,yaş\nAli,40")                # [{"ad": "Ali", "yaş": "40"}]
    to_excel_csv([["Ürün", "Fiyat"], ["Çay", 12.5]])    # "\ufeffÜrün;Fiyat\r\nÇay;12,5\r\n"  (Excel TR açar)
    with open(yol, encoding="utf-8", newline="") as f:
        for satir in iter_csv(f): ...                   # akış: dosya bellekte toplanmaz

Kurallar: Alan çift tırnakla başlıyorsa tırnaklıdır; içinde "" bir tırnaktır; ayırıcı ve satır sonu tırnak içinde
veri sayılır. Satır sonu CRLF, LF ya da CR olabilir. Baştaki BOM atılır. Boş satırlar varsayılan olarak atlanır.
Kapanmamış tırnak her zaman hata verir. `strict=True` iken tırnaksız alanda tırnak ve kapanış tırnağından sonra
karakter de hata verir. Yazarken ayırıcı, tırnak, satır sonu ya da baş/son boşluk içeren alan tırnaklanır.
`escape_formulas` → = + - @ ile başlayan METİN hücrelerinin başına ' konur (CSV/formül enjeksiyonu; OWASP).

Sınırlar: Tür dönüşümü yapılmaz; her alan metindir (sayı için sayi_yazi.parse_number_tr). Ayırıcı kendiliğinden
bulunurken yalnız İLK satıra bakılır. Dosyayı `newline=""` ile açın (yoksa Python satır sonlarını değiştirir).
Bu modülün adı standart kütüphanedeki `csv` ile aynıdır; projenize kopyalarken paket içine koyun
(`from benim_paketim import csv as csv_tr`) ya da dosya adını değiştirin.

Genişletme: Yeni seçenek `CsvParser.__init__`'e eklenir, `_consume` içinde tek yerde uygulanır; TypeScript eşine
(ts/src/csv.ts) aynı adla eklenir ve `vektorler/csv.json`'a örnek yazılır.
"""

from __future__ import annotations

import re
from collections.abc import Iterable, Iterator, Sequence
from datetime import date, datetime

__all__ = [
    "CsvError",
    "CsvParser",
    "detect_delimiter",
    "iter_csv",
    "parse_csv",
    "parse_csv_objects",
    "parse_excel_csv",
    "to_csv",
    "to_excel_csv",
]

_CANDIDATES = (",", ";", "\t", "|")
_BOM = "\N{ZERO WIDTH NO-BREAK SPACE}"

CsvCell = str | int | float | bool | None | date | datetime


class CsvError(ValueError):
    """CSV bozuk (kapanmamış tırnak, fazla alan…) ya da yazılamayan değer."""


def detect_delimiter(text: str) -> str:
    """İlk satırda (tırnak dışında) en çok geçen ayırıcıyı bulur; eşitlikte , ; sekme | sırası, yoksa ","."""
    counts = dict.fromkeys(_CANDIDATES, 0)
    in_quotes = False
    for ch in text.removeprefix(_BOM):
        if ch == '"':
            in_quotes = not in_quotes
        elif not in_quotes and ch in "\r\n":
            break
        elif not in_quotes and ch in counts:
            counts[ch] += 1
    best, best_count = ",", 0
    for candidate in _CANDIDATES:
        if counts[candidate] > best_count:
            best, best_count = candidate, counts[candidate]
    return best


class CsvParser:
    """Parça parça CSV ayrıştırıcı: `push` tamamlanan satırları, `end` kalanları döndürür."""

    def __init__(
        self, *, delimiter: str = "auto", skip_empty_lines: bool = True, strict: bool = False
    ) -> None:
        if delimiter != "auto" and (len(delimiter) != 1 or delimiter in '"\r\n'):
            raise CsvError("Ayırıcı tek karakter olmalı ve tırnak ya da satır sonu olamaz.")
        self._delimiter: str | None = None if delimiter == "auto" else delimiter
        self._skip_empty = skip_empty_lines
        self._strict = strict
        self._pending = ""
        self._started = False
        self._field: list[str] = []
        self._row: list[str] = []
        self._row_has_content = False
        self._field_quoted = False
        self._in_quotes = False
        self._quote_seen = False
        self._after_quoted = False
        self._pending_cr = False
        self._line = 1
        self._quote_line = 1
        self._out: list[list[str]] = []

    def _end_field(self) -> None:
        self._row.append("".join(self._field))
        self._field = []
        self._field_quoted = False
        self._after_quoted = False

    def _end_row(self) -> None:
        quoted_empty = self._field_quoted
        self._end_field()
        empty = len(self._row) == 1 and self._row[0] == "" and not quoted_empty
        if not (empty and self._skip_empty):
            self._out.append(self._row)
        self._row = []
        self._row_has_content = False
        self._line += 1

    def _consume(self, text: str, delimiter: str) -> None:
        for ch in text:
            if not self._started:
                self._started = True
                if ch == _BOM:
                    continue
            if self._pending_cr:
                self._pending_cr = False
                if ch == "\n":
                    continue
            if self._in_quotes:
                if self._quote_seen:
                    self._quote_seen = False
                    if ch == '"':
                        self._field.append('"')
                        continue
                    self._in_quotes = False
                    self._after_quoted = True
                else:
                    if ch == '"':
                        self._quote_seen = True
                    else:
                        self._field.append(ch)
                        if ch == "\n":
                            self._line += 1
                    continue
            self._row_has_content = True
            if ch == delimiter:
                self._end_field()
            elif ch in "\r\n":
                self._end_row()
                self._pending_cr = ch == "\r"
            elif (
                ch == '"' and not self._field and not self._after_quoted and not self._field_quoted
            ):
                self._in_quotes = True
                self._field_quoted = True
                self._quote_line = self._line
            else:
                if self._strict and ch == '"':
                    raise CsvError(f"Satır {self._line}: tırnaksız alanda tırnak işareti var.")
                if self._strict and self._after_quoted:
                    raise CsvError(
                        f"Satır {self._line}: kapanış tırnağından sonra ayırıcı ya da satır sonu bekleniyordu."
                    )
                self._field.append(ch)

    def push(self, chunk: str) -> list[list[str]]:
        """Yeni parçayı işler; bu parçayla tamamlanan satırları döndürür."""
        if self._delimiter is None:
            self._pending += chunk
            in_quotes = False
            complete = False
            for ch in self._pending.removeprefix(_BOM):
                if ch == '"':
                    in_quotes = not in_quotes
                elif not in_quotes and ch in "\r\n":
                    complete = True
                    break
            if not complete:
                return []
            self._delimiter = detect_delimiter(self._pending)
            chunk, self._pending = self._pending, ""
        self._consume(chunk, self._delimiter)
        rows, self._out = self._out, []
        return rows

    def end(self) -> list[list[str]]:
        """Girdinin bittiğini bildirir; kalan satırı döndürür. Kapanmamış tırnak varsa CsvError."""
        if self._delimiter is None:
            self._delimiter = detect_delimiter(self._pending)
            self._consume(self._pending, self._delimiter)
            self._pending = ""
        if self._in_quotes and not self._quote_seen:
            raise CsvError(
                f'Satır {self._quote_line}: tırnak açılmış ama kapanmamış (alanın sonuna " ekleyin).'
            )
        if self._quote_seen:
            self._quote_seen = False
            self._in_quotes = False
            self._after_quoted = True
            self._row_has_content = True
        if self._row_has_content or self._field or self._row:
            self._end_row()
        rows, self._out = self._out, []
        return rows


def parse_csv(
    text: str, *, delimiter: str = "auto", skip_empty_lines: bool = True, strict: bool = False
) -> list[list[str]]:
    """Metnin tamamını ayrıştırır: satırlar × alanlar."""
    parser = CsvParser(delimiter=delimiter, skip_empty_lines=skip_empty_lines, strict=strict)
    return parser.push(text) + parser.end()


def parse_csv_objects(
    text: str, *, delimiter: str = "auto", skip_empty_lines: bool = True, strict: bool = False
) -> list[dict[str, str]]:
    """İlk satırı başlık sayar ve her satırı sözlüğe çevirir. Eksik alan "" olur; fazla alan ve yinelenen başlık hata."""
    rows = parse_csv(text, delimiter=delimiter, skip_empty_lines=skip_empty_lines, strict=strict)
    if not rows:
        return []
    header, *data = rows
    for i, name in enumerate(header):
        if name.strip() == "":
            raise CsvError(f"Başlıkta {i + 1}. sütunun adı boş; her sütuna bir ad verin.")
        if header.index(name) != i:
            raise CsvError(f'Başlıkta "{name}" sütunu birden çok kez geçiyor.')
    result: list[dict[str, str]] = []
    for r, row in enumerate(data):
        if len(row) > len(header):
            raise CsvError(
                f"Veri satırı {r + 1}: {len(row)} alan var, başlıkta {len(header)} sütun var."
            )
        result.append({name: row[i] if i < len(row) else "" for i, name in enumerate(header)})
    return result


def parse_excel_csv(
    text: str, *, skip_empty_lines: bool = True, strict: bool = False
) -> list[list[str]]:
    """Türkçe Excel'in kaydettiği CSV: ";" ayırıcı, BOM olabilir."""
    return parse_csv(text, delimiter=";", skip_empty_lines=skip_empty_lines, strict=strict)


def iter_csv(
    chunks: Iterable[str],
    *,
    delimiter: str = "auto",
    skip_empty_lines: bool = True,
    strict: bool = False,
) -> Iterator[list[str]]:
    """Parçalardan (ör. açık dosya, satır satır) ayrıştırır; satırları birer birer verir."""
    parser = CsvParser(delimiter=delimiter, skip_empty_lines=skip_empty_lines, strict=strict)
    for chunk in chunks:
        yield from parser.push(chunk)
    yield from parser.end()


def _plain_number(value: float) -> str:
    """Sayının üssüz ondalık yazımı: 1e21 → "1000000000000000000000", 1e-07 → "0.0000001"."""
    if value != value or value in (float("inf"), float("-inf")):
        raise CsvError(f"Sonlu olmayan sayı CSV'ye yazılamaz: {value}.")
    match = re.fullmatch(r"(-?)([0-9]+)(?:\.([0-9]+))?(?:e([+-]?[0-9]+))?", repr(value))
    if not match:
        return repr(value)
    digits = match.group(2) + (match.group(3) or "")
    point = len(match.group(2)) + int(match.group(4) or "0")
    padded = "0" * (1 - point) + digits if point <= 0 else digits.ljust(point, "0")
    at = 1 if point <= 0 else point
    integer = padded[:at].lstrip("0") or "0"
    fraction = padded[at:].rstrip("0")
    sign = "-" if match.group(1) == "-" and (integer + fraction).strip("0") else ""
    return sign + integer + ("." + fraction if fraction else "")


def _cell_text(value: CsvCell, decimal_comma: bool, escape_formulas: bool) -> str:
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        text = _plain_number(value)
        return text.replace(".", ",") if decimal_comma else text
    if isinstance(value, date | datetime):
        return value.isoformat()
    if escape_formulas and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def to_csv(
    rows: Sequence[Sequence[CsvCell]],
    *,
    delimiter: str = ",",
    line_ending: str = "\r\n",
    bom: bool = False,
    quote_all: bool = False,
    escape_formulas: bool = False,
    decimal_comma: bool = False,
) -> str:
    """Satırları CSV metnine çevirir (her satırın sonunda satır sonu vardır)."""
    lines: list[str] = []
    for row in rows:
        cells: list[str] = []
        for value in row:
            text = _cell_text(value, decimal_comma, escape_formulas)
            needs_quotes = (
                quote_all
                or delimiter in text
                or any(ch in text for ch in '"\r\n')
                or text.startswith(" ")
                or text.endswith(" ")
            )
            cells.append('"' + text.replace('"', '""') + '"' if needs_quotes else text)
        lines.append(delimiter.join(cells) + line_ending)
    return (_BOM if bom else "") + "".join(lines)


def to_excel_csv(rows: Sequence[Sequence[CsvCell]]) -> str:
    """Türkçe Excel'in doğrudan açacağı CSV: ";" ayırıcı, BOM, CRLF, ondalık virgül, formül koruması."""
    return to_csv(
        rows, delimiter=";", bom=True, line_ending="\r\n", decimal_comma=True, escape_formulas=True
    )
