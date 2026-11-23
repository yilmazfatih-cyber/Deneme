"""Programla üretilen örnek görüntüler: şekil kümesi (sınıflandırma/arama) ve rastgele sahneler (özetler).

Kim kullanır: `ornek-veri` komutu, testler, ağlı duman testi. Depoya görüntü konmaz; her şey tohumlu
rastgelelikle burada üretilir (aynı tohum → aynı pikseller).

- `shape_image`  : açık renkli, hafif gürültülü zemin üstünde tek bir şekil (daire / kare / üçgen);
                   renk, boyut, konum ve açı çeşitlenir. Sınıf = şekil; renk dosya adında yazar.
- `scene_image`  : renk geçişli zemin + birçok rastgele şekil + gürültü: birbirinden belirgin farklı,
                   "doğal" dokulu görüntüler (algısal özet testleri için).
- `write_shape_dataset` : `kok/<sınıf>/<renk>_<sıra>.jpg` klasör yapısında veri kümesi yazar;
                   istenirse bazı görüntülerin yakın kopyalarını (küçültülmüş + yeniden sıkıştırılmış)
                   ekler ki kopya-farkında ayrım gösterilebilsin.

Genişletme: yeni sınıf için `SHAPES` ve `_draw_shape` içine dal ekleyin; yeni renk için `COLORS`.
"""

from __future__ import annotations

import io
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from goruntu.hazirlik.loader import load_rgb

SHAPES = ("daire", "kare", "üçgen")
SHAPES_EN = {"daire": "circle", "kare": "square", "üçgen": "triangle"}
COLORS: dict[str, tuple[int, int, int]] = {
    "kirmizi": (210, 40, 45),
    "yesil": (40, 160, 70),
    "mavi": (45, 85, 215),
    "sari": (235, 195, 35),
}
COLORS_TR = {"kirmizi": "kırmızı", "yesil": "yeşil", "mavi": "mavi", "sari": "sarı"}
COLORS_EN = {"kirmizi": "red", "yesil": "green", "mavi": "blue", "sari": "yellow"}


def _noise(rng: np.random.Generator, shape: tuple[int, int, int], scale: float) -> np.ndarray:
    return rng.normal(0.0, scale, size=shape)


def _polygon(center: tuple[float, float], radius: float, sides: int, angle: float) -> list[float]:
    points: list[float] = []
    for index in range(sides):
        theta = angle + 2 * math.pi * index / sides
        points += [center[0] + radius * math.cos(theta), center[1] + radius * math.sin(theta)]
    return points


def _draw_shape(
    draw: ImageDraw.ImageDraw,
    shape: str,
    center: tuple[float, float],
    radius: float,
    angle: float,
    fill: tuple[int, int, int],
) -> None:
    if shape == "daire":
        box = (center[0] - radius, center[1] - radius, center[0] + radius, center[1] + radius)
        draw.ellipse(box, fill=fill)
    elif shape == "kare":
        draw.polygon(_polygon(center, radius * 1.15, 4, angle), fill=fill)
    elif shape == "üçgen":
        draw.polygon(_polygon(center, radius * 1.25, 3, angle), fill=fill)
    else:
        raise ValueError(f"bilinmeyen şekil: {shape}")


def shape_image(shape: str, color: str, rng: np.random.Generator, size: int = 128) -> Image.Image:
    """Tek şekilli görüntü; iki kat büyük çizilip küçültülür (kenarlar yumuşak)."""
    big = size * 2
    base = rng.integers(205, 250, size=3)
    canvas = np.clip(base + _noise(rng, (big, big, 3), 6.0), 0, 255).astype(np.uint8)
    image = Image.fromarray(canvas, mode="RGB")
    jitter = rng.integers(-25, 26, size=3)
    fill = tuple(int(v) for v in np.clip(np.asarray(COLORS[color]) + jitter, 0, 255))
    radius = big * float(rng.uniform(0.18, 0.34))
    margin = radius * 1.3
    center = (float(rng.uniform(margin, big - margin)), float(rng.uniform(margin, big - margin)))
    angle = float(rng.uniform(0, 2 * math.pi))
    _draw_shape(ImageDraw.Draw(image), shape, center, radius, angle, fill)  # type: ignore[arg-type]
    return image.resize((size, size), Image.Resampling.LANCZOS)


def scene_image(rng: np.random.Generator, size: tuple[int, int] = (256, 192)) -> Image.Image:
    """Birbirinden farklı, dokulu sahne: geçişli zemin + 8-14 rastgele şekil + gürültü."""
    width, height = size
    start, end = rng.integers(0, 256, size=3), rng.integers(0, 256, size=3)
    ramp = np.linspace(0.0, 1.0, width)[None, :, None]
    background = start + (end - start) * ramp
    canvas = np.broadcast_to(background, (height, width, 3)).astype(np.float64)
    image = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), mode="RGB")
    draw = ImageDraw.Draw(image)
    for _ in range(int(rng.integers(8, 15))):
        fill = tuple(int(v) for v in rng.integers(0, 256, size=3))
        x0, x1 = sorted(rng.integers(0, width, size=2).tolist())
        y0, y1 = sorted(rng.integers(0, height, size=2).tolist())
        kind = int(rng.integers(0, 3))
        if kind == 0:
            draw.ellipse((x0, y0, x1 + 4, y1 + 4), fill=fill)  # type: ignore[arg-type]
        elif kind == 1:
            draw.rectangle((x0, y0, x1 + 4, y1 + 4), fill=fill)  # type: ignore[arg-type]
        else:
            draw.line((x0, y0, x1, y1), fill=fill, width=int(rng.integers(2, 9)))  # type: ignore[arg-type]
    noisy = np.asarray(image, dtype=np.float64) + _noise(rng, (height, width, 3), 4.0)
    return Image.fromarray(np.clip(noisy, 0, 255).astype(np.uint8), mode="RGB")


def near_copy(image: Image.Image, scale: float = 0.6, quality: int = 70) -> Image.Image:
    """Yakın kopya: küçültülmüş ve JPEG olarak yeniden sıkıştırılmış hâl."""
    width, height = image.size
    small = image.resize((max(8, int(width * scale)), max(8, int(height * scale))))
    buffer = io.BytesIO()
    small.save(buffer, "JPEG", quality=quality)
    return load_rgb(buffer.getvalue())


def write_shape_dataset(
    root: Path,
    per_class: int = 30,
    seed: int = 0,
    size: int = 128,
    copies: float = 0.0,
    shapes: tuple[str, ...] = SHAPES,
) -> dict[str, int]:
    """`kok/<şekil>/<renk>_<sıra>.jpg` yazar; `copies` oranında yakın kopya ekler. Sayıları döndürür."""
    rng = np.random.default_rng(seed)
    counts: dict[str, int] = {}
    colors = list(COLORS)
    for shape in shapes:
        folder = root / shape
        folder.mkdir(parents=True, exist_ok=True)
        written = 0
        for index in range(per_class):
            color = colors[index % len(colors)]
            image = shape_image(shape, color, rng, size)
            image.save(folder / f"{color}_{index:04d}.jpg", "JPEG", quality=92)
            written += 1
            if copies > 0 and rng.random() < copies:
                near_copy(image).save(folder / f"{color}_{index:04d}_kopya.jpg", "JPEG", quality=80)
                written += 1
        counts[shape] = written
    return counts
