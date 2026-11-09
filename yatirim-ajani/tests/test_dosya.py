"""Hisse dosyası: omurga nokta-zamanlılık (geleceği kesince geçmiş satırlar değişmez), kalem dönüşümü, etiketler."""

import numpy as np
import pandas as pd
import pytest

from yatirim_ajani.dosya.kur import Girdiler, mali_kalemler, omurga_kur

TZ = "Europe/Istanbul"


def _saatlik(gunler: pd.DatetimeIndex, tohum: int = 1, taban: float = 100.0) -> pd.DataFrame:
    rng = np.random.default_rng(tohum)
    satirlar = []
    fiyat = taban
    for g in gunler:
        for saat in range(10, 18):
            r = rng.normal(0, 0.004)
            a = fiyat
            fiyat = fiyat * (1 + r)
            satirlar.append({"zaman": pd.Timestamp(g.date(), tz=TZ) + pd.Timedelta(hours=saat), "acilis": a, "yuksek": max(a, fiyat) * 1.001,
                             "dusuk": min(a, fiyat) * 0.999, "kapanis": fiyat, "hacim": float(rng.integers(1e5, 1e6))})  # fmt: skip
    return pd.DataFrame(satirlar)


def _gunluk(saatlik: pd.DataFrame) -> pd.DataFrame:
    s = saatlik.copy()
    s["gun"] = s["zaman"].dt.tz_localize(None).dt.normalize()
    g = s.groupby("gun").agg(acilis=("acilis", "first"), yuksek=("yuksek", "max"), dusuk=("dusuk", "min"), kapanis=("kapanis", "last"), hacim=("hacim", "sum")).reset_index()
    g["tarih"] = g["gun"].dt.tz_localize(TZ)
    return g.drop(columns="gun")


def _girdiler(gun_sayisi: int) -> Girdiler:
    gunler = pd.bdate_range("2024-01-02", periods=gun_sayisi)
    s = _saatlik(gunler)
    x = _saatlik(gunler, tohum=2, taban=10000)
    k = _gunluk(_saatlik(gunler, tohum=3, taban=30))[["tarih", "kapanis"]]
    olaylar = pd.DataFrame([{"kapsam": "sirket", "hisse": "TEST", "kamuya_acilma": pd.Timestamp("2024-03-05 18:30", tz=TZ), "tur": "bilanco", "yon": "olumlu", "baslik": "4Ç23"}])
    return Girdiler(saatlik=s, gunluk=_gunluk(s), xu100_saatlik=x, xu100_gunluk=_gunluk(x), usdtry_gunluk=k, isy_gunluk=pd.DataFrame(), isy_mali=pd.DataFrame(), olaylar=olaylar)


def test_gecmis_satirlar_gelecek_kesilince_degismez():
    tam = omurga_kur("TEST", _girdiler(320))
    kisa = omurga_kur("TEST", _girdiler(260))
    ileri = [c for c in tam.columns if "ileri" in c or c.startswith(("sat_sinyali", "al_sinyali"))]
    ortak = [c for c in tam.columns if c not in ileri and c != "zaman"]
    son_gun = sorted(kisa["gun"].unique())[-1]
    a = tam[tam["gun"] <= son_gun].set_index("zaman")[ortak]
    b = kisa[kisa["gun"] <= son_gun].set_index("zaman")[ortak]
    assert len(a) == len(b) > 1000
    for c in ortak:
        if not pd.api.types.is_numeric_dtype(a[c]):
            assert (a[c].astype(object).fillna("∅") == b[c].astype(object).fillna("∅")).all(), c
        else:
            x, y = a[c].astype(float), b[c].astype(float)
            assert np.allclose(x.fillna(-9e9), y.fillna(-9e9), rtol=1e-9, atol=1e-9), c


def test_etiketler_ve_olaylar():
    R = omurga_kur("TEST", _girdiler(120))
    gs = R[R["gun_sonu"]]
    # ileri_1g = ertesi gün kapanışı / bugünkü kapanış - 1
    c = gs["kapanis"].to_numpy()
    assert np.allclose(gs["ileri_1g"].to_numpy()[:-1], c[1:] / c[:-1] - 1)
    # 20 gün içi min etiketi
    assert ((gs["sat_sinyali_20g"].dropna() == (gs["ileri_min_20g"].dropna() <= -0.10).astype(int)).all())
    # olay sayacı: 5 Mart 18:30 olayı 6 Mart'ta 1 gün penceresinde, 5 Mart 17:00'de henüz değil
    once = R[(R["zaman"] == "2024-03-05 17:00")].iloc[0]
    sonra = R[(R["zaman"] == "2024-03-06 10:00")].iloc[0]
    assert once["olay_sayi_1g"] == 0 and sonra["olay_sayi_1g"] == 1 and sonra["son_olay_tur"] == "bilanco"
    assert set(R["cozunurluk"]) == {"1h"} and R["saat"].iloc[0] == "10:00"


def test_mali_kalemler_kumulatiften_ceyrege():
    mali = pd.DataFrame({
        "itemCode": ["3Z", "3C", "2O", "2AA", "2BA", "1AA", "3DF", "4B"],
        "itemDescTr": ["Ana Ortaklık Payları", "Satış Gelirleri", "Ana Ortaklığa Ait Özkaynaklar", "Finansal Borçlar", "Finansal Borçlar", "Nakit", "Faaliyet Karı", "Amortisman"],
        "itemDescEng": [""] * 8,
        "2025/3": [1e9, 10e9, 50e9, 5e9, 5e9, 3e9, 2e9, 0.5e9],
        "2025/6": [3e9, 25e9, 52e9, 5e9, 5e9, 3e9, 5e9, 1.0e9],
        "2025/9": [np.nan] * 8,
    })
    k = mali_kalemler(mali)
    assert list(map(str, k.index)) == ["2025Q1", "2025Q2"]
    assert k.loc[pd.Period("2025Q2"), "net_kar_ceyrek"] == pytest.approx(2000.0)  # (3e9-1e9)/1e6
    assert k.loc[pd.Period("2025Q2"), "satis_ceyrek"] == pytest.approx(15000.0)
    assert k.loc[pd.Period("2025Q2"), "favok_ceyrek"] == pytest.approx(3000.0 + 500.0)
    assert k.loc[pd.Period("2025Q2"), "net_borc"] == pytest.approx(7000.0)
