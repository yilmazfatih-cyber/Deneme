"""Algısal özet testleri: imagehash ile birebir aynı sonuç, DCT'nin kaba kuvvet karşılaştırması, kopya
yakalama (boyutlandırılmış / sıkıştırılmış / hafif kırpılmış) ve farklı görüntülerin ayrılması."""

from __future__ import annotations

import imagehash
import numpy as np
import pytest
from PIL import Image

from goruntu.hazirlik.loader import load_rgb
from goruntu.kopya.groups import distances
from goruntu.kopya.hashes import (
    ahash,
    bits_to_int,
    dct2,
    dhash,
    from_hex,
    hamming,
    phash,
    to_hex,
)
from goruntu.kopya.scan import DEFAULT_THRESHOLDS, image_hashes
from goruntu.synthetic import scene_image, shape_image
from tests.conftest import encode

REFERENCE = {
    "phash": (phash, imagehash.phash),
    "dhash": (dhash, imagehash.dhash),
    "ahash": (ahash, imagehash.average_hash),
}


def _scenes(count: int, seed: int = 11) -> list[Image.Image]:
    rng = np.random.default_rng(seed)
    return [scene_image(rng, (320, 240)) for _ in range(count)]


@pytest.mark.parametrize("name", sorted(REFERENCE))
def test_imagehash_ile_birebir(name: str) -> None:
    ours, theirs = REFERENCE[name]
    rng = np.random.default_rng(5)
    images = _scenes(10) + [shape_image("kare", "mavi", rng, 96) for _ in range(5)]
    for image in images:
        assert to_hex(ours(image)) == str(theirs(image))


def test_dct_kaba_kuvvetle_ayni() -> None:
    block = np.random.default_rng(0).random((8, 8))
    n = np.arange(8)
    expected = np.zeros((8, 8))
    for k in range(8):
        for m in range(8):
            basis = np.outer(
                np.cos(np.pi * k * (2 * n + 1) / 16), np.cos(np.pi * m * (2 * n + 1) / 16)
            )
            expected[k, m] = (block * basis).sum()
    assert np.allclose(dct2(block), expected)


def test_bit_sirasi_ve_onaltilik() -> None:
    bits = np.zeros((8, 8), dtype=bool)
    bits[0, 0] = True
    value = bits_to_int(bits)
    assert value == 1 << 63 and to_hex(value) == "8000000000000000"
    assert from_hex(to_hex(value)) == value and hamming(value, 0) == 1


def _jpeg(image: Image.Image, quality: int) -> Image.Image:
    return load_rgb(encode(image, "JPEG", quality=quality))


def _crop(image: Image.Image, fraction: float) -> Image.Image:
    dx, dy = int(image.width * fraction), int(image.height * fraction)
    return image.crop((dx, dy, image.width - dx, image.height - dy))


COPIES = {
    "kucultulmus": lambda im: im.resize((im.width // 2, im.height // 2), Image.Resampling.BILINEAR),
    "sikistirilmis": lambda im: _jpeg(im, 40),
    "kirpilmis_3": lambda im: _crop(im, 0.03),
    "kirpilmis_8": lambda im: _crop(im, 0.08),
    "hepsi_birden": lambda im: _jpeg(
        _crop(im.resize((im.width * 2 // 3, im.height * 2 // 3)), 0.05), 70
    ),
}


@pytest.mark.parametrize("kind", sorted(COPIES))
def test_kopyalar_yakalanir(kind: str) -> None:
    threshold = DEFAULT_THRESHOLDS["phash"]
    for image in _scenes(12):
        original = np.asarray([image_hashes(image)], dtype=np.uint64)
        copy = np.asarray([image_hashes(COPIES[kind](image))], dtype=np.uint64)
        assert distances(original, copy)[0, 0] <= threshold, kind


def test_farkli_goruntuler_ayrilir() -> None:
    images = _scenes(40, seed=21)
    matrix = np.asarray([image_hashes(image) for image in images], dtype=np.uint64)
    table = distances(matrix, matrix).astype(int)
    np.fill_diagonal(table, 64)
    assert table.min() > DEFAULT_THRESHOLDS["phash"]


def test_tek_ozet_kirpmada_yetersiz_kalir() -> None:
    """Belgedeki iddianın kanıtı: tek pHash %8 kırpmayı çoğu kez kaçırır; kırpma varyantları yakalar."""
    missed = 0
    for image in _scenes(12):
        missed += hamming(phash(image), phash(_crop(image, 0.08))) > DEFAULT_THRESHOLDS["phash"]
    assert missed >= 6
