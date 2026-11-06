"""Saatlik model kapısı: taramada AL sinyali ancak Q(x) >= eşik ise geçer."""

from __future__ import annotations

from typing import Callable

import pandas as pd

from ..ayarlar import Piyasa
from .ozellikler import OZELLIK_ADLARI, ozellik_tablosu
from .rl import BanditModel


def saatlik_kapi(model: BanditModel, esik: float, piyasa: Piyasa) -> Callable[[str, pd.DataFrame], tuple[bool, str]]:
    def kapi(hisse: str, cubuklar: pd.DataFrame) -> tuple[bool, str]:
        t = ozellik_tablosu(cubuklar).dropna(subset=OZELLIK_ADLARI)
        if t.empty:
            return False, "model için yeterli çubuk yok"
        q = float(model.q(t[OZELLIK_ADLARI].to_numpy(dtype=float)[-1:].clip(-10, 10))[0])
        if q >= esik:
            return True, f"model beklenen net {q:+.2%} ≥ eşik {esik:.2%}"
        return False, f"model beklenen net {q:+.2%} < eşik {esik:.2%}"

    return kapi
