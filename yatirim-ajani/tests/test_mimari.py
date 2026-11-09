"""Strateji mimarisi: okuyucu (haneler), dallanma ağacı, Py botu (pencere/limit/adet), strateji simülasyonu."""

import json
import sqlite3

import numpy as np
import pandas as pd
import pytest

from yatirim_ajani.mimari.bot import islem_gunu_mu, olay_isle, pencere_hesapla
from yatirim_ajani.mimari.dallar import Baglam, degerlendir, olay_agaci
from yatirim_ajani.mimari.haneler import KapHane, buyukluk_sinifi
from yatirim_ajani.mimari.istatistik import _islem
from yatirim_ajani.mimari.kutuphane import Strateji
from yatirim_ajani.mimari.okuyucu import metinden_hane, tr_sayi, zenginlestir

TZ = "Europe/Istanbul"


def test_tr_sayi_ve_okuyucu():
    assert tr_sayi("20.000.000") == 2e7 and tr_sayi("1,5") == 1.5 and tr_sayi("12.500.000,50") == 12500000.5 and tr_sayi("384,50") == 384.5
    h = metinden_hane("Yönetim Kurulumuz 20 milyon ABD Doları tutarında yeni tesis yatırımı yapılmasına karar vermiştir; süre 18 ay.", "kchol", "2026-11-09T14:12")
    assert (h.hisse, h.tur, h.tutar, h.para_birimi, h.sure_ay, h.etkin_yon()) == ("KCHOL", "yatirim", 2e7, "USD", 18, "olumlu")
    b = metinden_hane("Sermayenin iç kaynaklardan karşılanmak üzere %100 oranında bedelsiz artırılmasına karar verilmiştir.", "X", "2026-11-09T10:00")
    assert b.tur == "bedelsiz" and b.oran == pytest.approx(1.0)
    t = metinden_hane("Pay başına brüt 0,59952 TL kâr payı; toplam brüt 59.952.000 TL.", "X", "2026-11-09T10:00")
    assert t.tur == "temettu" and t.pay_basi_tl == pytest.approx(0.59952) and t.tutar == 59_952_000
    p = metinden_hane("Payların %0,83 oranındaki kısmının 384,50 TL fiyattan toptan satışı gerçekleştirilmiştir.", "X", "2026-11-09T10:00")
    assert p.tur == "pay_satisi" and p.oran == pytest.approx(0.0083) and p.islem_fiyati_tl == 384.5 and p.tutar is None
    d = metinden_hane("Fitch, şirketin notunu B+'dan B'ye düşürmüştür.", "X", "2026-11-09T10:00")
    assert d.tur == "derecelendirme" and (d.not_eski, d.not_yeni, d.etkin_yon()) == ("B+", "B", "olumsuz")


def test_zenginlestir_ve_buyukluk():
    h = metinden_hane("20 milyon ABD Doları tutarında yatırım", "AHGAZ", "2026-11-09T14:12")
    z = zenginlestir(h, fiyat=47.0, piyasa_degeri_tl=122e9, usdtry=50.0)
    assert z.tutar_tl == pytest.approx(1e9) and z.pd_orani == pytest.approx(1e9 / 122e9) and z.buyukluk == "kucuk"
    assert buyukluk_sinifi(0.001) == "cok_kucuk" and buyukluk_sinifi(0.05) == "buyuk" and buyukluk_sinifi(0.2) == "cok_buyuk"


def _baglam(hane: KapHane, xu=0.05, getiri=None, hacim_kat=None, elde=0):
    satir = {"kapanis": 100.0, "xu100_ma200_uzaklik": xu, "ma50_uzaklik": 0.01, "atr_20g_oran": 0.03}
    port = {"nakit": 1e6, "toplam": 1e6, "pozisyonlar": {hane.hisse: {"adet": elde, "maliyet": 90}} if elde else {}}
    return Baglam(hane, satir, satir, {"getiri": getiri, "tavan": False, "hacim_kat": hacim_kat}, port)


def test_agac_dallari():
    k = olay_agaci()
    h = zenginlestir(metinden_hane("120 milyon ABD Doları tutarında yatırım", "X", "2026-11-09T14:12"), 100, 100e9, 50.0)  # %6 → büyük
    yol, e = degerlendir(k, _baglam(h))
    assert yol[-2:] == ["Büyük", "Rejim destekli"] and e.karar == "AL" and e.boyut == 1.0
    yol, e = degerlendir(k, _baglam(h, getiri=0.08))
    assert yol[-1] == "Fiyat kaçtı" and e.karar == "IZLE"
    kucuk = zenginlestir(metinden_hane("2 milyon ABD Doları tutarında yatırım", "X", "2026-11-09T14:12"), 100, 100e9, 50.0)
    assert degerlendir(k, _baglam(kucuk))[1].karar == "ISLEM_YOK"
    ps = metinden_hane("Payların %5 oranındaki kısmının blok satışı", "X", "2026-11-09T14:12")
    assert degerlendir(k, _baglam(ps, elde=1000))[1].karar == "SAT" and degerlendir(k, _baglam(ps))[1].karar == "ISLEM_YOK"
    tera = metinden_hane("500 milyon ABD Doları tutarında yatırım", "TERA", "2026-11-09T14:12")
    assert degerlendir(k, _baglam(tera))[1].karar == "ISLEM_YOK"


def test_pencere_ve_islem_gunu():
    assert pencere_hesapla("sonraki_saat", pd.Timestamp("2026-11-09 14:12", tz=TZ)) == ("2026-11-09", "15:00-15:50")
    assert pencere_hesapla("sonraki_saat", pd.Timestamp("2026-11-09 17:20", tz=TZ)) == ("2026-11-10", "10:00-10:50")
    assert pencere_hesapla("gun_sonu", pd.Timestamp("2026-11-09 09:00", tz=TZ)) == ("2026-11-09", "17:00-17:50")
    assert pencere_hesapla("ertesi_acilis", pd.Timestamp("2026-11-13 19:00", tz=TZ)) == ("2026-11-16", "10:00-10:15")  # Cuma akşamı → Pazartesi
    assert not islem_gunu_mu(pd.Timestamp("2026-10-29").date())  # Cumhuriyet Bayramı


def test_bot_uctan_uca(tmp_path):
    # tek hisselik küçük dosya veritabanı
    zaman = pd.date_range("2026-11-02 10:30", periods=8 * 6, freq="h")
    zaman = [z for z in zaman if 10 <= z.hour <= 17][:40]
    R = pd.DataFrame({"zaman": [z.strftime("%Y-%m-%d %H:%M") for z in zaman], "hisse": "XYZ", "kapanis": np.linspace(100, 104, len(zaman)),
                      "gun": [z.strftime("%Y-%m-%d") for z in zaman], "getiri_1g": 0.0, "hacim_gunici_oran": 1.0, "piyasa_degeri_mn": 10_000.0,
                      "dolar_fiyat": np.linspace(100, 104, len(zaman)) / 50.0, "xu100_ma200_uzaklik": 0.02, "ma50_uzaklik": 0.03, "atr_20g_oran": 0.03})  # fmt: skip
    db = tmp_path / "d.sqlite"
    with sqlite3.connect(db) as c:
        R.to_sql("omurga", c, index=False)
    h = metinden_hane("Şirketimiz 30 milyon ABD Doları tutarında fabrika yatırımı yapacaktır.", "XYZ", "2026-11-09T09:30")  # 1,5 mlr TL / 10 mlr TL = %15
    son_zaman = R["zaman"].iloc[-1]
    k = olay_isle(h, db, simdi=pd.Timestamp(son_zaman, tz=TZ) + pd.Timedelta(minutes=10), kayit=tmp_path / "k.jsonl")
    assert k["eylem"]["karar"] == "AL" and k["emir"]["yon"] == "AL" and k["emir"]["adet"] > 0
    assert k["emir"]["limit"] <= 104 * 1.01 + 1e-6 and "Büyük" in k["yol"]
    assert json.loads((tmp_path / "k.jsonl").read_text().splitlines()[0])["hane"]["hisse"] == "XYZ"


def test_islem_simulasyonu_stop_once():
    df = {"acilis": np.array([100, 100, 101.0]), "yuksek": np.array([101, 104, 102.0]), "dusuk": np.array([99, 97, 100.0]),
          "kapanis": np.array([100, 101, 101.5]), "gun_sonu": np.array([False, False, True])}  # fmt: skip
    s = Strateji("x", "x", "x", lambda d, e: None, hedef=0.03, stop=-0.02, sure_cubuk=5)
    j, giris, cikis, sebep = _islem(df, 0, s, {})
    assert (j, giris, sebep) == (1, 100, "stop") and cikis == pytest.approx(98.0)  # aynı çubukta hedef de görüldü; önce stop
