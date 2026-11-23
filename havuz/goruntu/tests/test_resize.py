"""Boyutlandırma testleri: dört kip, büyütmeme kuralı, dolgu, küçük resim."""

from __future__ import annotations

import pytest
from PIL import Image

from goruntu.hazirlik.resize import resize_image, thumbnail


def _image(width: int, height: int, mode: str = "RGB") -> Image.Image:
    return Image.new(mode, (width, height), (10, 200, 30) if mode == "RGB" else (10, 200, 30, 255))


@pytest.mark.parametrize(
    ("size", "box", "mode", "expected"),
    [
        ((400, 200), (100, 100), "sigdir", (100, 50)),
        ((200, 400), (100, 100), "sigdir", (50, 100)),
        ((400, 200), (100, 100), "kirp", (100, 100)),
        ((400, 200), (100, 100), "doldur", (100, 100)),
        ((400, 200), (100, 100), "kisa-kenar", (200, 100)),
        ((300, 300), (120, 80), "kirp", (120, 80)),
        ((50, 40), (100, 100), "sigdir", (50, 40)),  # büyütme yok
        ((50, 40), (100, 100), "kisa-kenar", (50, 40)),
        ((50, 40), (100, 100), "doldur", (100, 100)),  # tuval kutu boyutunda, görüntü ortada
        ((50, 40), (100, 100), "kirp", (40, 40)),  # büyütmeden kutunun oranında orta parça
    ],
)
def test_kipler(
    size: tuple[int, int], box: tuple[int, int], mode: str, expected: tuple[int, int]
) -> None:
    assert resize_image(_image(*size), box, mode).size == expected  # type: ignore[arg-type]


def test_buyutme_istenirse() -> None:
    assert resize_image(_image(50, 40), (100, 100), "sigdir", upscale=True).size == (100, 80)


def test_doldur_kenarlari_dolgu_rengiyle() -> None:
    result = resize_image(_image(400, 200), (100, 100), "doldur", fill=(255, 255, 255))
    assert result.getpixel((50, 2)) == (255, 255, 255)
    assert result.getpixel((50, 50)) == (10, 200, 30)


def test_saydam_dolgu_saydam_kalir() -> None:
    result = resize_image(_image(400, 200, "RGBA"), (100, 100), "doldur")
    assert result.mode == "RGBA" and result.getpixel((50, 2))[3] == 0  # type: ignore[index]


def test_kucuk_resim_kare() -> None:
    assert thumbnail(_image(640, 480), 128).size == (128, 128)


def test_gecersiz_kutu() -> None:
    with pytest.raises(ValueError):
        resize_image(_image(10, 10), (0, 10))
