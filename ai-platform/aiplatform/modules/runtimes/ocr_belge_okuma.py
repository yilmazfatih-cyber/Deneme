"""N01 OCR Belge Okuma — PaddleOCR-VL (sunucu) → yoksa Tesseract `tur+eng` (istemci) → yoksa ModuleNotReady.

PDF'ler pypdfium2 ile sayfa görüntüsüne çevrilir (Tesseract yolu). `pages` "1-3,5" biçimindedir (1 tabanlı).
"""

from __future__ import annotations

import asyncio
import io
import tempfile
from pathlib import Path

from ...runtimes import model_dir
from ...runtimes.lazy import LazyModel
from ..base import register
from ._common import BaseRuntime, ModuleError, ModuleNotReady, RunContext, get_file, has_package, is_pdf, note

PADDLE_MODEL = "paddleocr-vl-1.6"
MAX_PAGES = 50


def parse_pages(spec: str | None, n: int) -> list[int]:
    if not spec:
        return list(range(min(n, MAX_PAGES)))
    out: list[int] = []
    for part in str(spec).split(","):
        part = part.strip()
        if not part:
            continue
        try:
            if "-" in part:
                a, b = (int(x) for x in part.split("-", 1))
                out.extend(range(a - 1, min(b, n)))
            else:
                out.append(int(part) - 1)
        except ValueError as e:
            raise ModuleError(f"Geçersiz sayfa aralığı: '{spec}' (ör. 1-3,5)") from e
    pages = sorted({p for p in out if 0 <= p < n})
    if not pages:
        raise ModuleError("Seçilen sayfa aralığı belgede yok")
    return pages[:MAX_PAGES]


def pdf_images(data: bytes, pages_spec: str | None):
    if not has_package("pypdfium2"):
        raise ModuleNotReady("'pypdfium2' kurulu değil — modül mağazasından 'pdf-ayristirma' kurun")
    import pypdfium2 as pdfium

    pdf = pdfium.PdfDocument(data)
    try:
        idx = parse_pages(pages_spec, len(pdf))
        return [(i + 1, pdf[i].render(scale=2.0).to_pil()) for i in idx]
    finally:
        pdf.close()


def tesseract_read(data: bytes, pages_spec: str | None) -> list[dict]:
    import pytesseract
    from PIL import Image

    images = pdf_images(data, pages_spec) if is_pdf(data) else [(1, Image.open(io.BytesIO(data)))]
    try:
        return [{"page": n, "text": pytesseract.image_to_string(img, lang="tur+eng")} for n, img in images]
    except pytesseract.TesseractNotFoundError as e:
        raise ModuleNotReady(
            "Tesseract programı kurulu değil (apt install tesseract-ocr tesseract-ocr-tur)"
        ) from e


def _load_paddle():  # pragma: no cover - paddleocr yok
    from paddleocr import PaddleOCRVL

    path = model_dir(PADDLE_MODEL)
    if path is not None:
        try:
            return PaddleOCRVL(vl_rec_model_dir=str(path))
        except TypeError:
            pass
    return PaddleOCRVL()


_PADDLE = LazyModel(_load_paddle, "paddleocr-vl")


def paddle_read(data: bytes, pages_spec: str | None) -> list[dict]:  # pragma: no cover - paddleocr yok
    pipe = _PADDLE.get()
    with tempfile.TemporaryDirectory(prefix="aip_ocr_") as tmp:
        src = Path(tmp) / ("girdi.pdf" if is_pdf(data) else "girdi.png")
        src.write_bytes(data)
        out_dir = Path(tmp) / "cikti"
        results = pipe.predict(str(src))
        pages = []
        for i, res in enumerate(results, 1):
            page_dir = out_dir / str(i)
            res.save_to_markdown(save_path=str(page_dir))
            text = "\n".join(p.read_text(encoding="utf-8") for p in sorted(page_dir.rglob("*.md")))
            pages.append({"page": i, "text": text})
    if pages_spec:
        wanted = set(parse_pages(pages_spec, len(pages)))
        pages = [p for p in pages if p["page"] - 1 in wanted]
    return pages


def paddle_ready() -> bool:
    return has_package("paddleocr")


def tesseract_ready() -> bool:
    return has_package("pytesseract") and has_package("PIL")


@register("ocr-belge-okuma")
class OcrBelgeOkuma(BaseRuntime):
    requires = ()

    async def do_read(self, payload: dict, ctx: RunContext) -> dict:
        data = get_file(payload, ctx, "file")
        pages_spec = payload.get("pages")
        engine_pref = payload.get("engine")
        pages = None
        engine = None
        if paddle_ready() and engine_pref != "tesseract":
            try:  # pragma: no cover
                pages = await asyncio.to_thread(paddle_read, data, pages_spec)
                engine = "paddleocr-vl"
            except ModuleError:
                raise
            except Exception as e:  # pragma: no cover
                note(ctx, paddle_error=str(e)[:200])
        if pages is None:
            if not tesseract_ready():
                raise ModuleNotReady(
                    "OCR motoru kurulu değil ('paddleocr' veya 'pytesseract') — modül mağazasından "
                    "'ocr-belge-okuma' kurun"
                )
            pages = await asyncio.to_thread(tesseract_read, data, pages_spec)
            engine = "tesseract"
        note(ctx, engine=engine, model=PADDLE_MODEL if engine == "paddleocr-vl" else "tesseract-tur")
        markdown = "\n\n".join(f"<!-- sayfa {p['page']} -->\n{p['text'].strip()}" for p in pages)
        return {"pages": pages, "markdown": markdown, "engine": engine}

    async def health(self) -> dict:
        eng = "paddleocr-vl" if paddle_ready() else ("tesseract" if tesseract_ready() else None)
        return {"module": self.module_id, "ready": eng is not None, "engine": eng}
