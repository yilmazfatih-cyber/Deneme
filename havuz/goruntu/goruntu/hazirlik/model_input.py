"""Modele giren dizinin TEK tanımı: RGB görüntü → uint8 dizi (yükseklik × genişlik × 3).

Kim kullanır: eğitimdeki değerlendirme (`siniflandirma/data.py`), ONNX çıkarımı
(`disa_aktar/runtime.py`), sunucu ve gömme değerlendirmesi. torch İSTEMEZ.

Neden tek tanım: "eğitimde iyi, uygulamada kötü" hatalarının en sık nedeni ön işleme farkıdır (başka
boyutlandırma filtresi, başka kırpma, ortalama/sapma unutmak). Burada:
- Boyutlandırma + kırpma timm'in değerlendirme dönüşümüyle BİREBİR aynıdır (kısa kenar
  `floor(boyut / crop_pct)`, torchvision'ın yuvarlama kuralıyla; ortadan kırpma; Pillow filtresi).
  Kanıt: `tests/test_model_input.py` timm'in kendi dönüşümüyle karşılaştırır.
- Normalleştirme (÷255, −ortalama, ÷sapma) BURADA YAPILMAZ: modelin içindedir (ONNX grafiğinde de).
  Böylece uygulama yalnız uint8 piksel verir; ortalama/sapma yanlış girilemez.

Genişletme: yeni bir kırpma kipi için `CropMode`'a ad ekleyin, `prepare` içine dal yazın, timm'in
karşılığıyla birebirlik testini `tests/test_model_input.py` içine ekleyin.
"""

from __future__ import annotations

import math
from typing import Any, Literal

import numpy as np
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

Interpolation = Literal["bicubic", "bilinear", "nearest", "lanczos", "box", "hamming"]
CropMode = Literal["merkez", "ezme"]
INPUT_LAYOUT = "uint8 NHWC RGB (0-255); normalleştirme modelin içinde"
_RESAMPLE = {
    "bicubic": Image.Resampling.BICUBIC,
    "bilinear": Image.Resampling.BILINEAR,
    "nearest": Image.Resampling.NEAREST,
    "lanczos": Image.Resampling.LANCZOS,
    "box": Image.Resampling.BOX,
    "hamming": Image.Resampling.HAMMING,
}


class InputSpec(BaseModel):
    """Ön işleme ayarı; eğitim çıktısına ve ONNX paketine aynen yazılır."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    yukseklik: int = Field(ge=8, le=4096)
    genislik: int = Field(ge=8, le=4096)
    kirpma_orani: float = Field(0.875, gt=0.0, le=2.0, description="timm crop_pct")
    kirpma: CropMode = "merkez"
    enterpolasyon: Interpolation = "bicubic"
    ortalama: tuple[float, float, float] = (0.485, 0.456, 0.406)
    sapma: tuple[float, float, float] = (0.229, 0.224, 0.225)
    arka_plan: tuple[int, int, int] = (255, 255, 255)

    @property
    def resize_size(self) -> tuple[int, int]:
        """Kırpmadan önceki hedef (yükseklik, genişlik): timm `floor(boyut / crop_pct)`."""
        return (
            math.floor(self.yukseklik / self.kirpma_orani),
            math.floor(self.genislik / self.kirpma_orani),
        )


def spec_from_timm(data_config: dict[str, Any], size: int = 0) -> InputSpec:
    """timm `resolve_model_data_config` sonucundan ayar kurar; `size` > 0 ise boyutu değiştirir."""
    _, height, width = data_config["input_size"]
    if size > 0:
        height = width = size
    mode = data_config.get("crop_mode") or "center"
    interpolation = str(data_config.get("interpolation") or "bilinear")
    return InputSpec(
        yukseklik=int(height),
        genislik=int(width),
        kirpma_orani=float(data_config.get("crop_pct") or 0.875),
        kirpma="ezme" if mode == "squash" else "merkez",
        enterpolasyon=interpolation if interpolation in _RESAMPLE else "bilinear",  # type: ignore[arg-type]
        ortalama=tuple(float(v) for v in data_config["mean"]),  # type: ignore[arg-type]
        sapma=tuple(float(v) for v in data_config["std"]),  # type: ignore[arg-type]
    )


def _shorter_side_size(size: tuple[int, int], target: int) -> tuple[int, int]:
    """torchvision `_compute_resized_output_size` ile aynı: kısa kenar = target, uzun kenar int(…)."""
    width, height = size
    short, long = (width, height) if width <= height else (height, width)
    new_short, new_long = target, int(target * long / short)
    return (new_short, new_long) if width <= height else (new_long, new_short)


def _center_crop(image: Image.Image, height: int, width: int) -> Image.Image:
    """torchvision `center_crop` ile aynı: gerekirse siyahla doldurur, `round` ile ortalar."""
    if image.width < width or image.height < height:
        padded = Image.new(image.mode, (max(width, image.width), max(height, image.height)), 0)
        left = (padded.width - image.width) // 2
        top = (padded.height - image.height) // 2
        padded.paste(image, (left, top))
        image = padded
    top = round((image.height - height) / 2.0)  # torchvision int(round(…)) ile aynı
    left = round((image.width - width) / 2.0)
    return image.crop((left, top, left + width, top + height))


def prepare(image: Image.Image, spec: InputSpec) -> np.ndarray:
    """RGB görüntüyü modelin beklediği uint8 diziye çevirir: (yükseklik, genişlik, 3)."""
    if image.mode != "RGB":
        raise ValueError(f"prepare RGB görüntü bekler, gelen kip: {image.mode} (loader.load_rgb)")
    resample = _RESAMPLE[spec.enterpolasyon]
    resize_h, resize_w = spec.resize_size
    if spec.kirpma == "ezme" or resize_h != resize_w:
        target = (
            (resize_w, resize_h)
            if spec.kirpma == "ezme"
            else _keep_ratio(image, resize_h, resize_w)
        )
    else:
        target = _shorter_side_size(image.size, resize_h)
    if target != image.size:
        image = image.resize(target, resample)
    cropped = _center_crop(image, spec.yukseklik, spec.genislik)
    return np.asarray(cropped, dtype=np.uint8).copy()


def _keep_ratio(image: Image.Image, height: int, width: int) -> tuple[int, int]:
    """Kare olmayan hedef: timm `ResizeKeepRatio(longest=0)` ile aynı hesap → (genişlik, yükseklik)."""
    ratio = min(image.height / height, image.width / width)
    return round(image.width / ratio), round(image.height / ratio)


def prepare_batch(images: list[Image.Image], spec: InputSpec) -> np.ndarray:
    """Birden çok görüntü: (N, yükseklik, genişlik, 3) uint8."""
    if not images:
        return np.zeros((0, spec.yukseklik, spec.genislik, 3), dtype=np.uint8)
    return np.stack([prepare(image, spec) for image in images])


def normalize_reference(batch: np.ndarray, spec: InputSpec) -> np.ndarray:
    """Modelin içindeki normalleştirmenin numpy karşılığı (yalnız testlerde ve belgede başvuru)."""
    values = batch.astype(np.float32) / np.float32(255.0)
    mean = np.asarray(spec.ortalama, dtype=np.float32)
    std = np.asarray(spec.sapma, dtype=np.float32)
    return ((values - mean) / std).transpose(0, 3, 1, 2)
