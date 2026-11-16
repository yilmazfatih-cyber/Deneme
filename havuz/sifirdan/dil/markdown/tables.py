"""GFM tabloları: başlık satırı + hizalama satırı (`|:--|:-:|--:|`) + gövde satırları.

Hücreler kaçışsız `|` ile bölünür; `\\|` hücre içinde düz `|` olur. Başlık ile hizalama
satırının hücre sayısı eşit olmalıdır (değilse tablo değil, paragraftır). Gövdede eksik hücre
boş, fazlası atılır.
Genişletme: hücre birleştirme gibi bir uzantı için `split_row` ve `render_table`'ı birlikte
değiştirin.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass

DELIMITER_CELL = re.compile(r"^:?-+:?$")


@dataclass
class Table:
    header: list[str]
    align: list[str]  # "", "left", "center", "right"
    rows: list[list[str]]


def split_row(line: str) -> list[str]:
    text = line.strip()
    if text.startswith("|"):
        text = text[1:]
    if text.endswith("|") and not text.endswith("\\|"):
        text = text[:-1]
    cells: list[str] = []
    current: list[str] = []
    i = 0
    while i < len(text):
        if text[i] == "\\" and text[i + 1 : i + 2] == "|":
            current.append("|")
            i += 2
            continue
        if text[i] == "|":
            cells.append("".join(current).strip())
            current = []
        else:
            current.append(text[i])
        i += 1
    cells.append("".join(current).strip())
    return cells


def alignment(cell: str) -> str:
    left, right = cell.startswith(":"), cell.endswith(":")
    return "center" if left and right else "left" if left else "right" if right else ""


def parse_table(lines: list[str], i: int) -> tuple[Table, int] | None:
    """`lines[i]` bir tablonun başlık satırıysa (tablo, sonraki satır) döndürür; değilse None."""
    if i + 1 >= len(lines) or "|" not in lines[i]:
        return None
    header, delimiter = split_row(lines[i]), split_row(lines[i + 1])
    if len(header) != len(delimiter) or not all(DELIMITER_CELL.match(c) for c in delimiter):
        return None
    if "|" not in lines[i + 1] and len(header) == 1:
        return None  # "a\n---" bir Setext başlığıdır, tablo değil
    rows: list[list[str]] = []
    j = i + 2
    while j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith(("#", ">")):
        cells = split_row(lines[j])
        rows.append((cells + [""] * len(header))[: len(header)])
        j += 1
    return Table(header, [alignment(c) for c in delimiter], rows), j


def render_table(table: Table, inline: Callable[[str], str]) -> str:
    def row(cells: list[str], tag: str) -> str:
        parts = []
        for cell, align in zip(cells, table.align, strict=True):
            attr = f' align="{align}"' if align else ""
            parts.append(f"<{tag}{attr}>{inline(cell)}</{tag}>")
        return "<tr>\n" + "\n".join(parts) + "\n</tr>"

    out = ["<table>", "<thead>", row(table.header, "th"), "</thead>"]
    if table.rows:
        out += ["<tbody>", *(row(r, "td") for r in table.rows), "</tbody>"]
    out.append("</table>")
    return "\n".join(out) + "\n"
