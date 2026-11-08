import json
from datetime import date
from pathlib import Path

from moda_radar.sema import SegmentDosyasi
from moda_radar.tahmin import geriye_test as gt
from moda_radar.tahmin import sentetik
from moda_radar.tahmin import sezon as sz

SEG = SegmentDosyasi.model_validate(json.loads(Path("content/segmentler.json").read_text(encoding="utf-8")))
SEZONLAR = [sz.ekle("SS22", i) for i in range(8)]  # SS22..FW25


def _veri(tohum=1):
    return sentetik.uret(sezonlar=SEZONLAR, segment="orta", gecikme_sezon=3.0, tohum=tohum)


def test_zaman_kilidi():
    s, g = _veri()
    kadar = date(2024, 9, 30)
    ks, kg = gt.kilitle(s, g, kadar)
    assert ks and kg
    assert all(k.kaynak_tarihi <= kadar for k in ks)
    assert all(k.ilk_gorulme <= kadar and k.son_gorulme <= kadar for k in kg)
    assert len(ks) < len(s) and len(kg) < len(g)


class _KilitliDepo:
    """veri modülündeki KilitliDepo benzeri: yöntemle kayıt döner."""

    def __init__(self, s, g):
        self._s, self._g = s, g

    def sinyaller(self, sezon=None):
        return self._s

    def gozlemler(self, ulke="TR", segment=None, kategori=None):
        return self._g


def test_sentetik_geriye_test_tabanlari_gecer():
    s, g = _veri()
    sonuclar = []
    for sezon, kadar in (("SS25", date(2024, 9, 30)), ("FW25", date(2025, 3, 15))):
        r = gt.calistir(sezon, kadar, s, g, SEG, "orta", "kadin-ust", sentetik=True)
        assert r["gecikme"]["kaynak"] == "olculen"
        assert abs(r["gecikme"]["sezon"] - 3.0) <= 0.5
        assert r["ufuk_sezon"] == sz.ekle(sezon, 2)
        assert r["n_tahmin"] > 20 and 0 < r["n_gerceklesen"] < r["n_tahmin"]
        o = r["olcutler"]
        assert o["model"]["brier"] < o["taban_a"]["brier"]
        assert o["model"]["brier"] < o["taban_c"]["brier"]
        assert r["rapor_uretilebilir"] is True
        sonuclar.append(r)
    # depo benzeri nesneyle aynı sonuç
    r2 = gt.calistir("SS25", date(2024, 9, 30), _KilitliDepo(s, g), _KilitliDepo(s, g), SEG, "orta", "kadin-ust")
    assert r2["olcutler"]["model"] == sonuclar[0]["olcutler"]["model"]


def test_brier_ustunlugu_tohumlar_boyunca():
    for tohum in range(1, 11):
        s, g = _veri(tohum)
        for sezon, kadar in (("SS25", date(2024, 9, 30)), ("FW25", date(2025, 3, 15))):
            o = gt.calistir(sezon, kadar, s, g, SEG, "orta", "kadin-ust")["olcutler"]
            assert o["model"]["brier"] < min(o["taban_a"]["brier"], o["taban_c"]["brier"]), (tohum, sezon)


def test_gelecek_veri_tahmini_degistirmez():
    s, g = _veri()
    kadar = date(2024, 9, 30)
    tam = gt.calistir("SS25", kadar, s, g, SEG, "orta", "kadin-ust")
    ks, kg = gt.kilitle(s, g, kadar)
    kisitli = gt.calistir("SS25", kadar, ks, kg, SEG, "orta", "kadin-ust", gercek_gozlemler=g)
    assert [t["olasilik"] for t in tam["tahminler"]] == [t["olasilik"] for t in kisitli["tahminler"]]


def test_tabani_gecemeyen_model_rapor_uretmez():
    s, g = _veri()
    # gerçekleşmeyi tersine çevir: model ters yönde yanılır
    ters = [k.model_copy(update={"raf_payi": max(0.0, 0.08 - (k.raf_payi or 0))}) for k in g]
    r = gt.calistir("SS25", date(2024, 9, 30), s, g, SEG, "orta", "kadin-ust", gercek_gozlemler=ters)
    assert r["rapor_uretilebilir"] is False
    assert not all(r["gecti"].values())


def test_sinyal_yoksa_rapor_yok():
    s, g = _veri()
    r = gt.calistir("SS25", date(2020, 1, 1), s, g, SEG, "orta", "kadin-ust")
    assert r["n_tahmin"] == 0 and r["rapor_uretilebilir"] is False


def test_karne_yaz(tmp_path):
    s, g = _veri()
    r1 = gt.calistir("SS25", date(2024, 9, 30), s, g, SEG, "orta", "kadin-ust", sentetik=True)
    r2 = gt.calistir("FW25", date(2025, 3, 15), s, g, SEG, "orta", "kadin-ust", sentetik=True)
    yol = gt.karne_yaz([r1, r2], tmp_path / "v0.md")
    metin = yol.read_text(encoding="utf-8")
    assert "GERÇEK VERİ DEĞİLDİR" in metin
    assert "Rapor üretilebilir (ilke 5): evet" in metin
    assert "SS25" in metin and "FW25" in metin and "Kalibrasyon" in metin
    tek = gt.karne_yaz(r1, tmp_path / "tek.md").read_text(encoding="utf-8")
    assert "Rapor üretilebilir (ilke 5): hayır" in tek
