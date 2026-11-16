"""Blok ayrıştırıcı: Markdown satırlarını blok ağacına (başlık, paragraf, liste, alıntı…) çevirir.

Satır satır ilerler; alıntı ve liste öğelerinin içeriği girintisi/`>` işareti soyulup yeniden
`parse_blocks` ile ayrıştırılır (iç içe yapılar böyle kurulur, derinlik sınırlıdır). Desteklenen:
ATX (`#`) ve Setext (`===`, `---`) başlıklar, paragraflar, kod çitleri (``` ve ~~~) ve girintili
kod, alıntı, sıralı/sırasız/iç içe listeler (sıkı/gevşek), görev listeleri, yatay çizgi, GFM
tabloları (tables.py). Satır içi biçim burada ÇÖZÜLMEZ (inline.py).
Genişletme: yeni blok türü için dataclass + `Block` birleşimi + `parse_blocks` içinde bir dal.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from .tables import Table, parse_table

FENCE = re.compile(r"^( {0,3})(`{3,}|~{3,})(.*)$")
ATX = re.compile(r"^ {0,3}(#{1,6})(?=[ \t]|$)(.*)$")
RULE = re.compile(r"^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$")
QUOTE = re.compile(r"^ {0,3}> ?(.*)$")
SETEXT = re.compile(r"^ {0,3}(=+|-+)[ \t]*$")
MARKER = re.compile(r"^( {0,3})([-+*]|\d{1,9}[.)])(?=[ \t]|$)")
TASK = re.compile(r"^\[([ xX])\][ \t]+")
MAX_DEPTH = 40  # iç içe alıntı/liste sınırı (kötü niyetli girdi yığını taşırmasın)


@dataclass
class Heading:
    level: int
    text: str


@dataclass
class Paragraph:
    text: str


@dataclass
class CodeBlock:
    info: str
    code: str


@dataclass
class Quote:
    children: list[Block]


@dataclass
class ListItem:
    children: list[Block]
    checked: bool | None = None  # görev listesi: None değilse onay kutusu


@dataclass
class ListBlock:
    ordered: bool
    start: int
    tight: bool
    items: list[ListItem] = field(default_factory=list)


@dataclass
class Rule:
    pass


Block = Heading | Paragraph | CodeBlock | Quote | ListBlock | Rule | Table


@dataclass
class Marker:
    kind: str  # "-", "+", "*", "." ya da ")"
    ordered: bool
    start: int
    width: int  # öğe içeriğinin başladığı sütun
    rest: str  # işaretten sonraki içerik


def expand_indent(line: str) -> str:
    """Baştaki sekmeleri 4'lük durak boşluklarına çevirir (içerikteki sekmelere dokunmaz)."""
    out, col = [], 0
    for i, ch in enumerate(line):
        if ch == " ":
            out.append(" ")
            col += 1
        elif ch == "\t":
            out.append(" " * (4 - col % 4))
            col += 4 - col % 4
        else:
            return "".join(out) + line[i:]
    return "".join(out)


def indent_of(line: str) -> int:
    return len(line) - len(line.lstrip(" "))


def blank(line: str) -> bool:
    return line.strip() == ""


def marker(line: str) -> Marker | None:
    m = MARKER.match(line)
    if m is None or RULE.match(line):
        return None
    token = m.group(2)
    raw = line[m.end() :]
    stripped = raw.lstrip(" \t")
    # İşaretten sonraki sekmeler sütuna göre 4'lük durağa açılır ("-\tmadde" = "-   madde").
    col, pad = m.end(), 0
    for ch in raw[: len(raw) - len(stripped)]:
        step = 1 if ch == " " else 4 - (col + pad) % 4
        pad += step
    after = " " * pad + stripped
    spaces = indent_of(after)
    if blank(after):
        width, rest = m.end() + 1, ""
    elif spaces > 4:  # öğe içinde girintili kod: işaretten sonra tek boşluk sayılır
        width, rest = m.end() + 1, after[1:]
    else:
        width, rest = m.end() + spaces, after[spaces:]
    ordered = token[0].isdigit()
    kind = token[-1] if ordered else token
    return Marker(kind, ordered, int(token[:-1]) if ordered else 1, width, rest)


def starts_block(line: str, in_paragraph: bool) -> bool:
    """Bu satır yeni bir blok başlatır mı? (paragrafı bölebilir mi?)"""
    if FENCE.match(line) or ATX.match(line) or RULE.match(line) or QUOTE.match(line):
        return True
    mk = marker(line)
    if mk is None:
        return False
    # Paragrafı yalnız boş olmayan ve (madde ya da 1'den başlayan sıralı) liste bölebilir.
    return not in_paragraph or (bool(mk.rest.strip()) and (not mk.ordered or mk.start == 1))


def parse_blocks(lines: list[str], depth: int = 0) -> list[Block]:
    lines = [expand_indent(line) for line in lines]
    blocks: list[Block] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if blank(line):
            i += 1
        elif fence := FENCE.match(line):
            i = fenced_code(lines, i, fence, blocks)
        elif atx := ATX.match(line):
            blocks.append(Heading(len(atx.group(1)), atx_text(atx.group(2))))
            i += 1
        elif RULE.match(line):
            blocks.append(Rule())
            i += 1
        elif QUOTE.match(line) and depth < MAX_DEPTH:
            i = blockquote(lines, i, blocks, depth)
        elif marker(line) is not None and depth < MAX_DEPTH:
            i = list_block(lines, i, blocks, depth)
        elif indent_of(line) >= 4:
            i = indented_code(lines, i, blocks)
        elif (table := parse_table(lines, i)) is not None:
            blocks.append(table[0])
            i = table[1]
        else:
            i = paragraph(lines, i, blocks)
    return blocks


def atx_text(raw: str) -> str:
    text = raw.strip(" \t")
    closing = re.search(r"(^|[ \t])#+$", text)
    return text[: closing.start()].rstrip(" \t") if closing else text


def fenced_code(lines: list[str], i: int, fence: re.Match[str], blocks: list[Block]) -> int:
    indent, ticks, info = len(fence.group(1)), fence.group(2), fence.group(3).strip()
    if ticks[0] == "`" and "`" in info:  # ``` çitinin bilgi dizgisinde ` olamaz: satır içi kod
        return paragraph(lines, i, blocks)
    body: list[str] = []
    i += 1
    closer = re.compile(rf"^ {{0,3}}{re.escape(ticks[0])}{{{len(ticks)},}}[ \t]*$")
    while i < len(lines) and not closer.match(lines[i]):
        body.append(lines[i][min(indent, indent_of(lines[i])) :])
        i += 1
    blocks.append(CodeBlock(info.split()[0] if info else "", "".join(b + "\n" for b in body)))
    return i + 1


def indented_code(lines: list[str], i: int, blocks: list[Block]) -> int:
    body: list[str] = []
    while i < len(lines) and (blank(lines[i]) or indent_of(lines[i]) >= 4):
        body.append(lines[i][4:] if not blank(lines[i]) else "")
        i += 1
    while body and body[-1] == "":
        body.pop()
    blocks.append(CodeBlock("", "".join(b + "\n" for b in body)))
    return i


def paragraph(lines: list[str], i: int, blocks: list[Block]) -> int:
    # Satır başı boşlukları atılır; satır SONU boşlukları kalır (iki boşluk = satır kırma).
    text = [lines[i].lstrip()]
    i += 1
    while i < len(lines) and not blank(lines[i]):
        line = lines[i]
        setext = SETEXT.match(line)
        if setext:
            level = 1 if setext.group(1)[0] == "=" else 2
            blocks.append(Heading(level, "\n".join(text).strip()))
            return i + 1
        if starts_block(line, in_paragraph=True):
            break
        text.append(line.lstrip())
        i += 1
    blocks.append(Paragraph("\n".join(text).rstrip()))
    return i


def blockquote(lines: list[str], i: int, blocks: list[Block], depth: int) -> int:
    inner: list[str] = []
    while i < len(lines):
        quoted = QUOTE.match(lines[i])
        if quoted:
            inner.append(quoted.group(1))
        elif inner and not blank(inner[-1]) and not blank(lines[i]):
            if starts_block(lines[i], in_paragraph=True):
                break
            inner.append(lines[i])  # tembel devam satırı: paragraf alıntı içinde sürer
        else:
            break
        i += 1
    blocks.append(Quote(parse_blocks(inner, depth + 1)))
    return i


def list_block(lines: list[str], i: int, blocks: list[Block], depth: int) -> int:
    first = marker(lines[i])
    assert first is not None
    result = ListBlock(first.ordered, first.start, tight=True)
    while i < len(lines):
        mk = marker(lines[i])
        if mk is None or mk.kind != first.kind:
            break
        body, i = list_item_lines(lines, i, mk)
        trailing = 0
        while body and blank(body[-1]):
            body.pop()
            trailing += 1
        next_mk = marker(lines[i]) if i < len(lines) else None
        if trailing and next_mk is not None and next_mk.kind == first.kind:
            result.tight = False  # öğeler arasında boş satır
        if any(blank(b) for b in body) and blank_between_children(body):
            result.tight = False
        result.items.append(list_item(body, depth))
        if trailing and (next_mk is None or next_mk.kind != first.kind):
            break
    blocks.append(result)
    return i


def list_item_lines(lines: list[str], i: int, mk: Marker) -> tuple[list[str], int]:
    body = [mk.rest]
    i += 1
    while i < len(lines):
        line = lines[i]
        if blank(line):
            body.append("")
        elif indent_of(line) >= mk.width:
            body.append(line[mk.width :])
        elif marker(line) is not None:
            break  # daha az girintili liste işareti: bu öğe bitti (kardeş ya da yeni liste)
        elif body[-1].strip() and not starts_block(line, in_paragraph=True):
            body.append(line.strip())  # tembel devam satırı
        else:
            break
        i += 1
    return body, i


def blank_between_children(body: list[str]) -> bool:
    """Öğenin DOĞRUDAN alt blokları arasında boş satır var mı (gevşek liste kuralı)?"""
    for n in range(1, len(body) - 1):
        if blank(body[n]) and not blank(body[n - 1]) and indent_of(body[n + 1]) == 0:
            if not blank(body[n + 1]) and not FENCE.match(body[0]):
                return True
    return False


def list_item(body: list[str], depth: int) -> ListItem:
    checked: bool | None = None
    if body and (task := TASK.match(body[0])):
        checked = task.group(1) != " "
        body = [body[0][task.end() :], *body[1:]]
    return ListItem(parse_blocks(body, depth + 1), checked)
