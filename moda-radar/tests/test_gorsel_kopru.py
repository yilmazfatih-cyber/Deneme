"""Toplayıcı ↔ görsel köprüsü (moda_radar/veri/nitelik_koprusu.py) ve podyum toplayıcısına bağlanışı."""

import logging
import sys
import types
from datetime import date
from pathlib import Path

import pytest
from test_gorsel_etiketle import FIXTURE, KAYNAK, SahteIstemci, png

from moda_radar.gorsel.etiketle import Etiketleyici
from moda_radar.sema import DefileTanimi
from moda_radar.veri import nitelik_koprusu as nk
from moda_radar.veri import podyum_vogue as pv
from moda_radar.veri.depo import Depo

VOGUE = Path(__file__).parent / "fixtures" / "vogue_ornek.html"


@pytest.fixture(autouse=True)
def _temiz(monkeypatch):
    monkeypatch.setattr(nk, "_uyarildi", False)
    monkeypatch.setattr(nk, "_etiketleyici", None)


@pytest.fixture
def acik(monkeypatch):
    """Anahtar var; anthropic paketi kurulu olmasa da içe aktarılabilir; etiketleyici sahte istemcili."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sahte")
    if "anthropic" not in sys.modules:
        monkeypatch.setitem(sys.modules, "anthropic", types.ModuleType("anthropic"))
    istemci = SahteIstemci(FIXTURE.read_text("utf-8"))
    monkeypatch.setattr(nk, "_etiketleyici", Etiketleyici("claude-sonnet-5-5", istemci))
    return istemci


def test_anahtar_yokken_bos_ve_bir_kez_uyari(monkeypatch, caplog):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with caplog.at_level(logging.WARNING):
        assert nk.nitelik_kayitlari(png(), KAYNAK, "g1", "g1") == []
        assert nk.nitelik_kayitlari(png(), KAYNAK, "g2", "g2") == []
        assert not nk.nitelik_acik()
    assert caplog.text.count("nitelik etiketleme kapalı: ANTHROPIC_API_KEY yok") == 1


def test_anahtar_yokken_depoya_yazmaz(monkeypatch, tmp_path):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with Depo(tmp_path / "m.db") as depo:
        assert nk.etiketle_ve_kaydet(depo, png(), KAYNAK, "g1", "g1") == 0
        assert depo.baglanti.execute("SELECT COUNT(*) FROM parca_nitelik").fetchone()[0] == 0


def test_paket_yoksa_kapali(monkeypatch, caplog):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sahte")
    monkeypatch.setattr(nk, "_modul", lambda ad: None)
    assert not nk.nitelik_acik()
    assert "paketi yok" in caplog.text


def test_etiketle_ve_kaydet_yazar(acik, tmp_path):
    with Depo(tmp_path / "m.db") as depo:
        d = DefileTanimi(sezon="SS27", marka="Ornek", sehir="Paris", kaynak="vogue", kaynak_kimligi="s/ornek")
        g1 = depo.ekle_gorsel(depo.ekle_defile(d), KAYNAK.url, date(2026, 10, 2), 1)
        assert nk.etiketle_ve_kaydet(depo, png(), KAYNAK, g1, "g1") == 3
        assert nk.etiketle_ve_kaydet(depo, png(), KAYNAK, g1, "g1") == 0  # haftalık tekrar: API çağrılmaz
        assert len(acik.istekler) == 1
        satirlar = depo.baglanti.execute("SELECT parca_id, siluet, denetim FROM parca_nitelik ORDER BY parca_id")
        assert [tuple(r) for r in satirlar] == [
            ("g1-aksesuar", "bilinmiyor", 0),
            ("g1-alt", "bol", 0),
            ("g1-dis", "oversize", 0),
        ]


def test_etiketleyici_patlasa_da_istisna_yok(acik, monkeypatch):
    def patla(*a, **k):
        raise RuntimeError("beklenmedik")

    monkeypatch.setattr(nk._etiketleyici, "etiketle", patla)
    assert nk.nitelik_kayitlari(png(), KAYNAK, "g1", "g1") == []


def test_defile_tara_renk_yokken_de_nitelik_etiketler(acik, tmp_path, monkeypatch):
    from moda_radar.veri import renk_koprusu

    monkeypatch.setattr(renk_koprusu, "renk_modulu_var", lambda: False)
    d = DefileTanimi(sezon="SS27", marka="Ornek", sehir="Paris", kaynak="vogue", kaynak_kimligi="s/ornek")

    class Tarayici:
        istek_sayisi = 0

        def metin(self, url):
            return VOGUE.read_text("utf-8") if url == pv.defile_url(d) else ""

        def getir(self, url, kabul=""):
            return png()

    with Depo(tmp_path / "m.db") as depo:
        s = pv.defile_tara(depo, d, Tarayici(), bugun=date(2026, 10, 2))
        assert s["nitelikli"] == 3 and s["renkli"] == 0
        assert depo.baglanti.execute("SELECT COUNT(*) FROM parca_nitelik").fetchone()[0] == 9
        siluet = {x.nitelik_degeri for x in depo.sinyaller("SS27") if x.nitelik_ekseni == "siluet"}
        assert siluet == {"oversize", "bol"}
    assert len(acik.istekler) == 3
