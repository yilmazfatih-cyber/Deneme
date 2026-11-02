from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class OCREngine(Protocol):
    name: str

    def image_to_text(self, image) -> str:  # PIL.Image.Image -> str
        ...


class NullOCR:
    """OCR yapmaz; yalnızca kaç kez çağrıldığını sayar (testler ve 'OCR kapalı' modu)."""

    name = "none"

    def __init__(self) -> None:
        self.calls = 0

    def image_to_text(self, image) -> str:
        self.calls += 1
        return ""


def build_ocr(spec: str, device: str = "cpu", **kwargs):
    """``spec``'e göre motor kurar: ``"none"``, ``"rapid[:dil]"``, ``"tesseract"``, bir PaddleOCR-VL kimliği ya da bir Docling VLM kimliği."""
    spec = (spec or "none").strip()
    if spec.lower() in ("none", "off", "kapali", "kapalı", ""):
        return NullOCR()
    if spec.lower() == "tesseract":
        from .tesseract import TesseractOCR

        kwargs.pop("device", None)
        return TesseractOCR(**kwargs)
    if spec.lower().startswith(("rapid", "rapidocr")):
        from .rapid import RapidOCREngine

        # "rapid" -> latin (Türkçe), "rapid:en", "rapid:ch" gibi
        lang = spec.split(":", 1)[1] if ":" in spec else "latin"
        kwargs.pop("device", None)
        return RapidOCREngine(lang=lang, **kwargs)
    if "paddleocr-vl" in spec.lower() or "paddleocr_vl" in spec.lower():
        from .paddle_vl import PaddleOCRVLEngine

        return PaddleOCRVLEngine(model_id=spec, device=device, **kwargs)
    from .docling_vlm import DoclingVLMOCR

    return DoclingVLMOCR(model_id=spec, device=device, **kwargs)
