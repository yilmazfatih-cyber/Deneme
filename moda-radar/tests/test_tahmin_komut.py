import json

from moda_radar.__main__ import main
from moda_radar.tahmin import komut


def _sinyal_dosyasi(klasor, ornek=False):
    klasor.mkdir(parents=True, exist_ok=True)
    veri = {
        "sezon": "SS27",
        "ornek": ornek,
        "sinyaller": [
            {
                "nitelik_ekseni": "renk",
                "nitelik_degeri": "19-4052 TCX",
                "podyum_payi": 0.08,
                "marka_sayisi": 12,
                "kaynak_turu": "rapor",
                "kaynak_url": "https://ornek.test/rapor",
                "kaynak_tarihi": "2026-10-05",
                "guven": 0.4,
            },
            {
                "nitelik_ekseni": "siluet",
                "nitelik_degeri": "oversize",
                "podyum_payi": 0.2,
                "marka_sayisi": 20,
                "kaynak_turu": "rapor",
                "kaynak_url": "https://ornek.test/rapor",
                "kaynak_tarihi": "2026-10-05",
            },
        ],
    }
    (klasor / ("ornek.json" if ornek else "ss27.json")).write_text(json.dumps(veri), encoding="utf-8")


def test_sinyal_dosyalari_ornek_atlanir(tmp_path):
    _sinyal_dosyasi(tmp_path / "s", ornek=True)
    assert komut.sinyal_dosyalari_oku(tmp_path / "s") == []
    _sinyal_dosyasi(tmp_path / "s")
    assert len(komut.sinyal_dosyalari_oku(tmp_path / "s")) == 2


def test_tahmin_komutu(tmp_path, capsys):
    _sinyal_dosyasi(tmp_path / "s")
    cikti = tmp_path / "sezonlar"
    kod = main(
        [
            "tahmin",
            "--sezon",
            "SS27",
            "--segment",
            "hepsi",
            "--kategori",
            "kadin-ust",
            "--eksen",
            "renk",
            "--db",
            str(tmp_path / "yok.db"),
            "--sinyaller",
            str(tmp_path / "s"),
            "--cikti",
            str(cikti),
        ]
    )
    assert kod == 0
    yazilan = sorted(p.name for p in (cikti / "SS27").iterdir())
    assert yazilan == [f"tahmin-{k}.json" for k in sorted(["luks", "premium", "orta", "deger", "pazar"])]
    orta = json.loads((cikti / "SS27" / "tahmin-orta.json").read_text(encoding="utf-8"))
    assert len(orta) == 1 and orta[0]["nitelik_degeri"] == "19-4052 TCX"
    assert orta[0]["ufuk_sezon"] == "SS28" and orta[0]["esik_raf_payi"] == 0.04
    assert "19-4052 TCX" in capsys.readouterr().out


def test_geriye_test_sentetik_komutu(tmp_path, capsys):
    karne = tmp_path / "karne.md"
    kod = main(
        [
            "geriye-test",
            "--tahmin",
            "SS25",
            "--veri-kadar",
            "2024-09-30",
            "--segment",
            "orta",
            "--kategori",
            "kadin-ust",
            "--sentetik",
            "--tohum",
            "1",
            "--karne",
            str(karne),
        ]
    )
    out = capsys.readouterr().out
    assert "sentetik" in out
    assert kod == 0 and karne.exists()


def test_geriye_test_tabani_gecemeyince_kod_2(tmp_path, capsys):
    argv = ["geriye-test", "--tahmin", "SS25", "--veri-kadar", "2024-09-30", "--sentetik", "--tohum", "4"]
    kod = main([*argv, "--karne", str(tmp_path / "k.md")])
    assert kod == 2
    assert "Rapor üretilebilir: hayır" in capsys.readouterr().out


def test_gozlem_dosyalari(tmp_path):
    k = tmp_path / "g"
    k.mkdir()
    kayit = {
        "segment": "orta",
        "marka": "m",
        "kategori": "kadin-ust",
        "nitelik_ekseni": "renk",
        "nitelik_degeri": "19-4052 TCX",
        "ilk_gorulme": "2025-03-01",
        "son_gorulme": "2025-05-01",
        "urun_sayisi": 3,
        "raf_payi": 0.08,
        "kaynak_url": "https://ornek.test/g",
        "kaynak_turu": "rapor",
    }
    (k / "tr.json").write_text(json.dumps({"ulke": "TR", "gozlemler": [kayit]}), encoding="utf-8")
    (k / "ornek.json").write_text(json.dumps({"ornek": True, "gozlemler": [kayit]}), encoding="utf-8")
    assert len(komut.gozlem_dosyalari_oku(k)) == 1
    _sinyal_dosyasi(tmp_path / "s")
    s, g = komut.veri_yukle(str(tmp_path / "yok.db"), str(tmp_path / "s"), "TR", "kadin-ust", str(k))
    assert len(s) == 2 and len(g) == 1
    _, g2 = komut.veri_yukle(str(tmp_path / "yok.db"), str(tmp_path / "s"), "TR", "erkek-ust", str(k))
    assert g2 == []
