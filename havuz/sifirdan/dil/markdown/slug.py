"""Başlık kimlikleri (Türkçe harfleri ASCII'ye çeviren kısa ad) ve içindekiler tablosu.

`slugify("Çalışma Ortamı & Kurulum")` → `"calisma-ortami-kurulum"`. Türkçe harfler önce tablo ile
(ç→c, ğ→g, ı→i, İ→i, ö→o, ş→s, ü→u) çevrilir — `"İ".lower()` gibi tuzaklara düşülmez; kalan
aksanlar NFKD ile ayrılıp atılır. Aynı başlık ikinci kez geçerse `-1`, `-2` eklenir (GitHub gibi).
Genişletme: başka bir dilin harfleri için `ASCII_MAP`'e satır ekleyin.
"""

from __future__ import annotations

import html
import re
import unicodedata
from dataclasses import dataclass

ASCII_MAP = str.maketrans(
    {
        "ç": "c", "Ç": "c", "ğ": "g", "Ğ": "g", "ı": "i", "I": "i", "İ": "i",
        "ö": "o", "Ö": "o", "ş": "s", "Ş": "s", "ü": "u", "Ü": "u",
        "â": "a", "Â": "a", "î": "i", "Î": "i", "û": "u", "Û": "u",
    }
)  # fmt: skip
TAG = re.compile(r"<[^>]*>")


@dataclass
class TocEntry:
    level: int
    text: str
    id: str


def plain_text(rendered_html: str) -> str:
    """Satır içi HTML'den düz metin (etiketler atılır, varlıklar çözülür)."""
    return html.unescape(TAG.sub("", rendered_html)).strip()


def slugify(text: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", text.translate(ASCII_MAP))
    ascii_text = "".join(ch for ch in ascii_text if not unicodedata.combining(ch))
    lowered = ascii_text.encode("ascii", "ignore").decode("ascii").lower()  # tr-güvenli: ASCII
    slug = re.sub(r"[^a-z0-9]+", "-", lowered).strip("-")
    return slug or "bolum"


class SlugRegistry:
    """Belgede kullanılmış kimlikleri tutar; tekrar edenlere sayı ekler."""

    def __init__(self) -> None:
        self.seen: dict[str, int] = {}

    def unique(self, text: str) -> str:
        base = slugify(text)
        count = self.seen.get(base, 0)
        self.seen[base] = count + 1
        if count == 0:
            return base
        candidate = f"{base}-{count}"
        while candidate in self.seen:
            count += 1
            candidate = f"{base}-{count}"
        self.seen[candidate] = 1
        return candidate


def render_toc(entries: list[TocEntry]) -> str:
    """İç içe `<ul>` içindekiler listesi (seviyeler atlanırsa da düzgün kapanır)."""
    if not entries:
        return ""
    out: list[str] = ['<nav class="icindekiler">']
    base = min(e.level for e in entries)
    depth = 0
    for entry in entries:
        level = entry.level - base + 1
        while depth < level:
            out.append("<ul>")
            depth += 1
        while depth > level:
            out.append("</ul>")
            depth -= 1
        link = f'<a href="#{entry.id}">{html.escape(entry.text, quote=False)}</a>'
        out.append(f"<li>{link}</li>")
    out.extend(["</ul>"] * depth)
    out.append("</nav>")
    return "\n".join(out) + "\n"
