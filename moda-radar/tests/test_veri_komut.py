import json
from datetime import date

from moda_radar.__main__ import main
from moda_radar.sema import DefileTanimi
from moda_radar.veri import komut


def test_guncel_sezon():
    assert komut.guncel_sezon(date(2026, 11, 8)) == "SS27"
    assert komut.guncel_sezon(date(2027, 1, 15)) == "SS27"
    assert komut.guncel_sezon(date(2027, 3, 10)) == "FW27"


def test_defileler_dosyasi():
    veri = json.loads(komut.DEFILE_DOSYASI.read_text("utf-8"))
    defileler = [DefileTanimi.model_validate(d) for d in veri["defileler"]]
    for sezon in ("SS27", "FW26", "SS26"):
        bu = [d for d in defileler if d.sezon == sezon]
        assert len({d.marka for d in bu}) >= 25
        assert {"Paris", "Milano", "Londra", "New York"} <= {d.sehir for d in bu}
        assert len([d for d in bu if d.sehir == "Istanbul"]) == 5
    kimlikler = [(d.kaynak, d.kaynak_kimligi) for d in defileler]
    assert len(kimlikler) == len(set(kimlikler))
    assert all(d.kaynak_kimligi.startswith(("spring-", "fall-")) for d in defileler if d.kaynak == "vogue")


def test_topla_kuru_podyum(capsys, tmp_path):
    assert main(["topla", "--sezon", "SS27", "--kaynak", "podyum", "--kuru", "--db", str(tmp_path / "m.db")]) == 0
    cikti = capsys.readouterr().out
    assert "spring-2027-ready-to-wear/prada" in cikti
    assert not (tmp_path / "m.db").exists()  # kuru: DB bile açılmaz


def test_topla_kuru_perakende(capsys):
    assert main(["topla", "--kaynak", "perakende", "--segment", "orta", "--kuru"]) == 0
    cikti = capsys.readouterr().out
    assert "LC Waikiki" in cikti and "DOĞRULANMADI" in cikti and "Beymen" not in cikti


def test_sinyal_yukle_db_ozet_gecikme(capsys, tmp_path):
    db = str(tmp_path / "m.db")
    assert main(["sinyal-yukle", "--ornekler", "--db", db]) == 0
    assert "sinyal yüklendi" in capsys.readouterr().out
    assert main(["db-ozet", "--db", db, "--json"]) == 0
    o = json.loads(capsys.readouterr().out)
    assert o["satir"]["sinyal"] >= 3
    assert main(["db-ozet", "--db", db]) == 0
    assert "| sinyal |" in capsys.readouterr().out
    assert main(["gecikme-olc", "--segment", "orta", "--kategori", "kadin-ust", "--db", db]) == 0
    assert '"n": 0' in capsys.readouterr().out
