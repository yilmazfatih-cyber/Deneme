"""Boyutlandırma: en-boy oranını koruyarak sığdır / kırp / doldur / kısa kenar; küçük resim.

Kim kullanır: `hazirla` komutu (`hazirlik/batch.py`) ve sunucunun küçük resimleri.
Model girdisi BURADAN üretilmez: o iş `model_input.py`'nindir (eğitimdeki timm dönüşümüyle birebir).

Kipler (`kutu` = hedef genişlik × yükseklik):
- `sigdir`     : görüntünün tamamı kutuya sığar (biri tam oturur, öteki kısa kalır). Kırpma yok.
- `kirp`       : kutuyu tamamen doldurur, taşan kısım ORTADAN kırpılır (ürün ızgarası, küçük resim).
- `doldur`     : `sigdir` + kalan yer `dolgu` rengiyle doldurulur; çıktı tam kutu boyutundadır.
- `kisa-kenar` : kısa kenar `kutu[0]` olur, öteki orantılı.
Varsayılan olarak BÜYÜTME YOK (`buyut=False`): küçük görüntü şişirilip bulanıklaştırılmaz.
Küçültmede LANCZOS kullanılır (en keskin, örtüşmesiz).

Genişletme: yeni bir kip için `FitMode`'a ad ekleyin, `resize_image` içine dal yazın ve
`tests/test_resize.py` içine boyut beklentisini ekleyin.
"""

from __future__ import annotations

from typing import Literal

from PIL import Image

FitMode = Literal["sigdir", "kirp", "doldur", "kisa-kenar"]
FIT_MODES: tuple[str, ...] = ("sigdir", "kirp", "doldur", "kisa-kenar")


def _scaled(size: tuple[int, int], scale: float) -> tuple[int, int]:
    return max(1, round(size[0] * scale)), max(1, round(size[1] * scale))


def _resize(image: Image.Image, target: tuple[int, int]) -> Image.Image:
    if target == image.size:
        return image.copy()
    return image.resize(target, Image.Resampling.LANCZOS)


def _center_box(size: tuple[int, int], crop: tuple[int, int]) -> tuple[int, int, int, int]:
    left = (size[0] - crop[0]) // 2
    top = (size[1] - crop[1]) // 2
    return left, top, left + crop[0], top + crop[1]


def resize_image(
    image: Image.Image,
    box: tuple[int, int],
    mode: FitMode = "sigdir",
    *,
    upscale: bool = False,
    fill: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Görüntüyü `box` = (genişlik, yükseklik) kutusuna göre boyutlandırır (yeni görüntü döner)."""
    width, height = image.size
    box_w, box_h = box
    if box_w < 1 or box_h < 1:
        raise ValueError("kutu boyutu en az 1 piksel olmalı")
    if mode == "kisa-kenar":
        scale = box_w / min(width, height)
        return _resize(image, _scaled(image.size, scale if upscale else min(scale, 1.0)))
    if mode == "kirp":
        scale = max(box_w / width, box_h / height)
        if not upscale and scale > 1.0:
            # Büyütmeden kırp: kutunun en-boy oranında, görüntüye sığan en büyük orta parça.
            ratio = box_w / box_h
            crop = (width, max(1, round(width / ratio)))
            if crop[1] > height:
                crop = (max(1, round(height * ratio)), height)
            return image.crop(_center_box(image.size, crop))
        resized = _resize(image, _cover_size(image.size, box))
        return resized.crop(_center_box(resized.size, box))
    scale = min(box_w / width, box_h / height)
    fitted = _resize(image, _scaled(image.size, scale if upscale else min(scale, 1.0)))
    if mode == "sigdir":
        return fitted
    canvas_mode = "RGBA" if fitted.mode == "RGBA" else "RGB"
    color = (*fill, 0) if canvas_mode == "RGBA" else fill
    canvas = Image.new(canvas_mode, box, color)
    canvas.paste(fitted, ((box_w - fitted.width) // 2, (box_h - fitted.height) // 2))
    return canvas


def _cover_size(size: tuple[int, int], box: tuple[int, int]) -> tuple[int, int]:
    """Kutuyu kaplayan en küçük boyut; yuvarlama yüzünden kutudan küçük kalmaz."""
    scale = max(box[0] / size[0], box[1] / size[1])
    width, height = _scaled(size, scale)
    return max(width, box[0]), max(height, box[1])


def thumbnail(image: Image.Image, edge: int) -> Image.Image:
    """Kare küçük resim: ortadan kırpılır (ürün ızgaraları için). Büyütme yapılmaz."""
    return resize_image(image, (edge, edge), "kirp")
