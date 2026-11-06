"""Rastgele GÜN etiketli train/test bölmesi.

Neden satır değil gün? Saatlik bir satırın özellikleri komşu saatlerden gelir. Satırlar tek tek
rastgele etiketlenirse test saatinin bilgisi eğitim saatlerine sızar ve sonuç şişer. Günler
etiketlenince zaman sırası bozulmaz, etiket yine rastgeledir, sızıntı gün sınırında kalır.

Etiketler bir kez üretilir, CSV'ye yazılır ve sonra değiştirilmez: her eğitim aynı test
günlerine bakar. Yeni günler eklendikçe yalnız onlar etiketlenir.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ETIKETLER = ("train", "test")


def gunleri_etiketle(gunler: list[date], test_orani: float, tohum: int) -> pd.Series:
    """Tohum sabitken aynı gün aynı etiketi alır (günün tarihinden türetilir)."""
    etiketler = {}
    for g in sorted(set(gunler)):
        rng = np.random.default_rng([tohum, g.year, g.month, g.day])
        etiketler[g] = "test" if rng.random() < test_orani else "train"
    s = pd.Series(etiketler, dtype="object")
    s.index.name = "gun"
    return s


class Bolme:
    def __init__(self, yol: str | Path, test_orani: float = 0.2, tohum: int = 2024) -> None:
        self.yol = Path(yol)
        self.test_orani = test_orani
        self.tohum = tohum
        self._etiket = self._yukle()

    def _yukle(self) -> pd.Series:
        if not self.yol.exists():
            return pd.Series(dtype="object", name="etiket")
        df = pd.read_csv(self.yol, parse_dates=["gun"])
        s = pd.Series(df["etiket"].values, index=df["gun"].dt.date, name="etiket")
        return s

    def guncelle(self, gunler: list[date]) -> int:
        """Henüz etiketi olmayan günleri etiketler; kaç yeni gün eklendiğini döndürür."""
        yeni = [g for g in set(gunler) if g not in self._etiket.index]
        if not yeni:
            return 0
        ek = gunleri_etiketle(yeni, self.test_orani, self.tohum)
        self._etiket = pd.concat([self._etiket, ek]).sort_index()
        self.yol.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame({"gun": self._etiket.index, "etiket": self._etiket.values}).to_csv(self.yol, index=False)
        return len(yeni)

    def etiket(self, gun: date) -> str:
        return str(self._etiket.get(gun, "train"))

    def maske(self, zamanlar: pd.DatetimeIndex, etiket: str) -> np.ndarray:
        if etiket not in ETIKETLER:
            raise ValueError(f"etiket train|test olmalı: {etiket}")
        return np.array([self.etiket(z.date()) == etiket for z in zamanlar])

    def ozet(self) -> dict[str, int]:
        return {e: int((self._etiket == e).sum()) for e in ETIKETLER}
