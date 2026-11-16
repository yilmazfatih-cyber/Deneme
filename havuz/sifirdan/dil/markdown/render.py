"""HTML üretici: blok ağacını (blocks.py) CommonMark'a yakın biçimde HTML'e çevirir.

Başlıklara kimlik verilir (slug.py; Türkçe harfler ASCII'ye) ve içindekiler listesi toplanır.
Sıkı listelerde paragraflar `<p>` içine alınmaz. Kod blokları kaçışlanır; dil bilgisi
`class="language-…"` olur. İsteğe bağlı `highlight(dil, kod) -> html` kancası verilebilir
(dönüşü güvenilir sayılır; kancayı yazan kaçıştan sorumludur).
Genişletme: yeni blok türü için `block_html` içine bir `case` ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

from .blocks import Block, CodeBlock, Heading, ListBlock, Paragraph, Quote, Rule
from .inline import render_inline
from .safety import escape_html
from .slug import SlugRegistry, TocEntry, plain_text
from .tables import Table, render_table

Highlighter = Callable[[str, str], str]
TOC_MARKERS = ("[TOC]", "[[içindekiler]]", "[[icindekiler]]")


@dataclass
class Renderer:
    highlight: Highlighter | None = None
    slugs: SlugRegistry = field(default_factory=SlugRegistry)
    toc: list[TocEntry] = field(default_factory=list)

    def document(self, blocks: list[Block]) -> str:
        return "".join(self.block_html(b, tight=False) for b in blocks)

    def block_html(self, block: Block, tight: bool) -> str:
        match block:
            case Heading(level=level, text=text):
                inner = render_inline(text)
                ident = self.slugs.unique(plain_text(inner))
                self.toc.append(TocEntry(level, plain_text(inner), ident))
                return f'<h{level} id="{ident}">{inner}</h{level}>\n'
            case Paragraph(text=text):
                if text.strip() in TOC_MARKERS:
                    return "\0TOC\0"  # belge bitince içindekilerle değiştirilir
                inner = render_inline(text)
                return f"{inner}\n" if tight else f"<p>{inner}</p>\n"
            case CodeBlock(info=info, code=code):
                css = f' class="language-{escape_html(info)}"' if info else ""
                body = self.highlight(info, code) if self.highlight and info else escape_html(code)
                return f"<pre><code{css}>{body}</code></pre>\n"
            case Quote(children=children):
                inner = "".join(self.block_html(c, tight=False) for c in children)
                return f"<blockquote>\n{inner}</blockquote>\n"
            case ListBlock():
                return self.list_html(block)
            case Rule():
                return "<hr />\n"
            case Table():
                return render_table(block, render_inline)
        raise TypeError(f"bilinmeyen blok: {block!r}")

    def list_html(self, block: ListBlock) -> str:
        tag = "ol" if block.ordered else "ul"
        start = f' start="{block.start}"' if block.ordered and block.start != 1 else ""
        out = [f"<{tag}{start}>\n"]
        for item in block.items:
            box = ""
            if item.checked is not None:
                checked = ' checked=""' if item.checked else ""
                box = f'<input type="checkbox" disabled=""{checked} /> '
            inner = "".join(self.block_html(c, block.tight) for c in item.children)
            children = item.children
            if block.tight:
                # Sıkı liste: paragraf <p>'siz; son çocuk paragrafsa </li> öncesi satır sonu yok.
                if children and isinstance(children[-1], Paragraph):
                    inner = inner[:-1]
                lead = "\n" if children and not isinstance(children[0], Paragraph) else ""
                out.append(f"<li>{box}{lead}{inner}</li>\n")
            else:
                out.append(f"<li>\n{box}{inner}</li>\n")
        out.append(f"</{tag}>\n")
        return "".join(out)
