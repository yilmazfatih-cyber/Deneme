"""Vurgulu özet (snippet): eşleşmelerin en yoğun olduğu sözcük penceresini seçer ve eşleşen
sözcükleri işaretler.

HTML çıktısında metin önce `html.escape` ile kaçışlanır (kullanıcı metni asla kaçışsız basılmaz),
işaretler (`<mark>`) sonra eklenir.

Genişletme: cümle sınırlarına oturan özet için pencereyi `.`/`?`/`!` konumlarına hizalayın.
"""

from __future__ import annotations

import html
import unicodedata

from .text import Analyzer


def make_snippet(
    text: str,
    positions: set[int],
    analyzer: Analyzer,
    *,
    width: int = 24,
    marks: tuple[str, str] = ("[", "]"),
    as_html: bool = False,
) -> str:
    """`positions` (sözcük konumları) en çok düşen `width` sözcüklük pencereyi vurgulu döndürür."""
    text = unicodedata.normalize("NFC", text)
    tokens = analyzer.tokens(text)
    if not tokens:
        return ""
    first = _best_window(sorted(positions), width) if positions else tokens[0].position
    low, high = max(0, first - 3), first + width  # 3 sözcük önceden başla: bağlam görünsün
    window = [t for t in tokens if low <= t.position < high]
    if not window:
        window = tokens[:width]
    starts_at_beginning = window[0] is tokens[0]
    reaches_end = window[-1] is tokens[-1]
    start_char = 0 if starts_at_beginning else window[0].start
    end_char = len(text.rstrip()) if reaches_end else window[-1].end
    escape = html.escape if as_html else (lambda part: part)
    pieces: list[str] = []
    cursor = start_char
    for token in window:
        if token.position in positions:
            pieces.append(escape(text[cursor : token.start]))
            pieces.append(marks[0] + escape(text[token.start : token.end]) + marks[1])
            cursor = token.end
    pieces.append(escape(text[cursor:end_char]))
    prefix = "" if starts_at_beginning else "…"
    suffix = "" if reaches_end else "…"
    return prefix + "".join(pieces) + suffix


def _best_window(positions: list[int], width: int) -> int:
    """En çok konumu içeren [p, p + width) penceresinin başlangıcı (iki işaretçi)."""
    best_start, best_count, left = positions[0], 0, 0
    for right, position in enumerate(positions):
        while position - positions[left] >= width:
            left += 1
        if right - left + 1 > best_count:
            best_count, best_start = right - left + 1, positions[left]
    return best_start
