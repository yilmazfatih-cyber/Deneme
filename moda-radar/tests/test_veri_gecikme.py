from datetime import date

import pytest

from moda_radar.sema import DefileTanimi, GozlemKaydi, SinyalKaydi
from moda_radar.veri import gecikme_olc
from moda_radar.veri.depo import Depo


def _sinyal(sezon, deger, pay=0.1):
    return SinyalKaydi(
        sezon=sezon,
        nitelik_ekseni="renk",
        nitelik_degeri=deger,
        podyum_payi=pay,
        marka_sayisi=3,
        kaynak_turu="rapor",
        kaynak_url=f"https://r/{sezon}",
        kaynak_tarihi=date(2020, 1, 1),
    )


def _gozlem(deger, ilk):
    return GozlemKaydi(
        segment="orta",
        marka="LCW",
        kategori="kadin-ust",
        nitelik_ekseni="renk",
        nitelik_degeri=deger,
        ilk_gorulme=ilk,
        son_gorulme=ilk,
        urun_sayisi=1,
        kaynak_url="https://lcw/1",
    )


def test_nominal_tarih():
    assert gecikme_olc.nominal_podyum_tarihi("SS27") == date(2026, 9, 25)
    assert gecikme_olc.nominal_podyum_tarihi("FW26") == date(2026, 2, 25)


@pytest.fixture
def depo(tmp_path):
    with Depo(tmp_path / "m.db") as d:
        d.ekle_defile(
            DefileTanimi(
                sezon="SS26",
                marka="Prada",
                sehir="Milano",
                kaynak="vogue",
                kaynak_kimligi="s/p",
                tarih=date(2025, 9, 20),
            )
        )
        d.ekle_sinyaller(
            [
                _sinyal("SS26", "A"),  # defile tarihi 2025-09-20
                _sinyal("FW26", "A"),  # nominal 2026-02-25, rafa daha yakın → seçilir
                _sinyal("SS26", "B"),
                _sinyal("SS26", "C", pay=0.001),  # eşik altı
                _sinyal("FW27", "D"),  # raftan sonra: başlangıç olamaz
            ]
        )
        d.ekle_gozlemler(
            [
                _gozlem("A", date(2026, 4, 1)),
                _gozlem("B", date(2026, 3, 21)),
                _gozlem("C", date(2026, 3, 1)),
                _gozlem("D", date(2026, 3, 1)),
            ]
        )
        yield d


def test_olc_ve_ozet(depo):
    satirlar = gecikme_olc.olc(depo, "orta", "kadin-ust", bugun=date(2026, 11, 8))
    s = {r["deger"]: r for r in satirlar}
    assert set(s) == {"A", "B"}
    assert (s["A"]["sezon"], s["A"]["gecikme_gun"]) == ("FW26", 35)
    assert (s["B"]["sezon"], s["B"]["podyum_tarihi"], s["B"]["gecikme_gun"]) == ("SS26", "2025-09-20", 182)
    gecikme_olc.olc(depo, "orta", "kadin-ust")  # yeniden ölçüm yinelemez
    o = gecikme_olc.ozet_gecikme(depo, "orta", "kadin-ust")
    assert o["n"] == 2 and o["medyan"] == pytest.approx(108.5)
    assert o["q1"] <= o["medyan"] <= o["q3"]
    assert o["medyan_sezon"] == pytest.approx(0.59)


def test_ozet_bos(depo):
    assert gecikme_olc.ozet_gecikme(depo, "luks", "kadin-ust") == {
        "segment": "luks",
        "kategori": "kadin-ust",
        "n": 0,
        "medyan": None,
        "q1": None,
        "q3": None,
    }
