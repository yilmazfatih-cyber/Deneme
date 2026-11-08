import json
from datetime import date

from moda_radar.gorsel import oturum
from moda_radar.sema import DefileTanimi
from moda_radar.veri.depo import Depo


def _depo(tmp_path):
    depo = Depo(tmp_path / "moda.db")
    d = DefileTanimi(
        sezon="SS27",
        marka="Ornek Ev",
        sehir="Paris",
        kaynak="vogue",
        kaynak_kimligi="spring-2027-ready-to-wear/ornek-ev",
    )
    defile_id = depo.ekle_defile(d)
    for i in range(3):
        depo.ekle_gorsel(
            defile_id, f"https://assets.vogue.com/photos/{i:024x}/master/w_2560/look{i}.jpg", date(2026, 11, 8), i
        )
    return depo


def test_bekleyenler_ve_yukle(tmp_path):
    depo = _depo(tmp_path)
    bekleyen = oturum.bekleyenler(depo, "SS27", 10)
    assert len(bekleyen) == 3
    gid = bekleyen[0]["id"]
    dosya = tmp_path / "etiket.json"
    dosya.write_text(
        json.dumps(
            {
                "sezon": "SS27",
                "etiketleyen_model": "claude-code/test",
                "kayitlar": [
                    {
                        "gorsel_id": gid,
                        "parca_id": "l0-ust",
                        "parca_konumu": "ust",
                        "kategori": "kadin-ust",
                        "siluet": "oversize",
                        "kumas_gorunumu": "keten",
                        "desen": "duz",
                    },
                    {
                        "gorsel_id": gid,
                        "parca_id": "l0-alt",
                        "parca_konumu": "alt",
                        "kategori": "kadin-alt",
                        "siluet": "UYDURMA",
                    },
                    {"gorsel_id": gid, "parca_konumu": "yok-boyle", "kategori": "kadin-ust"},
                    {"gorsel_id": "yok", "parca_konumu": "ust", "kategori": "kadin-ust"},
                ],
            }
        ),
        "utf-8",
    )
    sayac = oturum.yukle(depo, dosya)
    assert sayac["yazilan"] == 2 and sayac["dusen"] == 1 and sayac["bilinmeyen_gorsel"] == 1 and sayac["uyari"] >= 1
    assert len(oturum.bekleyenler(depo, "SS27", 10)) == 2
    satir = depo.baglanti.execute(
        "SELECT siluet, etiketleyen_model FROM parca_nitelik WHERE parca_id='l0-alt'"
    ).fetchone()
    assert satir[0] == "bilinmiyor" and satir[1] == "claude-code/test"
