"""RapidOCR motoru: paket kuruluysa sentetik görüntüde ASCII metni okumalı (Türkçe harf testi modele bağlı)."""

import pytest


from ozetci.ocr import build_ocr


def _has_rapid():
    for mod in ("rapidocr", "rapidocr_onnxruntime"):
        try:
            __import__(mod)
            return True
        except ImportError:
            continue
    return False


@pytest.mark.slow
@pytest.mark.skipif(not _has_rapid(), reason="rapidocr kurulu değil")
def test_rapid_reads_synthetic_invoice():
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGB", (700, 160), "white")
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 32)
    except OSError:
        pytest.skip("yazı tipi yok")
    d = ImageDraw.Draw(img)
    d.text((20, 20), "FATURA NO 2025", fill="black", font=font)
    d.text((20, 80), "Tutar 1250 TL", fill="black", font=font)
    ocr = build_ocr("rapid")
    text = ocr.image_to_text(img)
    assert "2025" in text and "1250" in text
    assert text.index("2025") < text.index("1250")  # üstten alta sıra
