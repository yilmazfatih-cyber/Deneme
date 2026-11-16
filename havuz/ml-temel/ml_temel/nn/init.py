"""Ağırlık başlatma: katmanların ilk değerleri ve paket genelindeki tohumlu rastgele kaynak.

Fikir: ağırlıklar çok büyük başlarsa etkinleştirmeler doyar, çok küçük başlarsa sinyal söner.
Xavier (tanh/sigmoid için) ve He/Kaiming (ReLU/GELU için) başlatmaları, katmanın giriş-çıkış
sayısına göre ölçeği ayarlar. Transformer'larda küçük ölçekli normal dağılım (0.02) kullanılır.

Rastgelelik: katmanlara `rng` verilmezse buradaki paket üreteci kullanılır; `manual_seed(s)`
onu sıfırlar (PyTorch'taki `torch.manual_seed` gibi). Tekrarlanabilirlik için betiğin başında
çağırın.

Genişletme: yeni başlatma = (shape, rng) alıp dizi döndüren fonksiyon; `INITIALIZERS`'a ekleyin.
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from ml_temel.ortak.types import Array, Seed

_STATE = {"rng": np.random.default_rng(0)}


def manual_seed(seed: int) -> None:
    """Paket genelindeki varsayılan rastgele üreteci verilen tohumla yeniden kurar."""
    _STATE["rng"] = np.random.default_rng(seed)


def resolve_rng(rng: Seed) -> np.random.Generator:
    """`rng` üreteçse kendisi, tam sayıysa o tohumla yeni üreteç, None ise paket üreteci."""
    if isinstance(rng, np.random.Generator):
        return rng
    if rng is None:
        return _STATE["rng"]
    return np.random.default_rng(rng)


def _fans(shape: tuple[int, ...]) -> tuple[int, int]:
    """(giriş, çıkış) bağlantı sayıları. Linear: (in, out); Conv2d: (F, C, kh, kw)."""
    if len(shape) == 2:
        return shape[0], shape[1]
    if len(shape) == 4:
        receptive = shape[2] * shape[3]
        return shape[1] * receptive, shape[0] * receptive
    raise ValueError(f"Başlatma 2 ya da 4 boyutlu ağırlık bekler; verilen biçim {shape}.")


def normal(shape: tuple[int, ...], rng: np.random.Generator, std: float = 0.02) -> Array:
    """Ortalaması 0, standart sapması `std` olan normal dağılım (GPT'nin başlatması)."""
    return rng.standard_normal(shape) * std


def xavier_uniform(shape: tuple[int, ...], rng: np.random.Generator) -> Array:
    """Glorot/Xavier: U(-a, a), a = √(6 / (giriş + çıkış)). tanh ve sigmoid için uygundur."""
    fan_in, fan_out = _fans(shape)
    bound = float(np.sqrt(6.0 / (fan_in + fan_out)))
    return rng.uniform(-bound, bound, size=shape)


def kaiming_uniform(shape: tuple[int, ...], rng: np.random.Generator) -> Array:
    """He/Kaiming: U(-a, a), a = √(6 / giriş). ReLU ve GELU için uygundur."""
    fan_in, _ = _fans(shape)
    bound = float(np.sqrt(6.0 / fan_in))
    return rng.uniform(-bound, bound, size=shape)


INITIALIZERS: dict[str, Callable[[tuple[int, ...], np.random.Generator], Array]] = {
    "kaiming": kaiming_uniform,
    "xavier": xavier_uniform,
    "normal": normal,
    # YENİ BAŞLATMA BURAYA
}


def initialize(name: str, shape: tuple[int, ...], rng: np.random.Generator) -> Array:
    """Adı verilen başlatmayla ağırlık dizisi üretir."""
    if name not in INITIALIZERS:
        raise ValueError(
            f"Bilinmeyen başlatma: '{name}'. Geçerli olanlar: {', '.join(INITIALIZERS)}."
        )
    return INITIALIZERS[name](shape, rng)
