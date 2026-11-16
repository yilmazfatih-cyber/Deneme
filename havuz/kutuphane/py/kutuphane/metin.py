"""metin — metin yardımcıları: kısaltma (sözcük ortasından ve birleşik harften bölmeden), satır sarma, sözcük sayımı
(Türkçe kesmeli ekler tek sözcük: "Ankara'ya"), okuma süresi, şablon doldurma ({ad}, {kisi.ad}), HTML kaçışı,
boşluk sadeleştirme. TypeScript eşiyle aynı kurallar.

Kullanım:
    truncate("Türkiye Büyük Millet Meclisi", 20)        # "Türkiye Büyük…"
    wrap("uzun bir paragraf …", 40)                     # satır listesi (her biri ≤ 40 karakter)
    word_count("Ankara'ya e-posta gönderdim.")          # 3
    reading_time(makale)                                 # dakika (dakikada 200 sözcük varsayımı, yukarı yuvarlanır)
    fill_template("Merhaba {ad}, {{kod}}: {sipariş.no}", {"ad": "Ayşe", "sipariş": {"no": 42}})
    # "Merhaba Ayşe, {kod}: 42"   (eksik alan → TemplateError; missing="keep" | "empty")

Sınırlar: Uzunluklar KOD NOKTASI sayısıdır (birleşik emoji birden çok sayılır). Dakikada 200 sözcük yaygın bir
varsayımdır, ölçülmedi. Şablonda koşul/döngü yoktur (bilerek; str.format'ın öznitelik erişimi güvenlik açığıdır,
burada yoktur). HTML'e basılacaksa `escape=escape_html` verin.

Genişletme: Yeni işlev kod noktası mantığıyla yazılır ve TypeScript eşine aynı kurallarla eklenir;
`vektorler/metin.json`'a örnek yazılır.
"""

from __future__ import annotations

import math
import re
import unicodedata
from collections.abc import Callable, Mapping
from typing import Any, Literal

__all__ = [
    "TemplateError",
    "escape_html",
    "fill_template",
    "normalize_whitespace",
    "reading_time",
    "truncate",
    "word_count",
    "wrap",
]

_SPACE_CHARS = frozenset(" \t\n\r\f\v") | frozenset(
    chr(code)
    for code in (
        0xA0,
        0x1680,
        *range(0x2000, 0x200B),
        0x2028,
        0x2029,
        0x202F,
        0x205F,
        0x3000,
        0xFEFF,
    )
)
_TRAILING_PUNCTUATION = ",;:-–—"
_PLACEHOLDER = re.compile(r"\{\{|\}\}|\{([^{}]*)\}")


class TemplateError(ValueError):
    """Şablonda eksik ya da yazılamayan değer."""


def _is_mark(ch: str) -> bool:
    return unicodedata.category(ch).startswith("M")


def _is_word_char(ch: str) -> bool:
    return ch.isalnum() or _is_mark(ch)


def normalize_whitespace(text: str) -> str:
    """Boşlukları tek boşluğa indirir ve baştan/sondan atar."""
    out: list[str] = []
    pending = False
    for ch in text:
        if ch in _SPACE_CHARS:
            pending = bool(out)
        else:
            if pending:
                out.append(" ")
            out.append(ch)
            pending = False
    return "".join(out)


def truncate(text: str, max_length: int, *, ellipsis: str = "…", word_boundary: bool = True) -> str:
    """En çok `max_length` kod noktası olacak biçimde kısaltır ve sonuna `ellipsis` ekler."""
    if max_length < 0:
        raise ValueError("max_length 0 veya daha büyük tam sayı olmalı.")
    if len(text) <= max_length:
        return text
    room = max_length - len(ellipsis)
    if room <= 0:
        return ellipsis[:max_length]
    cut = room
    while cut > 0 and _is_mark(text[cut]):
        cut -= 1  # harfi işaretinden ayırma
    if word_boundary:
        k = cut
        while k > 0 and text[k] not in _SPACE_CHARS:
            k -= 1
        if k > 0 and k >= room / 2:
            cut = k
    end = cut
    while end > 0 and (text[end - 1] in _SPACE_CHARS or text[end - 1] in _TRAILING_PUNCTUATION):
        end -= 1
    return text[:end] + ellipsis


def wrap(text: str, width: int) -> list[str]:
    """Satırlara sarar: her satır en çok `width` kod noktası; daha uzun sözcük bölünür. Paragraflar korunur."""
    if width < 1:
        raise ValueError("width 1 veya daha büyük tam sayı olmalı.")
    lines: list[str] = []
    for paragraph in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        line = ""
        for word in (w for w in normalize_whitespace(paragraph).split(" ") if w):
            chunk = word
            while len(chunk) > width:
                if line:
                    lines.append(line)
                lines.append(chunk[:width])
                chunk = chunk[width:]
                line = ""
            if not chunk:
                continue
            needed = len(chunk) if not line else len(line) + 1 + len(chunk)
            if needed <= width:
                line = chunk if not line else f"{line} {chunk}"
            else:
                lines.append(line)
                line = chunk
        lines.append(line)
    return lines


def word_count(text: str) -> int:
    """Sözcük sayısı: harf/rakam dizileri; içteki kesme ve tire sözcüğü bölmez."""
    count = 0
    in_word = False
    for i, ch in enumerate(text):
        if _is_word_char(ch):
            if not in_word:
                count += 1
            in_word = True
        elif (
            in_word
            and ch in "'’-"
            and i + 1 < len(text)
            and _is_word_char(text[i + 1])
            and _is_word_char(text[i - 1])
        ):
            continue
        else:
            in_word = False
    return count


def reading_time(text: str, *, words_per_minute: float = 200) -> int:
    """Okuma süresi (dakika, yukarı yuvarlanır); boş metin 0."""
    if words_per_minute <= 0:
        raise ValueError("words_per_minute sıfırdan büyük olmalı.")
    return math.ceil(word_count(text) / words_per_minute)


def escape_html(text: str) -> str:
    """HTML'de güvenle göstermek için & < > " ' kaçışı."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _number_text(value: float) -> str:
    if not math.isfinite(value):
        raise TemplateError(f"Sonlu olmayan sayı şablona yazılamaz: {value}.")
    if float(value).is_integer() and abs(value) < 1e21:
        return str(int(value))
    return repr(value)


def fill_template(
    template: str,
    values: Mapping[str, Any],
    *,
    missing: Literal["error", "keep", "empty"] = "error",
    escape: Callable[[str], str] | None = None,
) -> str:
    """Şablonu doldurur: {ad}, {kisi.ad} (iç içe), {{ ve }} → düz { }. Değer metin, sayı ya da mantıksal olmalı."""

    def replace(match: re.Match[str]) -> str:
        token = match.group(0)
        if token == "{{":
            return "{"
        if token == "}}":
            return "}"
        path = (match.group(1) or "").strip()
        value: Any = values
        for part in path.split("."):
            value = value.get(part) if isinstance(value, Mapping) else None
        if value is None:
            if missing == "keep":
                return token
            if missing == "empty":
                return ""
            raise TemplateError(f'Şablonda "{{{path}}}" için değer verilmedi.')
        if isinstance(value, bool):
            text = "true" if value else "false"
        elif isinstance(value, str):
            text = value
        elif isinstance(value, int | float):
            text = _number_text(value)
        else:
            raise TemplateError(f'"{{{path}}}" değeri metin, sayı ya da mantıksal olmalı.')
        return escape(text) if escape else text

    return _PLACEHOLDER.sub(replace, template)
