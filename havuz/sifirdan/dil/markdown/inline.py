"""Satır içi ayrıştırıcı: vurgu, satır içi kod, bağlantı/görsel, otomatik bağlantı, satır kırma.

Metin soldan sağa taranır; düz metin kaçışlanarak, kod/bağlantı hazır HTML olarak, `* _ ~`
dizileri sınırlayıcı olarak çift bağlı listeye eklenir. `]` görülünce `[` açıcısı aranır ve
ardından `(adres "başlık")` geliyorsa bağlantı kurulur (içindeki vurgu önce çözülür). Sonda
vurgu çözülür (delimiters.py). Ham HTML yazılmaz, kaçışlanır; adresler safety.py'den geçer.
Desteklenmeyen: başvuru bağlantıları (`[metin][ad]`), çıplak URL bağlantılama.
Genişletme: yeni bir satır içi sözdizimi için `scan` döngüsüne bir dal ekleyin.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from .delimiters import InlineList, Node, flanking, process_emphasis
from .safety import escape_html, safe_url

ESCAPABLE = set("!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~")
ENTITY = re.compile(r"&(?:#[0-9]{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});")
AUTOLINK = re.compile(r"<([A-Za-z][A-Za-z0-9+.\-]{1,31}:[^\s<>]*)>")
EMAIL = re.compile(r"<([A-Za-z0-9.!#$%&'*+/=?^_`{|}~\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*)>")


@dataclass
class Bracket:
    node: Node
    image: bool
    bottom: Node | None  # açıldığı andaki sınırlayıcı yığını tepesi
    active: bool = True


class InlineParser:
    def __init__(self, text: str) -> None:
        self.src = text
        self.i = 0
        self.items = InlineList()
        self.brackets: list[Bracket] = []
        self.pending: list[str] = []  # birikmiş düz metin (kaçışlanmış)

    def flush(self) -> None:
        if self.pending:
            self.items.append(Node(html="".join(self.pending)))
            self.pending = []

    def add_html(self, html: str) -> None:
        self.flush()
        self.items.append(Node(html=html))

    def render(self) -> str:
        n = len(self.src)
        while self.i < n:
            self.scan(self.src[self.i])
        self.flush()
        process_emphasis(self.items, None)
        return self.items.render_after(self.items.head)

    def scan(self, c: str) -> None:
        src, i = self.src, self.i
        if c == "\\":
            nxt = src[i + 1 : i + 2]
            if nxt == "\n":
                self.add_html("<br />\n")
                self.i += 2
                self.skip_spaces()
            elif nxt in ESCAPABLE and nxt:
                self.pending.append(escape_html(nxt))
                self.i += 2
            else:
                self.pending.append("\\")
                self.i += 1
        elif c == "`":
            self.code_span()
        elif c in "*_~":
            self.delimiter_run(c)
        elif c == "!" and src[i + 1 : i + 2] == "[":
            self.open_bracket(image=True)
        elif c == "[":
            self.open_bracket(image=False)
        elif c == "]":
            self.close_bracket()
        elif c == "<":
            self.angle()
        elif c == "&":
            entity = ENTITY.match(src, i)
            self.pending.append(entity.group() if entity else "&amp;")
            self.i += len(entity.group()) if entity else 1
        elif c == "\n":
            self.line_break()
        else:
            end = i + 1
            while end < len(src) and src[end] not in "\\`*_~![]<&\n":
                end += 1
            self.pending.append(escape_html(src[i:end]))
            self.i = end

    def skip_spaces(self) -> None:
        while self.i < len(self.src) and self.src[self.i] == " ":
            self.i += 1

    def line_break(self) -> None:
        text = "".join(self.pending)
        hard = text.endswith("  ")
        self.pending = [text.rstrip(" ")]
        self.add_html("<br />\n" if hard else "\n")
        self.i += 1
        self.skip_spaces()

    def code_span(self) -> None:
        start = self.i
        run = len(self.src[start:]) - len(self.src[start:].lstrip("`"))
        ticks = "`" * run
        search = start + run
        while True:
            end = self.src.find(ticks, search)
            if end == -1:
                self.pending.append(ticks)  # eşi yok: düz metin
                self.i = start + run
                return
            after = end + run
            if self.src[after : after + 1] != "`" and self.src[end - 1 : end] != "`":
                break
            search = end + 1
            while self.src[search : search + 1] == "`":
                search += 1
        code = self.src[start + run : end].replace("\n", " ")
        if len(code) > 2 and code[0] == code[-1] == " " and code.strip(" "):
            code = code[1:-1]
        self.add_html(f"<code>{escape_html(code)}</code>")
        self.i = end + run

    def delimiter_run(self, c: str) -> None:
        start = self.i
        while self.i < len(self.src) and self.src[self.i] == c:
            self.i += 1
        count = self.i - start
        before = self.src[start - 1] if start > 0 else ""
        after = self.src[self.i] if self.i < len(self.src) else ""
        can_open, can_close = flanking(before, after, c)
        if c == "~" and count != 2:
            can_open = can_close = False  # yalnız ~~üstü çizili~~
        self.flush()
        self.items.append(
            Node(delim=c, count=count, length=count, can_open=can_open, can_close=can_close)
        )

    def open_bracket(self, image: bool) -> None:
        self.add_html("![" if image else "[")
        self.brackets.append(Bracket(self.items.tail, image, self.items.top))
        self.i += 2 if image else 1

    def close_bracket(self) -> None:
        self.i += 1
        if not self.brackets:
            self.pending.append("]")
            return
        opener = self.brackets.pop()
        target = self.link_target() if opener.active else None
        if target is None:
            self.pending.append("]")
            return
        dest, title = target
        self.flush()
        process_emphasis(self.items, opener.bottom)
        label = self.items.render_after(opener.node)
        opener.node.next = None
        self.items.tail = opener.node
        self.items.unlink(opener.node)
        self.items.append(Node(html=link_html(label, dest, title, opener.image)))
        if not opener.image:
            for earlier in self.brackets:  # bağlantı bağlantı içeremez
                if not earlier.image:
                    earlier.active = False

    def link_target(self) -> tuple[str, str | None] | None:
        """`](adres "başlık")` biçimini okur; uymuyorsa None (ve konum değişmez)."""
        src, i = self.src, self.i
        if src[i : i + 1] != "(":
            return None
        i = skip_ws(src, i + 1)
        if src[i : i + 1] == "<":
            end = src.find(">", i)
            if end == -1 or "\n" in src[i:end]:
                return None
            dest, i = src[i + 1 : end], end + 1
        else:
            start, depth = i, 0
            while i < len(src) and not src[i].isspace():
                if src[i] == "\\" and i + 1 < len(src):
                    i += 2
                    continue
                if src[i] == "(":
                    depth += 1
                elif src[i] == ")":
                    if depth == 0:
                        break
                    depth -= 1
                i += 1
            dest = src[start:i]
        i = skip_ws(src, i)
        title = None
        if i < len(src) and src[i] in "\"'(" and i > 0 and src[i - 1].isspace():
            closer = ")" if src[i] == "(" else src[i]
            end = src.find(closer, i + 1)
            if end == -1:
                return None
            title, i = src[i + 1 : end], skip_ws(src, end + 1)
        if src[i : i + 1] != ")":
            return None
        self.i = i + 1
        return unescape(dest), title if title is None else unescape(title)

    def angle(self) -> None:
        src, i = self.src, self.i
        auto = AUTOLINK.match(src, i)
        mail = EMAIL.match(src, i)
        if auto or mail:
            match = auto or mail
            assert match is not None
            target = match.group(1)
            href = ("mailto:" + target) if mail and not auto else target
            self.add_html(link_html(escape_html(target), href, None, image=False))
            self.i = match.end()
        else:
            self.pending.append("&lt;")  # ham HTML kaçışlanır
            self.i += 1


def skip_ws(src: str, i: int) -> int:
    while i < len(src) and src[i] in " \t\n":
        i += 1
    return i


def unescape(text: str) -> str:
    return re.sub(r"\\([!-/:-@\[-`{-~])", r"\1", text)


def link_html(label: str, dest: str, title: str | None, image: bool) -> str:
    url = safe_url(dest, image=image)
    title_attr = f' title="{escape_html(title)}"' if title else ""
    if image:
        alt = re.sub(r"<[^>]*>", "", label)
        if url is None:
            return escape_html(alt)
        return f'<img src="{url}" alt="{alt}"{title_attr} />'
    if url is None:
        return label  # tehlikeli şema: bağlantı kurulmaz, yalnız metin
    return f'<a href="{url}"{title_attr}>{label}</a>'


def render_inline(text: str) -> str:
    """Satır içi Markdown'ı güvenli HTML'e çevirir."""
    return InlineParser(text).render()
