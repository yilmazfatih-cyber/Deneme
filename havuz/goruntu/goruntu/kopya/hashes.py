"""Algısal özetler (perceptual hash): aHash, dHash, pHash — 64 bitlik tam sayı olarak.

Kim kullanır: `kopya/scan.py`, eğitimdeki kopya-farkında ayrım, `kopya-bul` ve `sizinti` komutları.

Algoritmalar (hepsi gri tonlu görüntüde; gri ton Pillow'un "L" çevrimi = ITU-R 601-2):
- aHash: 8×8'e küçült; her piksel ortalamadan büyükse 1.
- dHash: 9×8'e küçült; her satırda sağdaki piksel soldakinden büyükse 1 (yatay eğim).
- pHash: 32×32'ye küçült; 2 boyutlu DCT-II; sol üstteki 8×8 düşük frekans katsayısı; medyandan
  büyükse 1. Boyutlandırma ve JPEG sıkıştırmasına en dayanıklı olanı budur.
Küçültme LANCZOS'la yapılır. Bit sırası satır öncelikli, ilk bit en anlamlı bittir: 16'lık gösterim
yaygın `imagehash` kütüphanesiyle aynıdır (`tests/test_hashes.py` birebir karşılaştırır), yani başka
araçların ürettiği özetlerle karşılaştırılabilir.
DCT, ölçeksiz DCT-II matrisiyle (C[k, n] = cos(π k (2n+1) / 2N)) iki matris çarpımıdır; ölçek medyana
göre eşiklemeyi değiştirmez. Testte kaba kuvvet (dörtlü toplam) DCT ile karşılaştırılır.

Özetler döndürmeye/aynalamaya DAYANIKLI DEĞİLDİR (bkz. README Sınırlar).

Genişletme: yeni özet için `def yeni_hash(image) -> int` yazıp `HASHERS` sözlüğüne ekleyin; testte
aynı görüntünün değiştirilmiş kopyalarıyla uzaklığını ölçün.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import lru_cache

import numpy as np
from PIL import Image

HASH_BITS = 64
_SIDE = 8


def bits_to_int(bits: np.ndarray) -> int:
    """Bool dizisini (satır öncelikli) tam sayıya çevirir; ilk öğe en anlamlı bit."""
    value = 0
    for bit in bits.ravel():
        value = (value << 1) | int(bool(bit))
    return value


def to_hex(value: int) -> str:
    """64 bitlik özeti 16 karakterlik onaltılık metne çevirir (imagehash `str()` biçimi)."""
    return f"{value:016x}"


def from_hex(text: str) -> int:
    return int(text, 16)


def _gray(image: Image.Image, size: tuple[int, int]) -> np.ndarray:
    return np.asarray(image.convert("L").resize(size, Image.Resampling.LANCZOS), dtype=np.float64)


def ahash(image: Image.Image) -> int:
    pixels = _gray(image, (_SIDE, _SIDE))
    return bits_to_int(pixels > pixels.mean())


def dhash(image: Image.Image) -> int:
    pixels = _gray(image, (_SIDE + 1, _SIDE))
    return bits_to_int(pixels[:, 1:] > pixels[:, :-1])


@lru_cache(maxsize=4)
def dct_matrix(size: int) -> np.ndarray:
    """Ölçeksiz DCT-II matrisi: C[k, n] = cos(π · k · (2n + 1) / (2 · size))."""
    k = np.arange(size, dtype=np.float64)[:, None]
    n = np.arange(size, dtype=np.float64)[None, :]
    return np.cos(np.pi * k * (2.0 * n + 1.0) / (2.0 * size))


def dct2(block: np.ndarray) -> np.ndarray:
    """2 boyutlu DCT-II (önce sütunlar, sonra satırlar): C · X · Cᵀ (ölçek çarpanı 4 hariç)."""
    rows = dct_matrix(block.shape[0])
    cols = dct_matrix(block.shape[1])
    return np.asarray(rows @ block @ cols.T)


def phash(image: Image.Image) -> int:
    pixels = _gray(image, (_SIDE * 4, _SIDE * 4))
    low = dct2(pixels)[:_SIDE, :_SIDE]
    return bits_to_int(low > np.median(low))


HASHERS: dict[str, Callable[[Image.Image], int]] = {
    "phash": phash,
    "dhash": dhash,
    "ahash": ahash,
    # YENİ ÖZET BURAYA
}
HASH_NAMES = tuple(HASHERS)


def hamming(left: int, right: int) -> int:
    """İki 64 bitlik özet arasındaki farklı bit sayısı."""
    return (left ^ right).bit_count()


def as_array(values: list[int]) -> np.ndarray:
    """Özet listesini toplu Hamming hesabı için uint64 dizisine çevirir."""
    return np.asarray(values, dtype=np.uint64)
