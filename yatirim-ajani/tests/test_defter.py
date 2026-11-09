"""Defter: ileriye dönük emir, gerçek çubukla dolum, değerleme."""

import pandas as pd
import pytest

from yatirim_ajani.portfoy.defter import Defter, adima_yuvarla, pay_hesapla


def _cubuklar(gun, fiyatlar):
    """17:00'den itibaren 5 dk çubuklar: (acilis, yuksek, dusuk, kapanis) listesi."""
    idx = pd.date_range(f"{gun} 17:00", periods=len(fiyatlar), freq="5min", tz="Europe/Istanbul")
    return pd.DataFrame(fiyatlar, index=idx, columns=["acilis", "yuksek", "dusuk", "kapanis"]).assign(hacim=1000)


def test_adim_ve_pay():
    assert adima_yuvarla(207.959, "yukari") == 208.0
    assert adima_yuvarla(47.2074, "yukari") == 47.22
    assert adima_yuvarla(374.4575, "asagi") == 374.25
    assert pay_hesapla(0.030) == pytest.approx(0.10)
    assert pay_hesapla(0.038) == pytest.approx(0.0035 / 0.038)
    assert pay_hesapla(0.0) == 0.0


def test_geriye_donuk_emir_reddedilir(tmp_path):
    d = Defter.baslat(tmp_path / "d.json", 100_000, "2026-11-09")
    with pytest.raises(ValueError, match="Geriye dönük"):
        d.emir_ver("KCHOL", "AL", 10, 200.0, "2026-11-09", "17:00-17:50", "", simdi=pd.Timestamp("2026-11-09 17:30", tz="Europe/Istanbul"))


def test_limit_al_dolar_ve_dolmaz(tmp_path):
    d = Defter.baslat(tmp_path / "d.json", 100_000, "2026-11-09", maliyet_bps=10)
    simdi = pd.Timestamp("2026-11-09 09:00", tz="Europe/Istanbul")
    d.emir_ver("AAA", "AL", 100, 100.0, "2026-11-09", "17:00-17:50", "dolmalı", simdi=simdi)
    d.emir_ver("BBB", "AL", 100, 90.0, "2026-11-09", "17:00-17:50", "dolmamalı", simdi=simdi)
    d.emir_ver("CCC", "AL", 10, None, "2026-11-09", "17:00-17:50", "piyasa", simdi=simdi)
    barlar = {"AAA": _cubuklar("2026-11-09", [(101, 102, 99.5, 100.5), (100.5, 101, 100, 100.8)]),
              "BBB": _cubuklar("2026-11-09", [(101, 102, 99.5, 100.5)]),
              "CCC": _cubuklar("2026-11-09", [(50, 51, 49, 50.5)])}
    # pencere kapanmadan hiçbir şey dolmaz
    assert d.isle(lambda h, g: barlar[h], simdi=pd.Timestamp("2026-11-09 17:20", tz="Europe/Istanbul")) == []
    sonuc = d.isle(lambda h, g: barlar[h], simdi=pd.Timestamp("2026-11-09 18:30", tz="Europe/Istanbul"))
    durum = {e["hisse"]: e["durum"] for e in sonuc}
    assert durum == {"AAA": "doldu", "BBB": "dolmadi", "CCC": "doldu"}
    aaa = d.veri["pozisyonlar"]["AAA"]
    assert aaa["adet"] == 100 and aaa["maliyet"] == 100.0  # açılış limitin üstünde → limitten
    ccc = d.veri["pozisyonlar"]["CCC"]
    assert ccc["maliyet"] == pytest.approx(50 * 1.0005)
    beklenen_nakit = 100_000 - 100 * 100 * (1 + 0.001) - 10 * 50 * 1.0005 * (1 + 0.001)
    assert d.veri["nakit"] == pytest.approx(beklenen_nakit)
    # satış: eldekinden fazla satılamaz
    with pytest.raises(ValueError):
        d.emir_ver("AAA", "SAT", 101, 110.0, "2026-11-10", "10:00-10:15", "", simdi=pd.Timestamp("2026-11-09 19:00", tz="Europe/Istanbul"))
    d.emir_ver("AAA", "SAT", 100, 104.0, "2026-11-10", "17:00-17:50", "kâr al", simdi=pd.Timestamp("2026-11-09 19:00", tz="Europe/Istanbul"))
    sat = _cubuklar("2026-11-10", [(105, 106, 104.5, 105.5)])
    d.isle(lambda h, g: sat, simdi=pd.Timestamp("2026-11-10 18:30", tz="Europe/Istanbul"))
    assert "AAA" not in d.veri["pozisyonlar"]
    e = d.veri["emirler"][-1]
    assert e["durum"] == "doldu" and e["dolum"]["fiyat"] == 105.0  # açılış limitin üstünde → açılıştan
    satir = d.degerle("2026-11-10", {"CCC": 52.0}, 11000.0)
    assert satir["hisse"] == pytest.approx(520.0)
    assert "CCC" in d.rapor({"CCC": 52.0})
