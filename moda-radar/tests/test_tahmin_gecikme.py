from datetime import date, timedelta

from moda_radar.sema import GozlemKaydi, SinyalKaydi
from moda_radar.tahmin import gecikme as gk
from moda_radar.tahmin import sentetik
from moda_radar.tahmin import sezon as sz

ONSEL = {"alt": 2, "ust": 4, "mod": 3}


def _s(sezon, deger, pay=0.05):
    return SinyalKaydi(
        sezon=sezon,
        nitelik_ekseni="renk",
        nitelik_degeri=deger,
        podyum_payi=pay,
        marka_sayisi=5,
        kaynak_turu="gorsel",
        kaynak_url="test://s",
        kaynak_tarihi=sz.defile_tarihi(sezon),
    )


def _g(deger, ilk, segment="orta"):
    return GozlemKaydi(
        segment=segment,
        marka="m",
        kategori="kadin-ust",
        nitelik_ekseni="renk",
        nitelik_degeri=deger,
        ilk_gorulme=ilk,
        son_gorulme=ilk + timedelta(days=90),
        urun_sayisi=3,
        raf_payi=0.05,
        kaynak_url="test://g",
    )


def _veri(n, gecikme):
    s, g = [], []
    for i in range(n):
        sezon = ("SS24", "FW24")[i % 2]
        s.append(_s(sezon, f"d{i}"))
        g.append(_g(f"d{i}", sz.raf_tarihi(sezon, gecikme)))
    return s, g


def test_onsel_az_veride():
    s, g = _veri(2, 2.0)
    deger, kaynak, ayr = gk.olc(s, g, "orta", ONSEL)
    assert (deger, kaynak, ayr["n"]) == (3.0, "onsel", 2)


def test_karma_agirlik():
    s, g = _veri(4, 2.0)
    deger, kaynak, ayr = gk.olc(s, g, "orta", ONSEL)
    assert kaynak == "karma" and ayr["n"] == 4
    w = 4 / 12
    assert abs(deger - (w * ayr["medyan"] + (1 - w) * 3.0)) < 1e-3
    assert 2.0 < deger < 3.0


def test_olculen_medyan_ve_ceyrekler():
    s, g = _veri(10, 2.0)
    deger, kaynak, ayr = gk.olc(s, g, "orta", ONSEL)
    assert kaynak == "olculen" and abs(deger - 2.0) < 0.02
    assert ayr["q1"] <= ayr["medyan"] <= ayr["q3"]


def test_rafta_zaten_olan_ve_baska_segment_sayilmaz():
    s, g = _veri(10, 2.0)
    s.append(_s("SS24", "siyah"))
    g.append(_g("siyah", date(2020, 1, 1)))  # defileden önce rafta
    g.append(_g("d0", sz.raf_tarihi("SS24", 0.5), segment="luks"))
    eslesme = {e["deger"] for e in gk.eslesmeler(s, g, "orta")}
    assert "siyah" not in eslesme and len(eslesme) == 10
    assert gk.olc(s, g, "orta", ONSEL)[1] == "olculen"


def test_sentetik_gecikme_geri_bulunur():
    for bilinen, segment in ((3.0, "orta"), (2.0, "premium"), (1.0, "luks")):
        s, g = sentetik.uret(segment=segment, gecikme_sezon=bilinen, tohum=3)
        deger, kaynak, ayr = gk.olc(s, g, segment, {"alt": 0, "ust": 6, "mod": 4.5})
        assert kaynak == "olculen" and ayr["n"] >= 8
        assert abs(deger - bilinen) <= 0.5
