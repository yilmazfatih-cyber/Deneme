from datetime import date
from pathlib import Path

import pytest

from moda_radar.sema import DefileTanimi
from moda_radar.veri import podyum_vogue as pv
from moda_radar.veri.depo import Depo

FIXTURE = Path(__file__).parent / "fixtures" / "vogue_ornek.html"


def test_sezon_slug():
    assert pv.sezon_slug("SS27") == "spring-2027-ready-to-wear"
    assert pv.sezon_slug("FW26") == "fall-2026-ready-to-wear"
    with pytest.raises(ValueError):
        pv.sezon_slug("2027")


def test_marka_slug():
    assert pv.marka_slug("Dolce & Gabbana") == "dolce-gabbana"
    assert pv.marka_slug("Chloé") == "chloe"
    assert pv.marka_slug("Hermès") == "hermes"
    assert pv.marka_slug("Özgür Masur") == "ozgur-masur"
    assert pv.marka_slug("Niyazi Erdoğan") == "niyazi-erdogan"


def test_preloaded_state_koleksiyon_galerisi():
    urller = pv.look_urlleri(FIXTURE.read_text("utf-8"))
    assert len(urller) == 3  # Details galerisi ve JSON-LD kapak görseli dışarıda
    assert urller[0].endswith("w_2560%2Cc_limit/00001-ornek-ev-spring-2027.jpg")  # en geniş boyut seçildi
    assert [u.rsplit("/", 1)[1][:5] for u in urller] == ["00001", "00002", "00003"]


def test_jsonld_stratejisi():
    html = (
        '<script type="application/ld+json">{"@type":"ImageGallery","associatedMedia":['
        '{"contentUrl":"https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa1/master/w_1280/1.jpg"},'
        '{"contentUrl":"https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa2/master/w_1280/2.jpg"}]}</script>'
    )
    assert len(pv.look_urlleri(html)) == 2


def test_img_srcset_stratejisi():
    html = (
        '<img src="https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa1/master/w_320/1.jpg" '
        'srcset="https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa1/master/w_320/1.jpg 320w, '
        'https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa1/master/w_1600/1.jpg 1600w">'
        '<img data-src="https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa2/master/w_640/2.jpg">'
        '<img src="https://baska.site/logo.png">'
    )
    urller = pv.look_urlleri(html)
    assert urller == [
        "https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa1/master/w_1600/1.jpg",
        "https://assets.vogue.com/photos/aaaaaaaaaaaaaaaaaaaaaaa2/master/w_640/2.jpg",
    ]


def test_hicbiri_tutmazsa_bos_ve_uyari(caplog):
    assert pv.look_urlleri("<html><body>yok</body></html>") == []
    assert "hiçbir strateji" in caplog.text


class SahteTarayici:
    def __init__(self, sayfalar):
        self.sayfalar = sayfalar
        self.istenen = []
        self.istek_sayisi = 0

    def metin(self, url):
        self.istenen.append(url)
        return self.sayfalar.get(url, "")

    def getir(self, url, kabul=""):
        raise AssertionError("renk modülü yokken görsel indirilmemeli")


def test_defile_tara_yalniz_url_kaydeder(tmp_path, monkeypatch):
    from moda_radar.veri import renk_koprusu

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: False)
    d = DefileTanimi(
        sezon="SS27",
        marka="Ornek Ev",
        sehir="Paris",
        kaynak="vogue",
        kaynak_kimligi="spring-2027-ready-to-wear/ornek-ev",
    )
    t = SahteTarayici({pv.defile_url(d): FIXTURE.read_text("utf-8")})
    with Depo(tmp_path / "m.db") as depo:
        s = pv.defile_tara(depo, d, t, bugun=date(2026, 10, 2), gorsel_siniri=2)
        assert s["kaydedilen"] == 2 and s["renkli"] == 0
        satirlar = depo.baglanti.execute("SELECT url, tarama_tarihi, sira FROM gorsel ORDER BY sira").fetchall()
        assert [r["sira"] for r in satirlar] == [1, 2]
        assert satirlar[0]["tarama_tarihi"] == "2026-10-02"
    assert t.istenen == ["https://www.vogue.com/fashion-shows/spring-2027-ready-to-wear/ornek-ev"]


def test_defile_tara_renk_koprusu(tmp_path, monkeypatch):
    from moda_radar.sema import Lab, PantoneEslesme, RenkKaydi
    from moda_radar.veri import renk_koprusu

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: True)

    def sahte_renk(bayt, kaynak, parca_id, k=4):
        assert bayt == b"GORSEL"
        p = PantoneEslesme(kod="19-4052 TCX", hex="#0F4C81", delta_e=0.5)
        return [RenkKaydi(kaynak=kaynak, parca_id=parca_id, rol="baskin", pay=0.7, lab=Lab(L=32, a=0, b=-35),
                          hex="#0F4C81", pantone=p)]  # fmt: skip

    monkeypatch.setattr(renk_koprusu, "renk_kayitlari", sahte_renk)
    d = DefileTanimi(sezon="SS27", marka="Ornek", sehir="Paris", kaynak="vogue", kaynak_kimligi="s/ornek")
    t = SahteTarayici({pv.defile_url(d): FIXTURE.read_text("utf-8")})
    t.getir = lambda url, kabul="": b"GORSEL"
    with Depo(tmp_path / "m.db") as depo:
        s = pv.defile_tara(depo, d, t, bugun=date(2026, 10, 2))
        assert s["renkli"] == 3
        sinyal = [x for x in depo.sinyaller("SS27") if x.nitelik_ekseni == "renk"]
        assert sinyal[0].nitelik_degeri == "19-4052 TCX" and sinyal[0].podyum_payi == 1.0


def test_vogue_disi_kaynak_atlanir(tmp_path):
    d = DefileTanimi(sezon="SS27", marka="Gizia", sehir="Istanbul", kaynak="marka", kaynak_kimligi="mbfwi/x")
    with Depo(tmp_path / "m.db") as depo:
        assert "atlandi" in pv.defile_tara(depo, d, SahteTarayici({}))
