"""Klasör tarama: görüntü dosyalarını bulur, güvenle açar, kırpma varyantlı algısal özet çıkarır.

Kim kullanır: `kopya-bul`, `sizinti` komutları ve eğitim verisinin kopya-farkında ayrımı.

Dosya bulma kuralları (`list_images`):
- Uzantı büyük/küçük harf duyarsız: .jpg .jpeg .png .webp .gif .bmp .tif(f) .avif; .heic/.heif de
  listelenir ki "desteklenmiyor" diye RAPORLANSIN (sessizce kaybolmasın).
- Gizli dosya ve klasörler (`.` ile başlayan), macOS'un `._dosya` kopyaları ve `__MACOSX` atlanır.
- Sıra belirlenimcidir (yola göre sıralı).
Özet: her görüntüden `CROP_SCALES` oranlarında merkez kırpma alınır, her birinin özeti çıkarılır
(0. sütun görüntünün tamamı). Hafif kırpılmış kopyalar böyle yakalanır (`groups.distances`).
JPEG'ler DCT düzeyinde küçültülerek çözülür (`draft`): özet için yeterli, büyük fotoğrafta ~10 kat hızlı.

Genişletme: yeni uzantı için `IMAGE_SUFFIXES`'e ekleyin (loader.ALLOWED_FORMATS da izin vermeli).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

from goruntu import console
from goruntu.errors import ImageRejectedError
from goruntu.hazirlik.loader import (
    DEFAULT_LIMITS,
    LoadLimits,
    decode,
    normalize_mode,
    open_checked,
    orientation_of,
)
from goruntu.kopya.hashes import HASHERS
from goruntu.messages import t
from goruntu.text_tr import lower_ascii

IMAGE_SUFFIXES = (
    ".jpg",
    ".jpeg",
    ".jpe",
    ".png",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".avif",
)
UNSUPPORTED_SUFFIXES = (".heic", ".heif")
CROP_SCALES = (1.0, 0.95, 0.9, 0.85, 0.8)
DEFAULT_THRESHOLDS = {"phash": 8, "dhash": 8, "ahash": 6}
_HASH_DRAFT = (128, 128)


@dataclass(frozen=True)
class ScannedImage:
    path: Path
    hashes: tuple[int, ...]
    width: int
    height: int
    size_bytes: int


@dataclass
class ScanResult:
    method: str
    images: list[ScannedImage] = field(default_factory=list)
    rejected: list[tuple[Path, str, str]] = field(default_factory=list)  # (yol, neden, ileti)

    def matrix(self) -> np.ndarray:
        """(n, k) uint64: satır görüntü, sütun kırpma varyantı."""
        if not self.images:
            return np.zeros((0, len(CROP_SCALES)), dtype=np.uint64)
        return np.asarray([image.hashes for image in self.images], dtype=np.uint64)


def _skipped(path: Path, root: Path) -> bool:
    parts = path.relative_to(root).parts
    return any(part.startswith(".") or part == "__MACOSX" for part in parts)


def list_images(root: Path, recursive: bool = True) -> list[Path]:
    """Klasördeki görüntü dosyaları (gizli dosyalar hariç), yola göre sıralı."""
    if root.is_file():
        return [root]
    if not root.is_dir():
        raise ImageRejectedError("klasor_yok", t("dosya.klasor_yok", yol=root))
    pattern = root.rglob("*") if recursive else root.glob("*")
    suffixes = IMAGE_SUFFIXES + UNSUPPORTED_SUFFIXES
    found = [
        path
        for path in pattern
        if path.is_file() and lower_ascii(path.suffix) in suffixes and not _skipped(path, root)
    ]
    return sorted(found, key=str)


def crop_variants(image: Image.Image, scales: tuple[float, ...] = CROP_SCALES) -> list[Image.Image]:
    """Merkezden `scales` oranlarında kırpılmış hâller (1.0 = görüntünün tamamı)."""
    width, height = image.size
    variants = []
    for scale in scales:
        crop_w, crop_h = max(1, round(width * scale)), max(1, round(height * scale))
        left, top = (width - crop_w) // 2, (height - crop_h) // 2
        variants.append(
            image if scale == 1.0 else image.crop((left, top, left + crop_w, top + crop_h))
        )
    return variants


def image_hashes(image: Image.Image, method: str = "phash") -> tuple[int, ...]:
    """Görüntünün kırpma varyantlı özetleri (CROP_SCALES sırasıyla)."""
    hasher = HASHERS[method]
    return tuple(hasher(variant) for variant in crop_variants(image))


def _scan_one(path: Path, method: str, limits: LoadLimits) -> ScannedImage:
    opened = open_checked(path, limits)
    width, height = opened.size  # gerçek boyut (draft küçültmesinden önce)
    if orientation_of(opened) in (5, 6, 7, 8):
        width, height = height, width
    image = normalize_mode(decode(opened, path.name, _HASH_DRAFT), name=path.name)
    return ScannedImage(path, image_hashes(image, method), width, height, path.stat().st_size)


def scan_files(
    paths: list[Path],
    method: str = "phash",
    limits: LoadLimits = DEFAULT_LIMITS,
    label: str = "",
) -> ScanResult:
    """Dosyaları açar ve özetler; açılamayanları nedeniyle `rejected` listesine yazar."""
    result = ScanResult(method)
    progress = console.Progress(label or t("kopya.taraniyor"), len(paths))
    for number, path in enumerate(paths, start=1):
        try:
            result.images.append(_scan_one(path, method, limits))
        except ImageRejectedError as exc:
            result.rejected.append((path, exc.reason, str(exc)))
        progress.step(number)
    return result
