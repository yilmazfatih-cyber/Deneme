"""Madde-duyarlı parçalama.

Mevzuatta doğal birim "MADDE n"dir; kararlarda bölüm başlıkları (GEREKÇE, HÜKÜM, KARAR, SONUÇ...) vardır.
Önce bu sınırlardan böleriz, sonra uzun parçaları paragraf sınırından hedef boyuta indiririz. Her parça
`heading` (örn. "Madde 5") ve `anchor` (bağlantıya eklenecek `#madde-5`) taşır; böylece alıntı bağlantısı
belgenin ilgili yerine işaret eder.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from legalai.models import Chunk, Document, make_chunk_id
from legalai.text import estimate_tokens, fold_tr

# "MADDE 5 –", "Madde 5-", "MADDE 12/A", "GEÇİCİ MADDE 3", "EK MADDE 1"
_MADDE = re.compile(
    r"^\s*((?:GEÇİCİ|GECICI|EK|Geçici|Ek)\s+)?(MADDE|Madde)\s+(\d+(?:/[A-Za-z])?)\s*[-–—:.]?", re.MULTILINE
)
_SECTION = re.compile(
    r"^\s*(GEREKÇE|GEREKÇESİ|HÜKÜM|KARAR|SONUÇ|TALEP|OLAY VE OLGULAR|İNCELEME VE GEREKÇE|DAVA|CEVAP|"
    r"İLK DERECE MAHKEMESİ KARARI|BÖLGE ADLİYE MAHKEMESİ KARARI|TEMYİZ|YARGITAY KARARI|DEĞERLENDİRME|"
    r"ESAS YÖNÜNDEN|KABUL EDİLEBİLİRLİK YÖNÜNDEN|BAŞVURUNUN KONUSU|İDDİA VE SAVUNMA)\s*[:\-–]?\s*$",
    re.MULTILINE,
)


@dataclass
class ChunkParams:
    target_tokens: int = 450
    max_tokens: int = 700
    min_tokens: int = 60
    overlap_chars: int = 200


def chunk_document(doc: Document, params: ChunkParams | None = None) -> list[Chunk]:
    p = params or ChunkParams()
    text = doc.text
    if not text.strip():
        return []
    sections = _split_structural(text)
    chunks: list[Chunk] = []
    ordinal = 0
    for heading, anchor, start, end in sections:
        for s, e in _split_size(text, start, end, p):
            piece = text[s:e].strip()
            if not piece:
                continue
            if chunks and estimate_tokens(piece) < p.min_tokens and chunks[-1].heading == heading:
                # Çok küçük kuyruk: öncekiyle birleştir
                prev = chunks[-1]
                merged = text[prev.char_start : e].strip()
                chunks[-1] = prev.model_copy(
                    update={"text": merged, "char_end": e, "token_estimate": estimate_tokens(merged)}
                )
                continue
            chunks.append(
                Chunk(
                    chunk_id=make_chunk_id(doc.doc_id, ordinal),
                    doc_id=doc.doc_id,
                    ordinal=ordinal,
                    text=piece,
                    heading=heading,
                    anchor=anchor,
                    char_start=s,
                    char_end=e,
                    token_estimate=estimate_tokens(piece),
                )
            )
            ordinal += 1
    return chunks


def _split_structural(text: str) -> list[tuple[str | None, str | None, int, int]]:
    """Madde / bölüm sınırlarını bulur. Döndürür: (heading, anchor, start, end)."""
    marks: list[tuple[int, str, str]] = []
    for m in _MADDE.finditer(text):
        prefix = (m.group(1) or "").strip()
        num = m.group(3)
        heading = f"{prefix.title() + ' ' if prefix else ''}Madde {num}"
        anchor = "madde-" + fold_tr(f"{prefix}-{num}" if prefix else num).replace("/", "-").strip("-")
        marks.append((m.start(), heading, anchor))
    for m in _SECTION.finditer(text):
        heading = m.group(1).strip().title()
        marks.append((m.start(), heading, fold_tr(heading).replace(" ", "-")))
    marks.sort(key=lambda t: t[0])
    if not marks:
        return [(None, None, 0, len(text))]
    out: list[tuple[str | None, str | None, int, int]] = []
    if marks[0][0] > 0:
        out.append((None, None, 0, marks[0][0]))
    for i, (pos, heading, anchor) in enumerate(marks):
        end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
        out.append((heading, anchor, pos, end))
    return out


def _split_size(text: str, start: int, end: int, p: ChunkParams) -> list[tuple[int, int]]:
    """[start, end) aralığını paragraf sınırlarından hedef boyuta böler; gerekirse örtüşme ekler."""
    segment = text[start:end]
    if estimate_tokens(segment) <= p.max_tokens:
        return [(start, end)]
    paras = [(m.start(), m.end()) for m in re.finditer(r"[^\n]+(?:\n(?!\n)[^\n]+)*", segment)]
    pieces: list[tuple[int, int]] = []
    cur_s: int | None = None
    cur_e = 0
    for ps, pe in paras:
        if cur_s is None:
            cur_s = ps
        cur_e = pe
        if estimate_tokens(segment[cur_s:cur_e]) >= p.target_tokens:
            pieces.append((cur_s, cur_e))
            cur_s = None
    if cur_s is not None and cur_e > cur_s:
        pieces.append((cur_s, cur_e))
    # Tek paragraf bile çok uzunsa karakter bazlı böl
    final: list[tuple[int, int]] = []
    for s, e in pieces:
        if estimate_tokens(segment[s:e]) <= p.max_tokens:
            final.append((s, e))
            continue
        step = int(p.max_tokens * 3.2)
        i = s
        while i < e:
            j = min(e, i + step)
            # cümle sonuna yaklaş
            k = segment.rfind(". ", i, j)
            if k > i + step // 2:
                j = k + 1
            final.append((i, j))
            i = max(j - p.overlap_chars, i + 1) if j < e else e
    return [(start + s, start + e) for s, e in final]
