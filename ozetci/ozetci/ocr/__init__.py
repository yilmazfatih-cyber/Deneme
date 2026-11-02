"""OCR motorları. Hepsi :class:`OCREngine` protokolünü uygular: ``image_to_text(PIL.Image) -> str``."""

from .base import OCREngine, NullOCR, build_ocr

__all__ = ["OCREngine", "NullOCR", "build_ocr"]
