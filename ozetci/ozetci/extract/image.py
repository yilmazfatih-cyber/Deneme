"""Görüntü dosyaları (PNG/JPG/TIFF/WebP): doğrudan OCR'a gider.

EXIF yön bilgisi uygulanır (telefon fotoğrafları dönük gelmesin); çok sayfalı TIFF'te her kare bir sayfadır.
"""

from __future__ import annotations

import io
from pathlib import Path
from typing import Optional, Union

from ..textutil import clean_text, reflow
from .base import Document, Page


def _frames(image):
    from PIL import ImageOps, ImageSequence

    n = getattr(image, "n_frames", 1)
    frames = [f.copy() for f in ImageSequence.Iterator(image)] if n > 1 else [image]
    out = []
    for f in frames:
        try:
            f = ImageOps.exif_transpose(f) or f
        except Exception:
            pass
        out.append(f.convert("RGB"))
    return out


def extract_image(src: Union[str, Path, bytes], ocr=None, source_name: Optional[str] = None) -> Document:
    from PIL import Image

    if isinstance(src, bytes):
        image = Image.open(io.BytesIO(src))
        name = source_name or "<bytes>.img"
    else:
        image = Image.open(str(src))
        name = source_name or str(src)
    with image:
        frames = _frames(image)
    pages: list[Page] = []
    for i, frame in enumerate(frames):
        page = Page(index=i, text="", needs_ocr=True)
        if ocr is not None:
            page.text = clean_text(ocr.image_to_text(frame))
            page.ocr_applied = True
        pages.append(page)
    text = "\n\n".join(reflow(p.text) for p in pages if p.text.strip())
    doc = Document(kind="image", source=name, text=text, pages=pages)
    doc.metadata["size"] = frames[0].size
    doc.metadata["page_count"] = len(pages)
    doc.metadata["ocr_pages"] = sum(1 for p in pages if p.ocr_applied)
    doc.metadata["pending_ocr_pages"] = sum(1 for p in pages if not p.ocr_applied)
    return doc
