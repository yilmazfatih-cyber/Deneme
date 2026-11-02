"""Klasik OCR yedeği. Sistemde ``tesseract`` ve ``tur`` dil paketi kurulu olmalı.

Sinir ağı tabanlı belge modeli (Granite-Docling) okuma sırasını ve tabloları daha iyi
korur; tesseract ise bağımlılığı az, hızlı ve "yeter ki okusun" durumları için.
"""

from __future__ import annotations

from ..textutil import clean_text


class TesseractOCR:
    name = "tesseract"

    def __init__(self, lang: str = "tur+eng", psm: int = 6) -> None:
        import pytesseract

        pytesseract.get_tesseract_version()  # ikili yoksa burada TesseractNotFoundError: pipeline yedeğe düşer
        self.lang = lang
        self.psm = psm

    def image_to_text(self, image) -> str:
        import pytesseract

        try:
            text = pytesseract.image_to_string(image, lang=self.lang, config=f"--psm {self.psm}")
        except pytesseract.TesseractError:  # 'tur' dil paketi yoksa
            text = pytesseract.image_to_string(image, lang="eng", config=f"--psm {self.psm}")
        return clean_text(text)
