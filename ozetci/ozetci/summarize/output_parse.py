"""Modelin ``ÖZET / MADDELER / EYLEMLER`` biçimli çıktısını ayrıştırır; biçim bozuksa toleranslıdır."""

from __future__ import annotations

import re

from ..textutil import tr_lower
from .base import Summary

_LABELS = (
    r"ÖZET|OZET|SUMMARY|KISA ÖZET|GENEL ÖZET|"
    r"MADDELER|ANA NOKTALAR|ÖNEMLİ NOKTALAR|ÖNEMLI NOKTALAR|TEMEL NOKTALAR|POINTS|KEY POINTS|MAIN POINTS|HIGHLIGHTS|"
    r"EYLEMLER|EYLEM MADDELERİ|EYLEM MADDELERI|YAPILACAKLAR|ACTIONS|ACTION ITEMS|NEXT STEPS|TO ?DO"
)
# Başlık: satır başında, isteğe bağlı **/#, etiketten hemen sonra ':' ya da satır sonu
# ("Özetle," / "Özet olarak" başlık değildir)
_HEAD_RE = re.compile(r"^\s*(?:\*\*|#+\s*)?(" + _LABELS + r")\s*(?:\*\*)?\s*(?::\s*(?:\*\*)?\s*(.*)|(?:\*\*)?\s*$)", re.I)
_BULLET_RE = re.compile(r"^\s*(?:[-*•·▪]|\d+[.)])\s+(.*)$")
_THINK_RE = re.compile(r"<think>.*?</think>", re.S)
_NONE_RE = re.compile(
    r"^(yok(tur)?|eylem yok|herhangi bir eylem yok|belirtilmemiş|bulunmuyor|none|no actions?( required| needed| items?)?|nothing|n/?a|-|—)"
    r"[\s.!,:;()\-]*(\(.*\))?[\s.!]*$",
    re.I,
)


_NUM_RE = re.compile(r"\d[\d.,:/]*\d|\d")


def unverified_numbers(summary_text: str, source: str) -> list[str]:
    """Özetteki, kaynak metinde geçmeyen rakamları döndürür (küçük modellerde uydurma denetimi)."""
    src = source.replace(" ", "")
    bad = []
    for n in _NUM_RE.findall(summary_text):
        n_clean = n.strip(".,:/")
        if n_clean and n_clean not in src and n_clean.replace(".", "").replace(",", "") not in src.replace(".", "").replace(",", ""):
            bad.append(n_clean)
    return sorted(set(bad))


def strip_thinking(text: str) -> str:
    text = _THINK_RE.sub("", text)
    # kapanmamış <think> bloğu (kesilmiş üretim)
    if "<think>" in text and "</think>" not in text:
        text = text.split("<think>", 1)[0]
    return text.strip()


_TEXT_LABELS = {"özet", "ozet", "summary", "kısa özet", "genel özet"}
_BULLET_LABELS = {"maddeler", "ana noktalar", "önemli noktalar", "onemli noktalar", "temel noktalar", "points", "key points", "main points", "highlights"}


def _folds(text: str) -> tuple[str, str]:
    """İngilizce ve Türkçe küçük harf biçimleri ("POINTS" -> "points" / "poınts")."""
    return text.lower(), tr_lower(text)


def _section_of(label: str) -> str:
    forms = _folds(label.strip())
    if any(f in _TEXT_LABELS for f in forms):
        return "text"
    if any(f in _BULLET_LABELS for f in forms):
        return "bullets"
    return "actions"


def parse_summary(raw: str, language: str = "tr", backend: str = "") -> Summary:
    raw = strip_thinking(raw or "")
    sections: dict[str, list[str]] = {"text": [], "bullets": [], "actions": []}
    current = "text"
    saw_header = False
    for line in raw.split("\n"):
        if not line.strip():
            continue
        m = _HEAD_RE.match(line)
        if m:
            saw_header = True
            current = _section_of(m.group(1))
            rest = (m.group(2) or "").strip().strip("*").strip()
            if rest:
                sections[current].append(rest)
            continue
        sections[current].append(line.strip())

    def _items(lines: list[str]) -> list[str]:
        items = []
        for ln in lines:
            b = _BULLET_RE.match(ln)
            item = (b.group(1) if b else ln).strip().rstrip(",;")
            if item and not any(_NONE_RE.match(f) for f in _folds(item)):
                items.append(item)
        return items

    bullets = _items(sections["bullets"])
    actions = _items(sections["actions"])
    text_src = sections["text"]
    bullet_lines = [ln for ln in text_src if _BULLET_RE.match(ln)]
    if not bullets and len(bullet_lines) >= 2:
        # "ÖZET:" başlığından sonra yalnızca maddeler geldi: maddeleri ayrı tut
        bullets = _items(bullet_lines)
        text_src = [ln for ln in text_src if not _BULLET_RE.match(ln)]
    text_lines = [re.sub(r"^\s*[-*•]\s+", "", ln) for ln in text_src]
    text = " ".join(text_lines).strip()
    if not text and bullets:
        text = " ".join(bullets[:2])
    if not saw_header and not text:
        text = raw.strip()
    summary = Summary(text=text, bullets=bullets, actions=actions, language=language, backend=backend)
    if not saw_header:
        summary.notes.append("model biçime uymadı; ham çıktı özet alanına yazıldı")
    return summary
