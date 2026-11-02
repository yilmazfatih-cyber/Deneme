"""Dosya türünü uzantıdan (yoksa ilk baytlardan) tanıyıp uygun okuyucuya yönlendirir."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Union

from ..textutil import clean_text, reflow
from .base import Document

_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp", ".bmp", ".gif"}
_TEXT_EXT = {".txt", ".md", ".markdown", ".rst", ".csv", ".log"}
_HTML_EXT = {".html", ".htm"}


def sniff_kind(path: Union[str, Path]) -> str:
    p = Path(path)
    ext = p.suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext == ".eml":
        return "email"
    if ext == ".mbox":
        return "mbox"
    if ext in _IMAGE_EXT:
        return "image"
    if ext in _TEXT_EXT:
        return "text"
    if ext in _HTML_EXT:
        return "html"
    try:
        with open(p, "rb") as fh:
            head = fh.read(512)
    except OSError:
        return "unknown"
    if head.startswith(b"%PDF-"):
        return "pdf"
    if head.startswith(b"From ") and b"\n" in head:
        return "mbox"
    if head[:8] == b"\x89PNG\r\n\x1a\n" or head[:3] == b"\xff\xd8\xff" or head[:4] in (b"II*\x00", b"MM\x00*") or head[:4] == b"RIFF":
        return "image"
    low = head.lower()
    if b"from:" in low or b"subject:" in low or b"received:" in low:
        return "email"
    try:
        head.decode("utf-8")
        return "text"
    except UnicodeDecodeError:
        return "unknown"


def _decode_file(p: Path) -> str:
    data = p.read_bytes()
    for cs in ("utf-8-sig", "windows-1254", "latin-1"):
        try:
            return data.decode(cs)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def load_text(path: Union[str, Path]) -> Document:
    p = Path(path)
    return Document(kind="text", source=str(p), text=reflow(clean_text(_decode_file(p))), title=p.stem)


def load_html(path: Union[str, Path]) -> Document:
    from .email import html_to_text

    p = Path(path)
    return Document(kind="text", source=str(p), text=reflow(html_to_text(_decode_file(p))), title=p.stem)


def load_many(
    path: Union[str, Path],
    ocr=None,
    dpi: int = 170,
    max_pages: Optional[int] = None,
    password: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[Document]:
    """Bir yol için bir ya da daha çok belge döndürür (.mbox birden çok ileti içerir)."""
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(f"Dosya bulunamadı: {path}")
    kind = sniff_kind(p)
    if kind == "pdf":
        from .pdf import extract_pdf

        return [extract_pdf(p, ocr=ocr, dpi=dpi, max_pages=max_pages, password=password)]
    if kind == "email":
        from .email import extract_eml

        return [extract_eml(p, ocr=ocr, dpi=dpi)]
    if kind == "mbox":
        from .email import extract_mbox

        return extract_mbox(p, ocr=ocr, limit=limit, dpi=dpi)
    if kind == "image":
        from .image import extract_image

        return [extract_image(p, ocr=ocr)]
    if kind == "text":
        return [load_text(p)]
    if kind == "html":
        return [load_html(p)]
    raise ValueError(f"Desteklenmeyen dosya türü: {path}")


def load(path: Union[str, Path], ocr=None, **kwargs) -> Document:
    docs = load_many(path, ocr=ocr, **kwargs)
    if len(docs) == 1 and sniff_kind(path) != "mbox":
        return docs[0]
    # mbox: tüm iletileri tek belgede birleştir; her ileti "[İleti i/n]" diye etiketlenir (ek değildir)
    merged = Document(kind="mbox", source=str(path), title=f"{len(docs)} ileti")
    for i, d in enumerate(docs, 1):
        d.label = f"[İleti {i}/{len(docs)}: {d.title or '(konusuz)'}]"
    merged.children = docs
    merged.metadata["message_count"] = len(docs)
    return merged
