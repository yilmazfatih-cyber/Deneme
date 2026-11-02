"""Uzun metni küçük modelin bağlamına sığacak parçalara böler.

Önce paragraf, sonra cümle, en son sert karakter sınırıyla bölünür. Parçalar arasında
küçük bir örtüşme bırakılır ki bir cümle iki parçanın arasında kaybolmasın.
"""

from __future__ import annotations

import re

_SENT_SPLIT_RE = re.compile(r"(?<=[.!?…])\s+(?=[\"'(«“]?[A-ZÇĞİÖŞÜ0-9])")


def split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    parts = _SENT_SPLIT_RE.split(text)
    return [p.strip() for p in parts if p.strip()]


def split_paragraphs(text: str) -> list[str]:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def chunk_text(text: str, max_chars: int = 6000, overlap_chars: int = 300) -> list[str]:
    """Metni en fazla ``max_chars`` uzunluğunda parçalara böler.

    ``overlap_chars`` kadar son cümleler bir sonraki parçanın başına da eklenir.
    """
    if max_chars <= 0:
        raise ValueError("max_chars pozitif olmalı")
    text = text.strip()
    if len(text) <= max_chars:
        return [text] if text else []

    units: list[str] = []
    for para in split_paragraphs(text):
        if len(para) <= max_chars:
            units.append(para)
            continue
        for sent in split_sentences(para):
            if len(sent) <= max_chars:
                units.append(sent)
            else:
                units.extend(_hard_split(sent, max_chars))

    chunks: list[str] = []
    current: list[str] = []
    current_len = 0
    for unit in units:
        extra = len(unit) + (2 if current else 0)
        if current and current_len + extra > max_chars:
            chunks.append("\n\n".join(current))
            tail = _tail(current, overlap_chars)
            current = tail
            current_len = sum(len(u) for u in current) + 2 * max(len(current) - 1, 0)
            extra = len(unit) + (2 if current else 0)
            if current and current_len + extra > max_chars:  # kuyruk + yeni birim sığmıyor: örtüşmeden vazgeç
                current, current_len, extra = [], 0, len(unit)
        current.append(unit)
        current_len += extra
    if current:
        chunks.append("\n\n".join(current))
    return chunks


def _tail(units: list[str], overlap_chars: int) -> list[str]:
    """Örtüşme için önceki parçanın sonundan ``overlap_chars``'ı aşmayan birimleri döndürür.

    Tam birim sığmıyorsa son birimin kuyruğu (kelime sınırında) alınır ki uzun paragraflarda
    da örtüşme olsun.
    """
    if overlap_chars <= 0 or not units:
        return []
    tail: list[str] = []
    total = 0
    for unit in reversed(units):
        if total + len(unit) > overlap_chars:
            break
        tail.insert(0, unit)
        total += len(unit)
    if not tail:
        last = units[-1]
        cut = last.rfind(" ", 0, max(len(last) - overlap_chars, 0) + 1)
        fragment = last[len(last) - overlap_chars:] if cut < 0 else last[cut + 1:]
        fragment = fragment.strip()
        if fragment:
            tail = ["… " + fragment]
    return tail


def _hard_split(text: str, max_chars: int) -> list[str]:
    out = []
    while len(text) > max_chars:
        cut = text.rfind(" ", 0, max_chars)
        if cut < max_chars // 2:
            cut = max_chars
        out.append(text[:cut].strip())
        text = text[cut:].strip()
    if text:
        out.append(text)
    return out


def estimate_tokens(text: str, chars_per_token: float = 3.0) -> int:
    """Kaba belirteç tahmini. Türkçe, İngilizce'ye göre daha fazla belirteç tüketir;
    3.0 karakter/belirteç ihtiyatlı bir varsayımdır (Qwen tokenizer, Türkçe ~3.2, İngilizce ~4)."""
    return max(1, int(len(text) / chars_per_token))
