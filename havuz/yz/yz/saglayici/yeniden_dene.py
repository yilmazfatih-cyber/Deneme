"""Üstel geri çekilmeyle (exponential backoff) yeniden deneme.

Yalnız `SaglayiciHatasi.yeniden_denenebilir` True olan hatalar tekrar denenir (429, 5xx,
bağlantı kopması, zaman aşımı). Sunucu `Retry-After` verdiyse o süre beklenir (üst sınırla).
Bekleme ve rastgelelik parametreyle verilir; testlerde gerçek bekleme olmaz.
Kim kullanır: saglayici/openai_uyumlu.py. (Anthropic SDK kendi yeniden denemesini yapar.)
Genişletme: farklı bir bekleme eğrisi gerekiyorsa `bekleme_suresi`'ni değiştirin.
"""

from __future__ import annotations

import random
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import TypeVar

from yz.hatalar import SaglayiciHatasi

T = TypeVar("T")


@dataclass(frozen=True)
class YenidenDenemeAyari:
    """Toplam `azami_deneme` kez denenir (ilk deneme dahil)."""

    azami_deneme: int = 3
    taban_sn: float = 0.5
    carpan: float = 2.0
    azami_bekleme_sn: float = 20.0
    titresim: float = 0.25  # beklemeye eklenen rastgele pay (oran)


def bekleme_suresi(deneme: int, ayar: YenidenDenemeAyari, rastgele: random.Random) -> float:
    """`deneme`. başarısızlıktan (1'den başlar) sonra beklenecek süre."""
    taban = min(ayar.azami_bekleme_sn, ayar.taban_sn * ayar.carpan ** (deneme - 1))
    pay = taban * ayar.titresim * rastgele.random()
    return float(min(ayar.azami_bekleme_sn, taban + pay))


def yeniden_dene(
    islem: Callable[[], T],
    ayar: YenidenDenemeAyari | None = None,
    *,
    uyu: Callable[[float], None] = time.sleep,
    rastgele: random.Random | None = None,
    her_denemede: Callable[[int, SaglayiciHatasi, float], None] | None = None,
) -> T:
    """`islem`i çalıştırır; yeniden denenebilir hatada bekleyip tekrar dener."""
    ayar = ayar or YenidenDenemeAyari()
    rastgele = rastgele or random.Random(0)  # noqa: S311 - güvenlik amaçlı değil
    deneme = 0
    while True:
        deneme += 1
        try:
            return islem()
        except SaglayiciHatasi as hata:
            if not hata.yeniden_denenebilir or deneme >= ayar.azami_deneme:
                raise
            sure = bekleme_suresi(deneme, ayar, rastgele)
            if hata.bekleme_sn is not None:
                sure = min(ayar.azami_bekleme_sn, max(sure, hata.bekleme_sn))
            if her_denemede is not None:
                her_denemede(deneme, hata, sure)
            uyu(sure)
