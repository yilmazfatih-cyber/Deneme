from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from yatirim_ajani.ayarlar import PIYASALAR, Ayarlar
from yatirim_ajani.bilgi import Olay, benzer, bugunku_durum, ekle, ozet_metni, sorgula, tum_olaylar
from yatirim_ajani.depo import baglan
from yatirim_ajani.ogrenme.mlp import egit_mlp
from yatirim_ajani.ogrenme.simulasyon import STRATEJILER, Panel, kesme_indeksi, panel_kur, simule
from yatirim_ajani.veri.kaynak import SentetikKaynak
from yatirim_ajani.veri.saatlik import SaatlikVeriSeti

BIST = PIYASALAR["bist"]


@pytest.fixture(scope="module")
def veri(tmp_path_factory):
    d = tmp_path_factory.mktemp("veri")
    vs = SaatlikVeriSeti(d / "saatlik")
    hisseler = ["AKBNK", "GARAN", "THYAO", "TERAX"]
    vs.cek(SentetikKaynak(), [BIST.sembol(h) for h in hisseler] + [BIST.gosterge],
           datetime(2025, 1, 1).astimezone(), datetime(2026, 6, 1).astimezone(), bes_dakika=False)  # fmt: skip
    return vs, hisseler


def test_olay_tespiti_ve_sorgu(veri):
    vs, hisseler = veri
    db = baglan(":memory:")
    olaylar = tum_olaylar(vs, BIST, hisseler)
    assert olaylar and all(o.kaynak_tipi == "sayisal" for o in olaylar)
    assert not any(o.hisse == "TERAX" for o in olaylar)  # Tera hariç
    assert any(o.kapsam == "sektor" and o.sektor == "banka" for o in olaylar)
    for o in olaylar:
        ekle(db, o)
    n = db.execute("SELECT COUNT(*) FROM olaylar").fetchone()[0]
    assert n == len(olaylar)
    # Aynı anahtarla metin yüklemesi sayıyı artırmaz, anlamı günceller
    o = olaylar[0]
    metin = Olay(**{**o.model_dump(), "anlam": "Deneme anlamı", "guven": 0.9, "kaynak_tipi": "birlesik"})
    ekle(db, metin)
    assert db.execute("SELECT COUNT(*) FROM olaylar").fetchone()[0] == n
    df = sorgula(db, hisse=o.hisse, metin="Deneme")
    assert len(df) == 1 and df.iloc[0]["guven"] == 0.9
    assert "Deneme anlamı" in ozet_metni(df, uzun=True)
    durum = bugunku_durum(vs, BIST, "AKBNK")
    b = benzer(db, durum, hisse="AKBNK", k=2)
    assert len(b) <= 2 and "uzaklik" in b


def test_simulasyon_maliyet_ve_bacaklar(veri):
    vs, hisseler = veri
    panel = panel_kur(vs, BIST, hisseler)
    assert "TERAX" not in panel.hisseler and len(panel.gunler) > 200
    c = 0.0015
    al = simule(panel, STRATEJILER["al_tut"], "al_tut", 1_000_000, c)
    gece = simule(panel, STRATEJILER["gece"], "gece", 1_000_000, c)
    brut = simule(panel, STRATEJILER["gece"], "gece", 1_000_000, 0.0)
    # Al-tut maliyeti yalnız giriş + çıkış; gece her gün iki bacak → çok daha pahalı
    assert al.islem_maliyeti < 5_000 and gece.islem_maliyeti > 50 * al.islem_maliyeti
    assert gece.bitis < brut.bitis
    # Gece + gündüz, maliyetsiz, al-tut'u (maliyetsiz) yeniden oluşturur
    gunduz = simule(panel, STRATEJILER["gunduz"], "gunduz", 1_000_000, 0.0)
    altut0 = simule(panel, STRATEJILER["al_tut"], "al_tut", 1_000_000, 0.0)
    assert (1 + brut.getiri) * (1 + gunduz.getiri) == pytest.approx(1 + altut0.getiri, rel=0.15)
    kes = kesme_indeksi(panel, 6)
    ileri = simule(panel, STRATEJILER["al_tut"], "al_tut", 1_000_000, c, bas=kes)
    assert len(ileri.egri) < len(al.egri)


def test_mlp_ogrenir_dogrusal_olmayan_iliski():
    rng = np.random.default_rng(1)
    X = rng.normal(size=(4000, 3))
    y = np.tanh(X[:, 0]) * 0.02 + 0.01 * X[:, 1] ** 2 + rng.normal(0, 0.003, 4000)
    m, bilgi = egit_mlp(X[:3000], y[:3000], gizli=16, donem=200)
    th = m.tahmin(X[3000:])
    assert np.corrcoef(th, y[3000:])[0, 1] > 0.8
    assert bilgi["dogrulama_mse"] < 1.0
