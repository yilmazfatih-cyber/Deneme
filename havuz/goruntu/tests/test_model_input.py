"""Model girdisinin birebirliği: bizim `prepare` + modelin içindeki normalleştirme, timm'in kendi
değerlendirme dönüşümüyle (create_transform) aynı tensörü üretir — farklı en-boy oranları, kırpma
oranları, ezme kipi ve kare olmayan hedefle. Eğitimdeki ön işleme = uygulamadaki ön işleme."""

from __future__ import annotations

import numpy as np
import pytest
import torch
from PIL import Image

from goruntu.hazirlik.model_input import InputSpec, normalize_reference, prepare, spec_from_timm
from goruntu.siniflandirma.model import make_classifier


def _photo(width: int, height: int, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    base = rng.integers(0, 256, (height // 4 + 1, width // 4 + 1, 3), dtype=np.uint8)
    return Image.fromarray(base).resize((width, height), Image.Resampling.BILINEAR)


def _timm_tensor(image: Image.Image, config: dict) -> torch.Tensor:  # type: ignore[type-arg]
    from timm.data import create_transform

    return create_transform(**config, is_training=False)(image)  # type: ignore[no-any-return]


CONFIGS = [
    {
        "input_size": (3, 224, 224),
        "interpolation": "bicubic",
        "crop_pct": 0.875,
        "crop_mode": "center",
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
    },
    {
        "input_size": (3, 160, 160),
        "interpolation": "bilinear",
        "crop_pct": 0.95,
        "crop_mode": "center",
        "mean": (0.5, 0.5, 0.5),
        "std": (0.5, 0.5, 0.5),
    },
    {
        "input_size": (3, 96, 96),
        "interpolation": "bicubic",
        "crop_pct": 1.0,
        "crop_mode": "squash",
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
    },
    {
        "input_size": (3, 128, 192),
        "interpolation": "bicubic",
        "crop_pct": 0.9,
        "crop_mode": "center",
        "mean": (0.485, 0.456, 0.406),
        "std": (0.229, 0.224, 0.225),
    },
]
SIZES = [(640, 480), (480, 640), (300, 300), (1001, 333), (97, 151)]


@pytest.mark.parametrize("config", CONFIGS, ids=lambda c: f"{c['input_size'][1:]}-{c['crop_mode']}")
@pytest.mark.parametrize("size", SIZES, ids=str)
def test_timm_degerlendirme_donusumuyle_birebir(config: dict, size: tuple[int, int]) -> None:  # type: ignore[type-arg]
    image = _photo(*size, seed=size[0])
    spec = spec_from_timm(config)
    ours = normalize_reference(prepare(image, spec)[None], spec)[0]
    theirs = _timm_tensor(image, config).numpy()
    assert ours.shape == theirs.shape
    assert np.abs(ours - theirs).max() < 1e-5


def test_modelin_icindeki_normallestirme_referansla_ayni() -> None:
    spec = InputSpec(yukseklik=32, genislik=32)
    captured: list[torch.Tensor] = []

    class Spy(torch.nn.Module):
        def forward(self, pixels: torch.Tensor) -> torch.Tensor:
            captured.append(pixels)
            return pixels.mean(dim=(2, 3))

    model = make_classifier(Spy(), spec)
    batch = np.stack([prepare(_photo(50, 40, s), spec) for s in range(3)])
    model(torch.from_numpy(batch))
    assert np.abs(captured[0].numpy() - normalize_reference(batch, spec)).max() < 1e-6


def test_prepare_rgb_ister() -> None:
    with pytest.raises(ValueError, match="RGB"):
        prepare(Image.new("RGBA", (10, 10)), InputSpec(yukseklik=8, genislik=8))


def test_kucuk_goruntu_siyahla_doldurulur() -> None:
    spec = InputSpec(yukseklik=16, genislik=16, kirpma_orani=2.0)  # kısa kenar 8 → 16'ya dolgu
    array = prepare(Image.new("RGB", (20, 20), (255, 255, 255)), spec)
    assert array.shape == (16, 16, 3) and array[0, 0].tolist() == [0, 0, 0]
