"""N02 PDF Ayrıştırma — Docling (düzen + tablolar → markdown); yoksa pdfplumber (metin + tablo).

`is_scanned`: metin katmanı boşsa True → OCR modülü önerilir.
"""

from __future__ import annotations

import asyncio
import io
import tempfile
from pathlib import Path

from ...runtimes.lazy import LazyModel
from ..base import register
from ._common import BaseRuntime, ModuleError, ModuleNotReady, RunContext, get_file, has_package, is_pdf, note


def _md_table(rows: list[list]) -> str:
    if not rows:
        return ""
    clean = [[("" if c is None else str(c).replace("\n", " ").replace("|", "\\|")) for c in r] for r in rows]
    width = max(len(r) for r in clean)
    clean = [r + [""] * (width - len(r)) for r in clean]
    lines = ["| " + " | ".join(clean[0]) + " |", "|" + "---|" * width]
    lines += ["| " + " | ".join(r) + " |" for r in clean[1:]]
    return "\n".join(lines)


def pdfplumber_parse(data: bytes) -> dict:
    import pdfplumber

    md_parts, tables, total_text = [], [], 0
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        for n, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""
            total_text += len(text.strip())
            md_parts.append(f"## Sayfa {n}\n\n{text.strip()}")
            for t in page.extract_tables() or []:
                if not t:
                    continue
                tables.append(
                    {"page": n, "columns": [str(c) if c is not None else "" for c in t[0]], "rows": t[1:]}
                )
                md_parts.append(_md_table(t))
        page_count = len(pdf.pages)
    return {
        "markdown": "\n\n".join(md_parts),
        "tables": tables,
        "is_scanned": total_text == 0,
        "pages": page_count,
    }


_DOCLING = LazyModel(
    lambda: __import__("docling.document_converter", fromlist=["DocumentConverter"]).DocumentConverter(),
    "docling",
)


def docling_parse(data: bytes, suffix: str) -> dict:  # pragma: no cover - docling yok
    conv = _DOCLING.get()
    with tempfile.TemporaryDirectory(prefix="aip_docling_") as tmp:
        src = Path(tmp) / f"belge{suffix}"
        src.write_bytes(data)
        res = conv.convert(str(src))
    doc = res.document
    md = doc.export_to_markdown()
    tables = []
    for t in getattr(doc, "tables", []) or []:
        try:
            df = t.export_to_dataframe(doc=doc)
        except TypeError:
            df = t.export_to_dataframe()
        tables.append({"columns": [str(c) for c in df.columns], "rows": df.astype(str).values.tolist()})
    is_scanned = None
    if suffix == ".pdf" and has_package("pdfplumber"):
        is_scanned = pdfplumber_parse(data)["is_scanned"]
    return {
        "markdown": md,
        "tables": tables,
        "is_scanned": bool(is_scanned) if is_scanned is not None else not md.strip(),
    }


def _suffix(data: bytes, name: str | None) -> str:
    if is_pdf(data):
        return ".pdf"
    if data[:2] == b"PK":
        if name and "." in name:
            return "." + name.rsplit(".", 1)[1].lower()
        return ".docx"
    if name and "." in name:
        return "." + name.rsplit(".", 1)[1].lower()
    raise ModuleError("Dosya türü tanınamadı (PDF, DOCX, XLSX, PPTX, HTML desteklenir)")


@register("pdf-ayristirma")
class PdfAyristirma(BaseRuntime):
    async def do_parse(self, payload: dict, ctx: RunContext) -> dict:
        data = get_file(payload, ctx, "file")
        suffix = _suffix(data, payload.get("filename"))
        if has_package("docling") and payload.get("engine") != "pdfplumber":
            try:  # pragma: no cover
                res = await asyncio.to_thread(docling_parse, data, suffix)
                note(ctx, engine="docling")
                return res
            except Exception as e:  # pragma: no cover
                note(ctx, docling_error=str(e)[:200])
        if suffix != ".pdf":
            raise ModuleNotReady(
                "'docling' kurulu değil — modül mağazasından 'pdf-ayristirma' kurun (PDF dışı belgeler için)"
            )
        if not has_package("pdfplumber"):
            raise ModuleNotReady(
                "'docling' ve 'pdfplumber' kurulu değil — modül mağazasından 'pdf-ayristirma' kurun"
            )
        res = await asyncio.to_thread(pdfplumber_parse, data)
        note(ctx, engine="pdfplumber")
        if res["is_scanned"]:
            note(ctx, hint="Belge taranmış; metin için 'ocr-belge-okuma' modülünü kullanın")
        return res

    async def health(self) -> dict:
        eng = "docling" if has_package("docling") else ("pdfplumber" if has_package("pdfplumber") else None)
        return {"module": self.module_id, "ready": eng is not None, "engine": eng}
