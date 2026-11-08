import urllib.robotparser
from datetime import date

import pytest

from moda_radar.sema import Kaynak, KaynakTuru, Lab
from moda_radar.veri import ag, renk_koprusu


def _tarayici(robots_satirlari, yasaklar=()):
    t = ag.Tarayici(yasaklar=set(yasaklar))
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(robots_satirlari)
    t._robots["www.ornek.invalid"] = rp
    return t


def test_kullanici_aracisi_durust():
    assert ag.KULLANICI_ARACISI.startswith("ModaRadar/") and "github.com" in ag.KULLANICI_ARACISI


def test_robots_ve_yasak_listesi():
    t = _tarayici(["User-agent: *", "Disallow: /hesap"])
    assert t.izinli_mi("https://www.ornek.invalid/kadin")
    assert not t.izinli_mi("https://www.ornek.invalid/hesap/giris")
    t2 = _tarayici([], yasaklar={"ornek.invalid"})
    assert not t2.izinli_mi("https://www.ornek.invalid/kadin")
    with pytest.raises(ag.TaramaYasak):
        t2.getir("https://www.ornek.invalid/kadin")


def test_hiz_siniri_saniyede_bir(monkeypatch):
    t = ag.Tarayici(en_az_aralik=0.1, yasaklar=set())
    assert t.en_az_aralik == 1.0  # 1 sn altına inilemez
    uyumalar = []
    monkeypatch.setattr(ag.time, "sleep", uyumalar.append)
    saat = iter([100.0, 100.0, 100.2, 100.2])
    monkeypatch.setattr(ag.time, "monotonic", lambda: next(saat))
    t._son_istek = 0.0
    t._bekle()
    t._bekle()
    assert uyumalar and uyumalar[0] == pytest.approx(0.8)


def test_yasak_dosyasi_okunur():
    assert isinstance(ag.yasak_alanlar(), set)


def test_lab_hex():
    assert renk_koprusu.lab_hex(Lab(L=100, a=0, b=0)) == "#FFFFFF"
    assert renk_koprusu.lab_hex(Lab(L=0, a=0, b=0)) == "#000000"
    assert renk_koprusu.lab_hex(Lab(L=53.24, a=80.09, b=67.2)) == "#FF0000"


def test_renk_kayitlari_modul_yoksa_bos(monkeypatch):
    monkeypatch.setattr(renk_koprusu, "_modul", lambda ad: None)
    k = Kaynak(tur=KaynakTuru.PODYUM, url="https://a/1.jpg", tarama_tarihi=date(2026, 10, 1), sezon="SS27")
    assert renk_koprusu.renk_kayitlari(b"x", k, "p") == []
    assert renk_koprusu.renk_modulu_var() is False
