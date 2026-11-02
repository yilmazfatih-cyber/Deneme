"""PDF okuma: metin katmanı varsa doğrudan, yoksa sayfayı görüntüye çevirip OCR'a verir."""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional, Union

from ..textutil import alnum_ratio, clean_text, reflow
from .base import Document, Page

Source = Union[str, Path, bytes]

# Bu eşiklerin altındaki sayfalar "taranmış" kabul edilir ve OCR'a gönderilir.
MIN_CHARS_PER_PAGE = 40
MIN_ALNUM_RATIO = 0.55  # harf+rakam / boşluk dışı karakter (fatura kalem sayfaları rakam ağırlıklıdır)
BLANK_PAGE_STDDEV = 3.0  # bu değerin altında gri sapması olan sayfa boş sayılır, OCR'a gitmez


def page_needs_ocr(text: str, min_chars: int = MIN_CHARS_PER_PAGE, min_alnum: float = MIN_ALNUM_RATIO) -> bool:
    stripped = text.strip()
    if len(stripped) < min_chars:
        return True
    if alnum_ratio(stripped) < min_alnum:
        return True
    # Yazı tipi kodlaması bozuk PDF'lerde sık görülen "(cid:123)" kalıntıları
    if stripped.count("(cid:") > 5:
        return True
    return False


def _open(src: Source, password: Optional[str] = None):
    import pypdfium2 as pdfium  # geç içe aktarma: paket yoksa yalnızca PDF okunamaz

    target = io.BytesIO(src) if isinstance(src, bytes) else str(src)
    try:
        return pdfium.PdfDocument(target, password=password)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower() or getattr(exc, "err_code", None) == 4:
            raise ValueError("PDF parola korumalı; extract_pdf(..., password=...) ile parola verin") from exc
        raise


def page_is_blank(image, stddev: float = BLANK_PAGE_STDDEV) -> bool:
    from PIL import ImageStat

    gray = image.convert("L")
    lo, hi = gray.getextrema()
    if hi - lo < 16:
        return True
    return ImageStat.Stat(gray).stddev[0] < stddev


def render_page(pdf, index: int, dpi: int = 170):
    """Sayfayı PIL görüntüsüne çevirir (OCR için)."""
    page = pdf[index]
    bitmap = page.render(scale=dpi / 72.0)
    return bitmap.to_pil().convert("RGB")


def extract_pdf(
    src: Source,
    ocr=None,
    dpi: int = 170,
    max_pages: Optional[int] = None,
    source_name: Optional[str] = None,
    password: Optional[str] = None,
) -> Document:
    """PDF'i :class:`Document`'e çevirir.

    ``ocr``: :class:`ozetci.ocr.base.OCREngine` uyumlu nesne. ``None`` ise taranmış
    sayfalar ``needs_ocr=True`` olarak işaretlenir ve metinleri boş kalır.
    ``password``: parola korumalı PDF için.
    """
    pdf = _open(src, password=password)
    name = source_name or (str(src) if not isinstance(src, bytes) else "<bytes>.pdf")
    try:
        n_pages = len(pdf)
        if max_pages is not None:
            n_pages = min(n_pages, max_pages)
        pages: list[Page] = []
        blank = 0
        for i in range(n_pages):
            page = pdf[i]
            try:
                raw = page.get_textpage().get_text_range()
            except Exception:  # pragma: no cover - bozuk sayfa
                raw = ""
            raw = clean_text(raw)
            needs = page_needs_ocr(raw)
            p = Page(index=i, text=raw, needs_ocr=needs)
            if needs and ocr is not None:
                image = render_page(pdf, i, dpi=dpi)
                if page_is_blank(image):
                    p.text, p.ocr_applied = "", True
                    blank += 1
                else:
                    ocr_text = clean_text(ocr.image_to_text(image))
                    p.text = ocr_text or raw  # OCR boş dönerse eldeki metin katmanı kalsın
                    p.ocr_applied = True
            pages.append(p)
        meta = {}
        try:
            meta = {k: v for k, v in pdf.get_metadata_dict().items() if v}
        except Exception:  # pragma: no cover
            pass
    finally:
        try:
            pdf.close()
        except Exception:  # pragma: no cover
            pass

    text = "\n\n".join(reflow(p.text) for p in pages if p.text.strip())
    title = meta.get("Title") or None
    doc = Document(kind="pdf", source=name, text=text, title=title, pages=pages, metadata=meta)
    doc.metadata["page_count"] = len(pages)
    doc.metadata["ocr_pages"] = sum(1 for p in pages if p.ocr_applied)
    doc.metadata["pending_ocr_pages"] = sum(1 for p in pages if p.needs_ocr and not p.ocr_applied)
    if blank:
        doc.metadata["blank_pages"] = blank
    return doc
