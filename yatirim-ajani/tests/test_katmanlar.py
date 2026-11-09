"""Sektör rotasyonu ve olay çalışması yardımcıları: küçük sentetik verilerle davranış testleri."""

import json

import numpy as np
import pandas as pd

from yatirim_ajani.dosya.olay_calismasi import _hane, ozetle
from yatirim_ajani.dosya.sektor import rotasyon
from yatirim_ajani.dosya.sektor_harita import ana_sektor, sektor


def test_sektor_harita():
    assert sektor("KCHOL") == "holding" and ana_sektor("AKBNK") == "finans" and sektor("TRALT") == "madencilik_altin" and sektor("XXXXX") == "diger"


def test_rotasyon_kazanani_secer():
    gunler = pd.bdate_range("2024-01-01", "2025-06-30")
    rng = np.random.default_rng(0)
    S = pd.DataFrame({f"s{i}": rng.normal(0.0002 * i, 0.01, len(gunler)) for i in range(6)}, index=gunler)
    S["s5"] += 0.003  # sürekli kazanan sektör
    xu = S.mean(axis=1)
    r = rotasyon(S, xu)
    assert r["ay"] >= 10 and "s5" in r["son_secim"] and r["toplam_net"] > r["toplam_esit"]


def test_olay_ozeti_dallari():
    T = pd.DataFrame({
        "hisse": ["A", "B", "C", "D", "E", "F"], "tur": ["yatirim", "yatirim", "is_iliskisi", "temettu", "bedelsiz", "bilanco"],
        "yon": ["olumlu"] * 6, "guven": [0.8, 0.8, 0.8, 0.8, 0.3, 0.9],
        "tepki_1g": [0.05, 0.02, 0.01, 0.0, 0.1, 0.03], "ileri_5g": [0.02, 0.01, -0.01, 0.0, 0.05, 0.02], "ileri_20g": [0.03, 0.0, 0.0, 0.01, 0.1, 0.04],
        "ileri_5g_anormal": [0.01, 0.0, -0.02, 0.0, 0.04, 0.01], "ileri_20g_anormal": [0.02, -0.01, 0.0, 0.0, 0.08, 0.03], "oncesi_5g": [0.0] * 6,
        "pd_orani": [0.05, 0.04, 0.015, None, None, None], "buyukluk": pd.Categorical(["buyuk", "buyuk", "orta", None, None, None]),
    })  # fmt: skip
    o = ozetle(T)
    assert o["guvenli_olay"] == 5  # bedelsiz (güven 0,3) dışarıda
    assert o["dallar"]["olay_buyume_buyuk"]["n"] == 2 and abs(o["dallar"]["olay_buyume_buyuk"]["ort_net"] - (0.015 - 0.003)) < 1e-9
    assert o["dallar"]["bedelsiz_beklenti"]["n"] == 0
    assert _hane(json.dumps({"tutar": 5})) == {"tutar": 5} and _hane(None) == {}
