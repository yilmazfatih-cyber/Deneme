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


def _sahte_perakende(monkeypatch, sonuclar):
    """Her hedef için sonuç sözlüğü ya da istisna; ağa çıkılmaz."""
    from moda_radar.veri import perakende

    hs = [
        perakende.PerakendeHedefi(segment="orta", marka=m, kategori="kadin-ust", url=f"https://{m}.invalid", secici={})
        for m in sonuclar
    ]
    monkeypatch.setattr(perakende, "kaynaklari_oku", dict)
    monkeypatch.setattr(perakende, "hedefler", lambda veri, segment=None, kategori=None: hs)
    denenen = []

    def sahte_tara(depo, h, tarayici):
        denenen.append(h.marka)
        s = sonuclar[h.marka]
        if isinstance(s, Exception):
            raise s
        return {"hedef": f"orta/{h.marka}/kadin-ust", "bulunan": s}

    monkeypatch.setattr(perakende, "kaynak_tara", sahte_tara)
    return denenen


def test_topla_perakende_hedef_istisnasi_otekileri_durdurmaz(monkeypatch, capsys, tmp_path):
    class PlaywrightHatasi(Exception):  # playwright._impl._errors.Error gibi: AG_HATALARI dışında
        pass

    hata = PlaywrightHatasi("Page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.lcw.com/x\nCall log: ...")
    denenen = _sahte_perakende(monkeypatch, {"Zara": 0, "LCW": hata, "Addax": 12, "Trendyol": 30})
    assert main(["topla", "--kaynak", "perakende", "--db", str(tmp_path / "m.db")]) == 0
    assert denenen == ["Zara", "LCW", "Addax", "Trendyol"]
    satirlar = capsys.readouterr().out.strip().splitlines()
    lcw = json.loads(satirlar[1])
    assert lcw["hedef"] == "orta/LCW/kadin-ust" and lcw["bulunan"] == 0
    assert lcw["hata"] == "PlaywrightHatasi: Page.goto: net::ERR_HTTP2_PROTOCOL_ERROR at https://www.lcw.com/x"
    assert satirlar[-1].startswith("perakende: 4 hedef, 42 ürün, 1 hata")


def test_topla_perakende_hic_urun_yoksa_cikis_1(monkeypatch, capsys, tmp_path):
    _sahte_perakende(monkeypatch, {"Zara": 0, "LCW": RuntimeError("robots")})
    assert main(["topla", "--kaynak", "perakende", "--db", str(tmp_path / "m.db")]) == 1
    assert "perakende: 2 hedef, 0 ürün, 1 hata" in capsys.readouterr().out


def test_kisa_hata_tek_satir_ve_sinirli():
    assert komut.kisa_hata(ValueError("a\nb")) == "ValueError: a"
    assert komut.kisa_hata(KeyError()) == "KeyError"
    assert len(komut.kisa_hata(OSError("x" * 500))) == 200
