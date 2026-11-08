from datetime import date
from pathlib import Path

import pytest

pytest.importorskip("bs4")

from moda_radar.veri import perakende
from moda_radar.veri.depo import Depo

FIXTURE = Path(__file__).parent / "fixtures" / "perakende_ornek.html"
SECICI = {
    "kart": "li.urun-karti",
    "baslik": ".urun-adi",
    "fiyat": ".fiyat",
    "eski_fiyat": ".eski",
    "link": "a.urun-link",
    "gorsel": "img.urun-gorsel",
    "gorsel_nitelik": ["data-src", "src"],
}


@pytest.mark.parametrize(
    "metin,beklenen",
    [
        ("1.299,90 TL", 1299.90),
        ("₺1.499", 1499.0),
        ("899 TL", 899.0),
        ("1,299.95", 1299.95),
        ("49,9", 49.9),
        ("", None),
        ("fiyat yok", None),
    ],
)
def test_fiyat_coz(metin, beklenen):
    assert perakende.fiyat_coz(metin) == beklenen


def test_urunleri_ayikla():
    urunler = perakende.urunleri_ayikla(FIXTURE.read_text("utf-8"), SECICI, "https://www.ornek.invalid/kadin-bluz")
    assert len(urunler) == 2  # linksiz kart ve yineleme atlandı
    a, b = urunler
    assert a["url"] == "https://www.ornek.invalid/kadin/keten-gomlek-p-101?renk=lacivert"
    assert a["baslik"] == "Keten Oversize Gömlek"
    assert (a["fiyat"], a["eski_fiyat"], a["indirim_yuzde"]) == (899.90, 1299.90, 30.8)
    assert a["gorsel_url"] == "https://cdn.ornek.invalid/img/101.jpg"  # data: atlandı, data-src seçildi
    assert (b["fiyat"], b["indirim_yuzde"], b["gorsel_url"]) == (1499.0, None, "https://cdn.ornek.invalid/img/102.jpg")


def test_kaynak_dosyasi_gecerli_ve_dogrulanmamis():
    veri = perakende.kaynaklari_oku()
    hs = perakende.hedefler(veri)
    markalar = {h.marka for h in hs}
    assert {"Beymen", "Zara", "LC Waikiki", "Addax", "Trendyol"} <= markalar
    assert {h.segment for h in hs} == {"luks", "premium", "orta", "deger"}
    assert not any(h.dogrulandi for h in hs)  # ağsız yazıldı; ilk CI çalışmasında doğrulanacak
    assert [h.marka for h in perakende.hedefler(veri, "luks")] == ["Beymen"] * len(perakende.hedefler(veri, "luks"))


def test_kaynak_dogrulama_eksik_secici():
    hatalar = perakende.kaynaklari_dogrula(
        {"segmentler": {"orta": {"X": {"kategoriler": {"kadin-ust": "http://x"}, "secici": {"kart": "a"}}}}}
    )
    assert any("eksik seçiciler" in h for h in hatalar)
    assert any("dogrulandi" in h for h in hatalar)
    assert any("https://" in h for h in hatalar)


class SahteTarayici:
    def __init__(self, html):
        self.html = html
        self.istek_sayisi = 0

    def metin(self, url):
        return self.html


def test_kaynak_tara_upsert_ve_pasif(tmp_path, monkeypatch):
    from moda_radar.veri import renk_koprusu

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: False)
    h = perakende.PerakendeHedefi(
        segment="orta", marka="Ornek", kategori="kadin-ust", url="https://www.ornek.invalid/kadin-bluz", secici=SECICI
    )
    with Depo(tmp_path / "m.db") as depo:
        depo.upsert_perakende_urun(
            segment="orta", marka="Ornek", kategori="kadin-ust", url="https://eski/urun", tarih=date(2027, 1, 1)
        )
        s = perakende.kaynak_tara(depo, h, SahteTarayici(FIXTURE.read_text("utf-8")), bugun=date(2027, 3, 1))
        assert (s["bulunan"], s["pasif"]) == (2, 1)
        perakende.kaynak_tara(depo, h, SahteTarayici(FIXTURE.read_text("utf-8")), bugun=date(2027, 3, 8))
        r = depo.baglanti.execute(
            "SELECT ilk_gorulme, son_gorulme FROM perakende_urun WHERE url LIKE '%p-101%'"
        ).fetchone()
        assert tuple(r) == ("2027-03-01", "2027-03-08")


def test_bos_sayfa_uyari(tmp_path):
    h = perakende.PerakendeHedefi(segment="orta", marka="X", kategori="kadin-ust", url="https://x", secici=SECICI)
    with Depo(tmp_path / "m.db") as depo:
        s = perakende.kaynak_tara(depo, h, SahteTarayici("<html></html>"), bugun=date(2027, 3, 1))
    assert s["bulunan"] == 0 and "dogrulandi: false" in s["uyari"]


def test_sezon_tahmini():
    assert perakende.sezon_tahmini(date(2027, 3, 1)) == "SS27"
    assert perakende.sezon_tahmini(date(2026, 10, 1)) == "FW26"
    assert perakende.sezon_tahmini(date(2027, 1, 10)) == "FW26"
