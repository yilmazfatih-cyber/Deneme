"""Markdown → güvenli HTML (CommonMark'a yakın + GFM tablo, görev listesi, üstü çizili).

Hızlı kullanım:
    >>> from markdown import to_html
    >>> to_html("# Merhaba *dünya*")
    '<h1 id="merhaba-dunya">Merhaba <em>dünya</em></h1>\\n'

Boru hattı: blocks.py (satırlar → blok ağacı) → inline.py + delimiters.py (satır içi biçim) →
render.py (HTML, başlık kimlikleri, içindekiler). Güvenlik: safety.py (ham HTML kaçışlanır,
`javascript:` bağlantıları elenir). Sapmalar ve sınırlar: README.md.
Genişletme: README.md "Buradan nereye" bölümüne bakın.
"""

from __future__ import annotations

from dataclasses import dataclass

from .blocks import parse_blocks
from .render import Highlighter, Renderer
from .slug import TocEntry, render_toc, slugify

__all__ = ["Result", "TocEntry", "convert", "slugify", "to_html"]


@dataclass
class Result:
    html: str
    toc: list[TocEntry]


def convert(text: str, highlight: Highlighter | None = None) -> Result:
    """Markdown metnini HTML'e çevirir; içindekiler listesini de döndürür.

    Belgede tek başına `[TOC]` ya da `[[içindekiler]]` satırı varsa oraya içindekiler yerleşir.
    """
    lines = text.replace("\r\n", "\n").replace("\r", "\n").replace("\0", "�").split("\n")
    renderer = Renderer(highlight=highlight)
    html = renderer.document(parse_blocks(lines))
    if "\0TOC\0" in html:
        html = html.replace("\0TOC\0", render_toc(renderer.toc))
    return Result(html, renderer.toc)


def to_html(text: str, highlight: Highlighter | None = None) -> str:
    """Markdown metnini güvenli HTML'e çevirir."""
    return convert(text, highlight).html
