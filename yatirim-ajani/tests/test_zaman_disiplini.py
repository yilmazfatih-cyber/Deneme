"""Point-in-time (zamanında bilinebilirlik) testi: bir özelliğin t günündeki değeri, veri t'de
kesildiğinde de aynı çıkmalı. Aksi hâlde özellik geleceğe bakıyordur (Look-Ahead-Freedom fikri)."""

from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from yatirim_ajani.ayarlar import PIYASALAR
from yatirim_ajani.bilgi import SEKTORLER
from yatirim_ajani.ogrenme.agac import EK_SAYISAL, ek_ozellikler
from yatirim_ajani.ogrenme.simulasyon import GUNLUK_OZELLIKLER, Panel, gunluk_ozellikler, panel_kur
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.saatlik import SaatlikVeriSeti

BIST = PIYASALAR["bist"]


def _kes(panel: Panel, t: int) -> Panel:
    return Panel(panel.acilis.iloc[: t + 1], panel.kapanis.iloc[: t + 1], panel.gunduz.iloc[: t + 1],
                 (panel.acilis.shift(-1) / panel.kapanis - 1).iloc[: t + 1], panel.gunler[: t + 1])  # fmt: skip


def test_ozellikler_gelecege_bakmaz(tmp_path):
    vs = SaatlikVeriSeti(tmp_path / "saatlik")
    hisseler = ["AKBNK", "GARAN", "THYAO"]
    vs.cek(SentetikKaynak(), [BIST.sembol(h) for h in hisseler] + [BIST.gosterge],
           datetime(2025, 1, 1).astimezone(), datetime(2026, 3, 1).astimezone(), bes_dakika=False)  # fmt: skip
    panel = panel_kur(vs, BIST, hisseler)
    g = vs.saatlik(BIST.gosterge)
    gosterge = g["kapanis"].groupby(pd.Series(pd.to_datetime(g.index.date), index=g.index)).last()
    tam = gunluk_ozellikler(panel, gosterge)
    tam.update(ek_ozellikler(panel, None, SEKTORLER))
    for t in (120, 200, len(panel.gunler) - 3):
        kesik = _kes(panel, t)
        oz = gunluk_ozellikler(kesik, gosterge[gosterge.index <= panel.gunler[t]])
        oz.update(ek_ozellikler(kesik, None, SEKTORLER))
        for ad in GUNLUK_OZELLIKLER + EK_SAYISAL:
            if ad == "ay_sonu":  # tanımı gereği ertesi günün ayını bilmeyi gerektirir; takvimden bilinir, fiyattan değil
                continue
            a = tam[ad].iloc[t].to_numpy(dtype=float)
            b = oz[ad].iloc[t].to_numpy(dtype=float)
            assert np.allclose(np.nan_to_num(a), np.nan_to_num(b), atol=1e-9), f"{ad} t={t} geleceğe bakıyor"


def test_hedef_gelecektir_ve_ozellik_degildir():
    from yatirim_ajani.ogrenme.simulasyon import hedef_ertesi_gun

    idx = pd.date_range("2025-01-01", periods=5, freq="B")
    k = pd.DataFrame({"X": [1.0, 1.1, 1.0, 1.2, 1.3]}, index=idx)
    p = Panel(k, k, k * 0, k * 0, idx)
    h = hedef_ertesi_gun(p)
    assert np.isnan(h["X"].iloc[-1]) and h["X"].iloc[0] == pytest_approx(0.1)


def pytest_approx(x):
    import pytest

    return pytest.approx(x)
