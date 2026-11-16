"""CSV okuma/yazma (yalnız standart kütüphane): Türkçe Excel dışa aktarımlarını tanır.

Türkçe Excel "CSV (noktalı virgülle ayrılmış)" kaydettiğinde: ayırıcı `;`, ondalık işareti
virgül (`12,5`), binlik ayırıcı nokta (`1.234,56`), dosya başında çoğu zaman UTF-8 BOM vardır;
eski sürümler dosyayı Windows Türkçe kodlamasıyla (cp1254) yazar. Bu dosya hepsini sezer:

  kodlama   BOM → utf-8-sig; değilse UTF-8 denenir; olmazsa cp1254
  ayırıcı   ; , sekme | adayları arasından satırlara en tutarlı bölünen
  ondalık   ayırıcı virgülse nokta; değilse sayı görünümlü hücrelerde "rakam,rakam" çoğunluksa
            virgül
  eksik     boş hücre, NA, N/A, NaN, null, None, #N/A, -, ? (büyük/küçük harf duyarsız)

Tamamı sayıya çevrilebilen sütunlar float (eksik = NaN), diğerleri metin (eksik = None) olur.
Bütün hücreleri boş satırlar (Excel'in bıraktığı `;;;` artıkları) atlanır.
Genişletme: yeni bir eksik değer işareti için `MISSING_TOKENS`'a ekleyin.
"""

from __future__ import annotations

import csv
import io
import math
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from ml_temel.ortak.table import Table
from ml_temel.ortak.turkish import lower_ascii
from ml_temel.tablo.messages import t

MISSING_TOKENS = frozenset({"", "na", "n/a", "nan", "null", "none", "#n/a", "-", "?"})
_DELIMITERS = (";", ",", "\t", "|")
_COMMA_DECIMAL = re.compile(r"^[+-]?(\d{1,3}(\.\d{3})+|\d+),\d+$")
_DOT_DECIMAL = re.compile(r"^[+-]?(\d{1,3}(,\d{3})+|\d+)\.\d+$")
_DOT_THOUSANDS = re.compile(r"^[+-]?\d{1,3}(\.\d{3})+$")  # "1.234": binlik mi ondalık mı belirsiz
# Geçerli sayı kalıpları (ondalık işaretine göre). Binlik ayırıcı yalnız 3'lü gruplarla kabul
# edilir; böylece "04.07.2023" gibi tarihler sayı sanılmaz.
_NUMBER_PATTERNS = {
    ",": re.compile(r"^[+-]?(\d{1,3}(\.\d{3})+|\d+)?(,\d+)?([eE][+-]?\d+)?$"),
    ".": re.compile(r"^[+-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][+-]?\d+)?$"),
}


@dataclass(frozen=True)
class CsvFormat:
    """Bir CSV dosyasının biçimi (okurken sezilir, tahmin dosyası aynı biçimde yazılır)."""

    encoding: str = "utf-8"
    delimiter: str = ","
    decimal: str = "."

    def describe(self) -> str:
        names = {";": "noktalı virgül", ",": "virgül", "\t": "sekme", "|": "dikey çizgi"}
        return (
            f"kodlama {self.encoding}, ayırıcı {names.get(self.delimiter, self.delimiter)}, "
            f"ondalık '{self.decimal}'"
        )


def decode_bytes(raw: bytes) -> tuple[str, str]:
    """(metin, kodlama adı)."""
    if raw.startswith(b"\xef\xbb\xbf"):
        return raw[3:].decode("utf-8"), "utf-8-sig"
    try:
        return raw.decode("utf-8"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1254", errors="replace"), "cp1254"


def detect_delimiter(text: str) -> str:
    """İlk satırlarda en çok ve en tutarlı sütun üreten ayırıcı."""
    sample = "\n".join(line for line in text.splitlines()[:30] if line.strip())
    best, best_score = ",", -1.0
    for candidate in _DELIMITERS:
        rows = list(csv.reader(io.StringIO(sample), delimiter=candidate))
        widths = [len(row) for row in rows if row]
        if not widths or max(widths) < 2:
            continue
        consistency = widths.count(widths[0]) / len(widths)
        score = consistency * 100 + widths[0]
        if score > best_score:
            best, best_score = candidate, score
    return best


def detect_decimal(rows: Sequence[Sequence[str]], delimiter: str) -> str:
    """Ondalık işaretini sezer (ayırıcı virgülse ondalık hep noktadır).

    "1.234" gibi değerler belirsizdir (Türkçede bin iki yüz otuz dört, İngilizcede bir virgül
    iki…); oylamaya girmez. Eşitlikte `;` ayırıcılı dosyada (Türkçe Excel) virgül seçilir.
    """
    if delimiter == ",":
        return "."
    comma = dot = 0
    for row in rows[:500]:
        for cell in row:
            value = cell.strip()
            if _COMMA_DECIMAL.match(value):
                comma += 1
            elif _DOT_DECIMAL.match(value) and not _DOT_THOUSANDS.match(value):
                dot += 1
    if comma == dot:
        return "," if delimiter == ";" else "."
    return "," if comma > dot else "."


def is_missing_token(cell: str) -> bool:
    return lower_ascii(cell.strip()) in MISSING_TOKENS


def parse_number(cell: str, decimal: str) -> float | None:
    """Hücreyi sayıya çevirir; çevrilemezse None. Binlik ayırıcıları atar ("1.234,5" → 1234.5)."""
    value = cell.strip().replace("\u00a0", "").replace(" ", "")
    if not any(char.isdigit() for char in value) or not _NUMBER_PATTERNS[decimal].match(value):
        return None
    if decimal == ",":
        value = value.replace(".", "").replace(",", ".")
    else:
        value = value.replace(",", "")
    try:
        number = float(value)
    except ValueError:
        return None
    return number if math.isfinite(number) else None


def _unique_names(header: Sequence[str]) -> list[str]:
    names: list[str] = []
    for position, raw in enumerate(header):
        base = raw.strip().lstrip("\ufeff") or f"sutun_{position + 1}"
        name, suffix = base, 2
        while name in names:
            name, suffix = f"{base}_{suffix}", suffix + 1
        names.append(name)
    return names


def _column(cells: list[str], decimal: str) -> Any:
    """Sütunu sayısal (float, NaN) ya da metin (object, None) diziye çevirir."""
    present = [cell for cell in cells if not is_missing_token(cell)]
    numbers = [parse_number(cell, decimal) for cell in present]
    if present and all(number is not None for number in numbers):
        iterator = iter(numbers)
        return np.array(
            [math.nan if is_missing_token(c) else next(iterator) for c in cells], dtype=np.float64
        )
    values = np.empty(len(cells), dtype=object)
    values[:] = [None if is_missing_token(cell) else cell.strip() for cell in cells]
    return values


def read_csv(
    path: str | Path, *, delimiter: str | None = None, decimal: str | None = None
) -> tuple[Table, CsvFormat]:
    """CSV dosyasını `Table` olarak okur ve sezilen biçimi döndürür."""
    source = Path(path)
    text, encoding = decode_bytes(source.read_bytes())
    sep = delimiter or detect_delimiter(text)
    rows = [
        row for row in csv.reader(io.StringIO(text), delimiter=sep) if any(c.strip() for c in row)
    ]
    if len(rows) < 2:
        raise ValueError(t("csv_bos", yol=source))
    header, body = _unique_names(rows[0]), rows[1:]
    for number, row in enumerate(body, start=2):
        if len(row) > len(header):
            raise ValueError(t("csv_fazla_hucre", satir=number, hucre=len(row), baslik=len(header)))
    padded = [row + [""] * (len(header) - len(row)) for row in body]
    mark = decimal or detect_decimal(padded, sep)
    columns = {name: _column([row[j] for row in padded], mark) for j, name in enumerate(header)}
    return Table(columns), CsvFormat(encoding=encoding, delimiter=sep, decimal=mark)


def format_cell(value: Any, decimal: str) -> str:
    """Bir hücreyi CSV'ye yazılacak metne çevirir (sayılarda ondalık işaretine uyar)."""
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    if isinstance(value, (float, np.floating)):
        text = f"{float(value):.10g}"
        return text.replace(".", ",") if decimal == "," else text
    return str(value)


def write_csv(table: Table, path: str | Path, fmt: CsvFormat) -> Path:
    """Tabloyu verilen biçimde yazar (Türkçe Excel'in açabilmesi için BOM ve `;` korunur)."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    encoding = "utf-8-sig" if fmt.encoding == "utf-8-sig" else fmt.encoding
    with target.open("w", encoding=encoding, newline="") as handle:
        writer = csv.writer(handle, delimiter=fmt.delimiter)
        writer.writerow(table.names)
        columns = [table[name].tolist() for name in table.names]
        for row in zip(*columns, strict=True):
            writer.writerow([format_cell(value, fmt.decimal) for value in row])
    return target
