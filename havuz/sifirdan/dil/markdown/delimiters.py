"""Vurgu çözümü: `*`, `_` ve `~~` sınırlayıcı dizileri (CommonMark "process emphasis" algoritması).

Satır içi öğeler çift bağlı bir listede durur (`Node.prev/next`); sınırlayıcılar ayrıca kendi
bağlı yığınındadır (`Node.below/above`). Bir dizinin açabilmesi/kapatabilmesi komşu karakterlerin
boşluk ya da noktalama olmasına göre belirlenir (`_` sözcük içinde vurgu yapmaz: `alt_çizgili_ad`).
Her kapatıcı için geriye doğru eşleşen açıcı aranır (≥2 + ≥2 → `<strong>`, yoksa `<em>`;
"3 kuralı"); bulunamazsa o tür için arama alt sınırı yükseltilir — kötü niyetli girdide de
doğrusal kalır.
Genişletme: yeni bir sınırlayıcı (ör. `==vurgu==`) için `TAGS`'e ekleyin ve inline.py'de tanıyın.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass

from .safety import escape_html

TAGS = {"*": ("em", "strong"), "_": ("em", "strong"), "~": ("del", "del")}


@dataclass(eq=False)
class Node:
    html: str = ""
    delim: str = ""  # sınırlayıcıysa "*", "_" ya da "~"
    count: int = 0  # kalan sınırlayıcı sayısı
    length: int = 0  # dizinin ilk uzunluğu ("3 kuralı" için)
    can_open: bool = False
    can_close: bool = False
    prev: Node | None = None
    next: Node | None = None
    below: Node | None = None  # sınırlayıcı yığınında alttaki
    above: Node | None = None

    def text(self) -> str:
        return escape_html(self.delim * self.count) if self.delim else self.html


def is_punct(ch: str) -> bool:
    return bool(ch) and unicodedata.category(ch)[0] in ("P", "S")


def is_space(ch: str) -> bool:
    return ch == "" or ch.isspace()


def flanking(before: str, after: str, char: str) -> tuple[bool, bool]:
    """(açabilir, kapatabilir) — CommonMark sola/sağa yaslı dizi kuralları."""
    left = not is_space(after) and (not is_punct(after) or is_space(before) or is_punct(before))
    right = not is_space(before) and (not is_punct(before) or is_space(after) or is_punct(after))
    if char == "_":
        return left and (not right or is_punct(before)), right and (not left or is_punct(after))
    return left, right


class InlineList:
    """Satır içi öğelerin çift bağlı listesi + sınırlayıcı yığınının tepesi."""

    def __init__(self) -> None:
        self.head = Node()
        self.tail = self.head
        self.top: Node | None = None  # sınırlayıcı yığınının tepesi

    def append(self, node: Node) -> Node:
        node.prev = self.tail
        self.tail.next = node
        self.tail = node
        if node.delim:
            node.below = self.top
            if self.top is not None:
                self.top.above = node
            self.top = node
        return node

    def unlink(self, node: Node) -> None:
        assert node.prev is not None
        node.prev.next = node.next
        if node.next is not None:
            node.next.prev = node.prev
        else:
            self.tail = node.prev

    def pop_delimiter(self, node: Node) -> None:
        if node.below is not None:
            node.below.above = node.above
        if node.above is not None:
            node.above.below = node.below
        else:
            self.top = node.below

    def render_after(self, start: Node, end: Node | None = None) -> str:
        """`start`'tan sonraki (ve `end`'den önceki) öğelerin HTML'i."""
        parts = []
        node = start.next
        while node is not None and node is not end:
            parts.append(node.text())
            node = node.next
        return "".join(parts)


def process_emphasis(items: InlineList, bottom: Node | None) -> None:
    """`bottom`'ın üstündeki sınırlayıcıları eşleştirir, sonra hepsini yığından atar."""
    closer = items.top
    while closer is not None and closer.below is not bottom:
        closer = closer.below
    openers_bottom: dict[tuple[str, bool, int], Node | None] = {}
    while closer is not None:
        if not closer.can_close:
            closer = closer.above
            continue
        key = (closer.delim, closer.can_open, closer.length % 3)
        limit = openers_bottom.get(key, bottom)
        opener = closer.below
        while opener is not None and opener is not bottom and opener is not limit:
            if opener.delim == closer.delim and opener.can_open and compatible(opener, closer):
                break
            opener = opener.below
        else:
            opener = None
        if opener is None:
            openers_bottom[key] = closer.below
            following = closer.above
            if not closer.can_open:
                items.pop_delimiter(closer)
            closer = following
            continue
        closer = match(items, opener, closer)
    while items.top is not None and items.top is not bottom:
        items.pop_delimiter(items.top)


def match(items: InlineList, opener: Node, closer: Node) -> Node | None:
    """Açıcı ile kapatıcıyı vurgu öğesine çevirir; sıradaki kapatıcı adayını döndürür."""
    use = 2 if opener.count >= 2 and closer.count >= 2 else 1
    tag = TAGS[closer.delim][use - 1]
    html = f"<{tag}>{items.render_after(opener, closer)}</{tag}>"
    middle = Node(html=html, prev=opener, next=closer)
    opener.next = middle
    closer.prev = middle
    opener.above, closer.below = closer, opener  # aradaki sınırlayıcılar vurgunun içinde kaldı
    opener.count -= use
    closer.count -= use
    if opener.count == 0:
        items.unlink(opener)
        items.pop_delimiter(opener)
    if closer.count == 0:
        following = closer.above
        items.unlink(closer)
        items.pop_delimiter(closer)
        return following
    return closer


def compatible(opener: Node, closer: Node) -> bool:
    if opener.delim == "~":
        return opener.length == 2 and closer.length == 2
    odd = (opener.can_close or closer.can_open) and closer.length % 3 != 0
    return not (odd and (opener.length + closer.length) % 3 == 0)
