import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from moda_radar.sema import GozlemKaydi, SegmentDosyasi, SinyalKaydi, Yon
from moda_radar.tahmin import model as md
from moda_radar.tahmin import sezon as sz

SEG = SegmentDosyasi.model_validate(json.loads(Path("content/segmentler.json").read_text(encoding="utf-8")))


def _s(sezon, deger, pay, marka=5, guven=0.8, eksen="renk", tur="gorsel"):
    return SinyalKaydi(
        sezon=sezon,
        nitelik_ekseni=eksen,
        nitelik_degeri=deger,
        podyum_payi=pay,
        marka_sayisi=marka,
        kaynak_turu=tur,
        kaynak_url="test://s",
        kaynak_tarihi=sz.defile_tarihi(sezon),
        guven=guven,
    )


def _g(deger, raf, segment="orta"):
    return GozlemKaydi(
        segment=segment,
        marka="m",
        kategori="kadin-ust",
        nitelik_ekseni="renk",
        nitelik_degeri=deger,
        ilk_gorulme=date(2026, 1, 10),
        son_gorulme=date(2026, 1, 10) + timedelta(days=100),
        urun_sayisi=3,
        raf_payi=raf,
        kaynak_url="test://g",
    )


def _t(deger, sinyaller, gozlemler=(), segment="orta", sezon="SS27"):
    return md.tahmin_et(sezon, "TR", segment, "kadin-ust", "renk", deger, list(sinyaller), list(gozlemler), SEG)


def test_sinyal_yok():
    t = _t("19-4052 TCX", [])
    assert t.olasilik == 0.5 and t.kaynak_sayisi == 0
    assert "podyum sinyali yok" in t.gerekce
    assert t.gecikme_kaynagi == "onsel" and t.gecikme_sezon == 3
    assert t.ufuk_sezon == "SS28" and t.esik_raf_payi == 0.04


def test_tipik_sinyal_temel_olasilik():
    t = _t("x", [_s("SS27", "x", md.PAY_REF, md.MARKA_REF), _s("FW26", "x", md.PAY_REF, md.MARKA_REF)])
    assert t.yon == Yon.DUZ and t.olasilik == pytest.approx(0.5)


def test_pay_ve_marka_artirir():
    dusuk = _t("x", [_s("SS27", "x", 0.02, 2)])
    yuksek = _t("x", [_s("SS27", "x", 0.15, 20)])
    assert yuksek.olasilik > dusuk.olasilik
    assert yuksek.kaynak_sayisi == 1


def test_yon_etkisi():
    seri = {"FW26": 0.1, "SS27": 0.03}
    assert md.yon_hesapla(seri, "SS27") == Yon.CIKIS
    assert md.yon_hesapla({"SS27": 0.03}, "SS27") == Yon.GIRIS
    assert md.yon_hesapla({"FW26": 0.03, "SS27": 0.06}, "SS27") == Yon.YUKSELIS
    assert md.yon_hesapla({"SS26": 0.02, "FW26": 0.05, "SS27": 0.05}, "SS27") == Yon.ZIRVE
    assert md.yon_hesapla({"FW26": 0.05}, "SS27") == Yon.CIKIS
    cikis = _t("x", [_s("FW26", "x", 0.10), _s("SS27", "x", 0.05)])
    yukselis = _t("x", [_s("FW26", "x", 0.02), _s("SS27", "x", 0.05)])
    assert cikis.yon == Yon.CIKIS and yukselis.yon == Yon.YUKSELIS
    assert yukselis.olasilik > cikis.olasilik


def test_segment_uyumu():
    s = [_s("SS27", "x", 0.05)]
    yok = _t("x", s)
    var = _t("x", s, [_g("x", 0.08)])
    zayif = _t("x", s, [_g("x", 0.005)])
    assert var.olasilik > yok.olasilik > zayif.olasilik
    assert var.kaynak_sayisi == 2
    # başka segmentin rafı etkilemez
    assert _t("x", s, [_g("x", 0.08, segment="luks")]).olasilik == yok.olasilik


def test_dusuk_guven_kirpilir():
    guclu = _t("x", [_s("SS27", "x", 0.2, 30, guven=0.9)])
    zayif = _t("x", [_s("SS27", "x", 0.2, 30, guven=0.2, tur="rapor")])
    assert 0.5 < zayif.olasilik < guclu.olasilik
    assert "düşük güvenli" in zayif.gerekce


def test_kirpma_ve_gerekce():
    cok = _t("x", [_s("SS27", "x", 1.0, 200)], [_g("x", 0.3)])
    assert cok.olasilik == md.UST_SINIR
    az = _t("x", [_s("FW26", "x", 0.5, 100), _s("SS27", "x", 0.001, 1)], [_g("x", 0.0)])
    assert md.ALT_SINIR <= az.olasilik < 0.1
    for t in (cok, az):
        assert t.gerekce.count(". ") + 1 <= 3
        assert not any(k in t.gerekce.lower() for k in ("tutacak", "kesin", "garanti"))


def test_ufuk_segmente_gore():
    s = [_s("SS27", "x", 0.05)]
    assert _t("x", s, segment="luks").ufuk_sezon == "SS27"
    assert _t("x", s, segment="premium").ufuk_sezon == "FW27"
    with pytest.raises(ValueError):
        _t("x", s, segment="yok")


def test_toplu_tahmin():
    s = [_s("SS27", "a", 0.1, 10), _s("SS27", "b", 0.01, 1), _s("SS27", "oversize", 0.2, 9, eksen="siluet")]
    s.append(_s("FW26", "c", 0.1))
    hepsi = md.toplu_tahmin("SS27", "TR", "orta", "kadin-ust", s, [], SEG)
    assert hepsi[0].nitelik_degeri == "oversize"
    assert {t.nitelik_degeri for t in hepsi} == {"a", "b", "oversize"}
    olas = [t.olasilik for t in hepsi]
    assert olas == sorted(olas, reverse=True)
    renk = md.toplu_tahmin("SS27", "TR", "orta", "kadin-ust", s, [], SEG, eksen="renk")
    assert {t.nitelik_degeri for t in renk} == {"a", "b"}
