import json
import sys
import types
from datetime import date

import pytest

from moda_radar.__main__ import main
from moda_radar.renk import pantone, uzay
from moda_radar.sema import Kaynak, KaynakTuru, RenkKaydi


def test_esle_metin(capsys):
    assert main(["esle", "--hex", "#DA321C"]) == 0
    cikti = capsys.readouterr().out
    assert "18-1561 TCX" in cikti and "aile: kirmizi" in cikti and "eslesme" in cikti
    assert cikti.count(" TCX ") == 2


def test_esle_json(capsys):
    assert main(["esle", "--hex", "2E5A88", "--json"]) == 0
    veri = json.loads(capsys.readouterr().out)
    assert veri["aile"] == "mavi" and len(veri["adaylar"]) == 2
    assert {"kod", "hex", "delta_e", "ad", "guven"} <= set(veri["adaylar"][0])


def test_esle_gecersiz(capsys):
    assert main(["esle", "--hex", "kirmizi"]) == 2


def test_renk_veri_modulu_yok(monkeypatch, tmp_path, capsys):
    monkeypatch.setitem(sys.modules, "moda_radar.veri.depo", None)
    assert main(["renk", "--sezon", "SS27", "--db", str(tmp_path / "x.db"), "--cikti", str(tmp_path)]) == 1
    assert "veri modülü yok" in capsys.readouterr().out


def test_renk_db_yok(tmp_path, capsys):
    pytest.importorskip("moda_radar.veri.depo")
    assert main(["renk", "--sezon", "SS27", "--db", str(tmp_path / "yok.db"), "--cikti", str(tmp_path)]) == 1
    assert "veritabanı yok" in capsys.readouterr().out
    assert not (tmp_path / "yok.db").exists()


def _sahte_depo(kayitlar):
    class Depo:
        def __init__(self, yol):
            self.yol = yol

        def parca_renkleri(self, sezon):
            return kayitlar.get(sezon, [])

    m = types.ModuleType("moda_radar.veri.depo")
    m.Depo = Depo
    return m


def _kayit(hex_, pay, marka, sezon):
    lab = uzay.hex_to_lab(hex_)
    bir, iki = pantone.esle(hex_)
    return RenkKaydi(
        kaynak=Kaynak(
            tur=KaynakTuru.PODYUM,
            url=f"https://ornek/{marka}",
            tarama_tarihi=date(2026, 10, 1),
            sezon=sezon,
            marka=marka,
        ),
        parca_id=f"{marka}-{hex_}",
        rol="baskin",
        pay=pay,
        lab=lab,
        hex=hex_,
        pantone=bir,
        ikinci_aday=iki,
    )


def test_renk_sahte_depo_ile_palet_yazar(monkeypatch, tmp_path, capsys):
    kayitlar = {
        "SS27": [_kayit("#DD4132", 0.7, "A", "SS27"), _kayit("#2E5A88", 0.3, "B", "SS27")],
        "FW26": [_kayit("#2E5A88", 0.8, "A", "FW26"), _kayit("#F3ECE0", 0.2, "A", "FW26")],
    }
    monkeypatch.setitem(sys.modules, "moda_radar.veri.depo", _sahte_depo(kayitlar))
    db = tmp_path / "moda.db"
    db.write_bytes(b"")
    kod = main(["renk", "--sezon", "SS27", "--onceki", "FW26", "--db", str(db), "--cikti", str(tmp_path)])
    assert kod == 0, capsys.readouterr().out
    md = (tmp_path / "SS27" / "palet.md").read_text(encoding="utf-8")
    veri = json.loads((tmp_path / "SS27" / "palet.json").read_text(encoding="utf-8"))
    assert "17-1564 TCX" in md and "(Pantone adı: Fiesta)" in md
    yonler = {s["pantone"]["kod"]: s["yon"] for s in veri["satirlar"]}
    assert yonler["17-1564 TCX"] == "giris"
    assert veri["satirlar"][1]["yon"] == "cikis"  # mavi %80 → %30


def test_renk_bos_sezon(monkeypatch, tmp_path, capsys):
    monkeypatch.setitem(sys.modules, "moda_radar.veri.depo", _sahte_depo({}))
    db = tmp_path / "moda.db"
    db.write_bytes(b"")
    assert main(["renk", "--sezon", "SS27", "--db", str(db), "--cikti", str(tmp_path)]) == 1
    assert "parca_renk kaydı yok" in capsys.readouterr().out


def test_renk_gercek_depo(tmp_path, capsys):
    depo_mod = pytest.importorskip("moda_radar.veri.depo")
    db = tmp_path / "moda.db"
    with depo_mod.Depo(db) as d:
        if not hasattr(d, "ekle_parca_renk"):
            pytest.skip("Depo.ekle_parca_renk yok")
        d.ekle_parca_renk([_kayit("#DD4132", 0.6, "A", "SS27"), _kayit("#D73C26", 0.4, "B", "SS27")])
    assert main(["renk", "--sezon", "SS27", "--db", str(db), "--cikti", str(tmp_path)]) == 0
    veri = json.loads((tmp_path / "SS27" / "palet.json").read_text(encoding="utf-8"))
    assert len(veri["satirlar"]) == 1 and veri["satirlar"][0]["marka_sayisi"] == 2
