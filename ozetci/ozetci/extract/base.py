from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


@dataclass
class Page:
    """Bir PDF sayfası ya da tek bir görüntü."""

    index: int
    text: str = ""
    needs_ocr: bool = False
    ocr_applied: bool = False


@dataclass
class Attachment:
    """E-postaya iliştirilmiş ham dosya (metne çevrilmemiş)."""

    filename: str
    content_type: str
    size: int
    data: Optional[bytes] = None


@dataclass
class Document:
    """Her kaynak türü için ortak metin taşıyıcısı.

    ``kind``: ``"pdf" | "email" | "image" | "text"``.
    ``text``: özetlenecek ana metin (e-postada başlık satırları + gövde).
    ``pages``: PDF/görüntü sayfaları; e-postada boş.
    ``children``: e-posta eklerinden çıkarılmış belgeler (PDF, görüntü).
    ``attachments``: metne çevrilemeyen ekler (yalnızca ad ve tür).
    """

    kind: str
    source: str
    text: str = ""
    title: Optional[str] = None
    pages: list[Page] = field(default_factory=list)
    children: list["Document"] = field(default_factory=list)
    attachments: list[Attachment] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    language: str = "unknown"

    @property
    def needs_ocr(self) -> bool:
        return any(p.needs_ocr and not p.ocr_applied for p in self.pages)

    def full_text(self, include_children: bool = True) -> str:
        parts = [self.text.strip()] if self.text.strip() else []
        if include_children:
            for child in self.children:
                child_text = child.full_text(include_children=True)
                if child_text:
                    label = child.title or child.source
                    parts.append(f"[Ek: {label}]\n{child_text}")
        return "\n\n".join(parts)

    def char_count(self) -> int:
        return len(self.full_text())
