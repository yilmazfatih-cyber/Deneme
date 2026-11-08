import json
from pathlib import Path

import numpy as np
import pytest

from moda_radar.renk import uzay
from moda_radar.sema import Lab

SHARMA = json.loads((Path(__file__).parent / "fixtures" / "renk" / "sharma2005.json").read_text(encoding="utf-8"))


def _lab(x):
    return Lab(L=x[0], a=x[1], b=x[2])


@pytest.mark.parametrize(("bir", "iki", "beklenen"), SHARMA["ciftler"])
def test_sharma_2005_ciftleri(bir, iki, beklenen):
    assert uzay.delta_e2000(_lab(bir), _lab(iki)) == pytest.approx(beklenen, abs=1e-3)
    # simetri
    assert uzay.delta_e2000(_lab(iki), _lab(bir)) == pytest.approx(beklenen, abs=1e-3)


def test_toplu_tekil_ile_ayni():
    tablo = np.array([c[1] for c in SHARMA["ciftler"]])
    for bir, _, _ in SHARMA["ciftler"][:5]:
        toplu = uzay.delta_e2000_toplu(_lab(bir), tablo)
        tekil = [uzay.delta_e2000(_lab(bir), _lab(t)) for t in tablo]
        np.testing.assert_allclose(toplu, tekil, atol=1e-9)


def test_ayni_renk_sifir():
    lab = uzay.hex_to_lab("#2E5A88")
    assert uzay.delta_e2000(lab, lab) == pytest.approx(0.0, abs=1e-9)


def test_bilinen_lab_degerleri():
    beyaz = uzay.hex_to_lab("#FFFFFF")
    assert beyaz.L == pytest.approx(100.0, abs=0.01) and abs(beyaz.a) < 0.01 and abs(beyaz.b) < 0.01
    siyah = uzay.hex_to_lab("#000000")
    assert siyah.L == pytest.approx(0.0, abs=0.01)
    kirmizi = uzay.hex_to_lab("#FF0000")
    assert (kirmizi.L, kirmizi.a, kirmizi.b) == pytest.approx((53.24, 80.09, 67.20), abs=0.02)


@pytest.mark.parametrize(
    "hex_", ["#DA321C", "#2E5A88", "#FFFFFF", "#000000", "#7F7F7F", "#00FF00", "#F3ECE0", "#123456"]
)
def test_hex_lab_hex_gidis_donus(hex_):
    assert uzay.lab_to_hex(uzay.hex_to_lab(hex_)) == hex_


def test_hex_bicimleri():
    assert uzay.hex_to_rgb("da321c") == (218, 50, 28)
    assert uzay.hex_to_rgb("#fff") == (255, 255, 255)
    with pytest.raises(ValueError):
        uzay.hex_to_rgb("#12345")
