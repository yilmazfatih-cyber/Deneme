"""Bellekteki ses nesnesi `Ses` ve örnek biçimi dönüşümleri (tam sayı PCM ↔ float32).

Paketin içinde ses HER ZAMAN float32'dir ve değerler kabaca [-1, 1] aralığındadır; tam sayı PCM
(16/24/32 bit) yalnız dosyaya yazarken/okurken kullanılır. `Ses.ornekler` şekli (örnek, kanal)'dır;
işleme işlevlerinin çoğu tek kanallı (1 boyutlu) dizi + örnekleme hızı alır: `ses.mono()`.
Kim kullanır: wav.py, ffmpeg.py, stt/, tts/, sunucu/.
Genişletme: yeni bir PCM genişliği gerekiyorsa `pcm_coz` / `pcm_kodla`'ya bir dal ve
tests/test_wav.py'ye gidiş-dönüş testi ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from ses.hatalar import BicimHatasi

Dizi = NDArray[np.float32]
"""Tek kanallı (1 boyutlu) float32 ses örnekleri."""


@dataclass(frozen=True)
class Ses:
    """Bellekteki ses: float32 örnekler (şekil: örnek × kanal) ve örnekleme hızı (Hz)."""

    ornekler: NDArray[np.float32]
    ornekleme: int

    def __post_init__(self) -> None:
        if self.ornekler.ndim != 2 or self.ornekler.shape[1] < 1:
            raise BicimHatasi("Ses örnekleri (örnek, kanal) biçiminde iki boyutlu olmalı.")
        if self.ornekler.dtype != np.float32:
            raise BicimHatasi("Ses örnekleri float32 olmalı; Ses.tek_kanaldan(...) kullanın.")
        if not 1 <= self.ornekleme <= 1_000_000:
            raise BicimHatasi(f"Örnekleme hızı geçersiz: {self.ornekleme} Hz.")

    @classmethod
    def tek_kanaldan(cls, dizi: NDArray[np.floating] | list[float], ornekleme: int) -> Ses:
        """1 boyutlu diziden tek kanallı `Ses` kurar (float32'ye çevirir)."""
        veri = np.asarray(dizi, dtype=np.float32)
        if veri.ndim != 1:
            raise BicimHatasi("tek_kanaldan 1 boyutlu dizi bekler; çok kanal için Ses(...) kurun.")
        return cls(veri.reshape(-1, 1), ornekleme)

    @property
    def kanal(self) -> int:
        return int(self.ornekler.shape[1])

    @property
    def ornek_sayisi(self) -> int:
        return int(self.ornekler.shape[0])

    @property
    def sure(self) -> float:
        """Süre (saniye)."""
        return self.ornek_sayisi / self.ornekleme

    def mono(self) -> Dizi:
        """Tek kanala indirir: kanalların ortalaması (1 boyutlu float32 dizi)."""
        if self.kanal == 1:
            return self.ornekler[:, 0].copy()
        return self.ornekler.mean(axis=1, dtype=np.float64).astype(np.float32)


def pcm_coz(veri: bytes | memoryview, genislik: int, bicim: str = "pcm") -> Dizi:
    """Ham örnek baytlarını float32'ye çevirir (kanallar iç içe, düz dizi döner).

    `genislik`: örnek başına bayt (1, 2, 3, 4; float için 4 ya da 8). `bicim`: "pcm" ya da "float".
    8 bit PCM işaretsizdir (128 = sessizlik); diğerleri işaretli, küçük uçlu (little-endian).
    """
    tampon = memoryview(veri)
    fazla = len(tampon) % genislik
    if fazla:
        tampon = tampon[: len(tampon) - fazla]  # yarım kalan son örnek atılır
    if bicim == "float":
        if genislik not in (4, 8):
            raise BicimHatasi(f"Kayan noktalı WAV yalnız 32/64 bit olur (gelen: {genislik * 8}).")
        sayilar = np.frombuffer(tampon, dtype="<f4" if genislik == 4 else "<f8")
        return np.nan_to_num(sayilar, nan=0.0, posinf=1.0, neginf=-1.0).astype(np.float32)
    if genislik == 1:
        return ((np.frombuffer(tampon, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0).astype(
            np.float32
        )
    if genislik == 2:
        return (np.frombuffer(tampon, dtype="<i2").astype(np.float32) / 32768.0).astype(np.float32)
    if genislik == 3:
        uclu = np.frombuffer(tampon, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        tam = uclu[:, 0] | (uclu[:, 1] << 8) | (uclu[:, 2] << 16)
        tam = (tam ^ 0x800000) - 0x800000  # 24 bitlik işaret genişletme
        return (tam.astype(np.float64) / 8388608.0).astype(np.float32)
    if genislik == 4:
        return (np.frombuffer(tampon, dtype="<i4").astype(np.float64) / 2147483648.0).astype(
            np.float32
        )
    raise BicimHatasi(f"Desteklenmeyen örnek genişliği: {genislik * 8} bit.")


def pcm_kodla(dizi: NDArray[np.float32], genislik: int = 2) -> bytes:
    """float32 örnekleri işaretli tam sayı PCM baytlarına çevirir (kırpar, en yakına yuvarlar).

    Ölçek 2^(bit-1)'dir: okurken bölünen sayıyla aynı; böylece 16 bitlik veri birebir geri gelir.
    """
    if genislik not in (2, 3, 4):
        raise BicimHatasi("Yazarken örnek genişliği 16, 24 ya da 32 bit olmalı.")
    olcek = float(2 ** (genislik * 8 - 1))
    tam = np.clip(np.round(dizi.astype(np.float64) * olcek), -olcek, olcek - 1)
    if genislik == 2:
        return tam.astype("<i2").tobytes()
    if genislik == 4:
        return tam.astype("<i4").tobytes()
    tam32 = tam.astype(np.int32)
    uclu = np.stack([tam32 & 0xFF, (tam32 >> 8) & 0xFF, (tam32 >> 16) & 0xFF], axis=-1)
    return uclu.astype(np.uint8).tobytes()
