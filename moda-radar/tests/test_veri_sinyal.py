import json
from datetime import date
from pathlib import Path

import pytest

from moda_radar.veri import sinyal
from moda_radar.veri.depo import Depo

KLASOR = Path(__file__).resolve().parents[1] / "content" / "sinyaller"


def _yaz(klasor, ad, veri):
    (klasor / ad).write_text(json.dumps(veri), "utf-8")


KAYIT = {
    "nitelik_ekseni": "renk",
    "nitelik_degeri": "17-1564 TCX",
    "podyum_payi": 0.05,
    "marka_sayisi": 3,
    "kaynak_turu": "rapor",
    "kaynak_url": "https://r/1",
    "kaynak_tarihi": "2026-10-08",
}


def test_ornek_dosya_gecerli_ve_varsayilan_atlanir():
    kayitlar, ornek = sinyal.dosya_oku(KLASOR / "ORNEK.json")
    assert ornek is True and len(kayitlar) == 3
    assert all(k.sezon == "SS27" for k in kayitlar)
    assert all(k.kaynak_url and k.kaynak_tarihi for k in kayitlar)
    assert not any(k.kaynak_url.endswith("ORNEK") for k in sinyal.yukle(KLASOR))
    assert len(sinyal.yukle(KLASOR, ornekleri_dahil_et=True)) >= 3


def test_yukle_ve_depoya_yaz(tmp_path):
    _yaz(tmp_path, "SS27.json", {"sezon": "SS27", "sinyaller": [KAYIT, {**KAYIT, "nitelik_degeri": "11-0601 TCX"}]})
    _yaz(tmp_path, "FW26.json", {"sezon": "FW26", "sinyaller": [{**KAYIT, "sezon": "FW26"}]})
    kayitlar = sinyal.yukle(tmp_path)
    assert [k.sezon for k in kayitlar] == ["FW26", "SS27", "SS27"]
    with Depo(tmp_path / "m.db") as depo:
        assert sinyal.depoya_yaz(depo, kayitlar) == 3
        assert sinyal.depoya_yaz(depo, kayitlar) == 3  # yeniden yükleme yinelemez
        s = depo.sinyaller("SS27")
        assert len(s) == 2 and s[0].kaynak_tarihi == date(2026, 10, 8)


@pytest.mark.parametrize(
    "veri,ileti",
    [
        ({"sinyaller": []}, "sezon"),
        ({"sezon": "SS27"}, "sinyaller"),
        ({"sezon": "SS27", "sinyaller": [{**KAYIT, "sezon": "FW26"}]}, "uyuşmuyor"),
        ({"sezon": "SS27", "sinyaller": [{**KAYIT, "podyum_payi": 2}]}, "podyum_payi"),
        ({"sezon": "SS27", "sinyaller": [{k: v for k, v in KAYIT.items() if k != "kaynak_url"}]}, "kaynak_url"),
    ],
)
def test_hatali_dosya(tmp_path, veri, ileti):
    _yaz(tmp_path, "x.json", veri)
    with pytest.raises(sinyal.SinyalDosyasiHatasi, match=ileti):
        sinyal.yukle(tmp_path)
