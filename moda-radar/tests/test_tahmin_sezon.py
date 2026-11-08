from datetime import date

import pytest

from moda_radar.tahmin import sezon as sz


def test_ayristir():
    assert sz.ayristir("SS27") == (2027, "SS")
    assert sz.ayristir("FW09") == (2009, "FW")
    with pytest.raises(ValueError):
        sz.ayristir("AW27")


def test_sirala_fark_ekle():
    assert sz.sirala(["FW27", "SS27", "FW26", "SS28"]) == ["FW26", "SS27", "FW27", "SS28"]
    assert sz.fark("SS25", "SS27") == 4
    assert sz.fark("SS27", "FW26") == -1
    assert sz.ekle("SS27", 2) == "SS28"
    assert sz.ekle("SS27", 1) == "FW27"
    assert sz.ekle("SS27", -1) == "FW26"


def test_defile_tarihi():
    assert sz.defile_tarihi("SS27") == date(2026, 9, 15)
    assert sz.defile_tarihi("FW27").year == 2027 and sz.defile_tarihi("FW27").month in (2, 3)


def test_raf_donemi_ve_ufuk():
    assert sz.raf_donemi("SS27", 1) == "SS27-Mart"
    assert sz.raf_donemi("SS27", 2) == "FW27-Eylül"
    assert sz.raf_donemi("SS27", 3) == "SS28-Mart"
    assert sz.raf_donemi("FW27", 1) == "FW27-Ağustos"
    assert sz.ufuk_sezonu("SS27", 3) == "SS28"
    # takvim dışı aylar giriş penceresine oturur
    for g in (0, 0.5, 1.5, 2.5, 3.5, 5):
        ay = sz.raf_donemi("SS27", g).split("-")[1]
        assert ay in ("Ocak", "Şubat", "Mart", "Temmuz", "Ağustos", "Eylül")


def test_raf_penceresi():
    assert sz.raf_penceresi("SS27") == (date(2027, 1, 1), date(2027, 6, 30))
    assert sz.raf_penceresi("FW27") == (date(2027, 7, 1), date(2027, 12, 31))
