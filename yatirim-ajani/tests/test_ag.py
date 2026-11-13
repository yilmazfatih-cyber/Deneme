"""Ağ katmanı testleri: ağaç araçları, öncü-takipçi, tavan/taban gerçekçiliği, kural testleri, panel ve rapor."""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from yatirim_ajani.ag import agac, akis, strateji, yatirimci
from yatirim_ajani.ag.panel import Panel, evren_kur, panel_yukle
from yatirim_ajani.ag.rapor import baslik_tr, rapor_yaz, s, y


def _panel(R: pd.DataFrame, bist100: list[str] | None = None, GI: pd.DataFrame | None = None, hacim: float = 5e7) -> Panel:
    K = (1 + R.fillna(0)).cumprod() * 10
    GI = GI if GI is not None else R * 0.4
    GECE = (1 + R) / (1 + GI) - 1
    sabit = pd.DataFrame(hacim, index=R.index, columns=R.columns)
    ev = pd.DataFrame({"ad": [f"{h} A.Ş." for h in R.columns], "sektor": ["banka" if i % 2 == 0 else "gida" for i in range(R.shape[1])], "ana": "mali",
                       "grup": ["bist30" if h in (bist100 or []) else "ana_pazar" for h in R.columns], "bist100": [int(h in (bist100 or [])) for h in R.columns],
                       "bist30": [int(h in (bist100 or [])) for h in R.columns], "pd_son": 1e9, "halka_aciklik": 0.3, "hacim_60g": hacim,
                       "ilk_gun": str(R.index[0].date())}, index=R.columns)  # fmt: skip
    return Panel(K=K, R=R, GI=GI, GECE=GECE, HTL=sabit, PD=sabit * 20, HAO=sabit * 6, AOF=K, DOLAR=K / 30, xu100=R.mean(axis=1), evren=ev)


def _rastgele(T: int = 400, N: int = 12, tohum: int = 0) -> pd.DataFrame:
    rng = np.random.default_rng(tohum)
    gun = pd.bdate_range("2024-01-02", periods=T)
    piyasa = rng.normal(0, 0.01, T)
    return pd.DataFrame(piyasa[:, None] * rng.uniform(0.5, 1.5, N) + rng.normal(0, 0.015, (T, N)), index=gun, columns=[f"H{i:02d}" for i in range(N)])


# --- ağaç araçları ------------------------------------------------------------------------------
def test_mst_ve_olculer_yildiz_agac():
    # 0 merkezde, diğerleri yalnız merkeze yakın → yıldız
    D = np.full((5, 5), 2.0)
    np.fill_diagonal(D, 0)
    for j in range(1, 5):
        D[0, j] = D[j, 0] = 0.5
    kenar = agac.mst(D)
    assert len(kenar) == 4 and all(0 in (a, b) for a, b, _ in kenar)
    o = agac.agac_olculeri(kenar, 5)
    assert o["kok"] == 0 and o["derece"][0] == 4 and o["arasindalik"][0] == pytest.approx(1.0)
    assert (o["derinlik"][1:] == 1).all()


def test_hiyerarsik_kume_iki_blok():
    rng = np.random.default_rng(1)
    a, b = rng.normal(0, 1, 500), rng.normal(0, 1, 500)
    X = np.column_stack([a + rng.normal(0, 0.3, 500) for _ in range(4)] + [b + rng.normal(0, 0.3, 500) for _ in range(4)])
    C = pd.DataFrame(np.corrcoef(X.T))
    etiket = agac.hiyerarsik_kume(agac.uzaklik(C), 2)
    assert len(set(etiket[:4])) == 1 and len(set(etiket[4:])) == 1 and etiket[0] != etiket[4]


def test_cok_faktor_artik_faktore_dik():
    R = _rastgele()
    F = pd.DataFrame({"piyasa": R.mean(axis=1), "ikinci": R.iloc[:, :3].mean(axis=1)})
    E, B = agac.cok_faktor_artik(R, F)
    for c in R.columns:
        assert abs(np.corrcoef(E[c], F["piyasa"])[0, 1]) < 1e-8
    assert B.shape == (R.shape[1], 2)


def test_oncu_takipci_yonu_bulur():
    rng = np.random.default_rng(2)
    T = 600
    gun = pd.bdate_range("2024-01-02", periods=T)
    lider = rng.normal(0, 0.01, T)
    R = pd.DataFrame({f"L{i}": lider + rng.normal(0, 0.004, T) for i in range(4)} | {f"T{i}": np.r_[0, lider[:-1]] * 0.6 + rng.normal(0, 0.006, T) for i in range(4)}, index=gun)
    P = _panel(R, bist100=[f"L{i}" for i in range(4)])
    o = agac.oncu_takipci_grup(P, "grup")
    kenar = {(k["oncu"], k["takipci"]): k for k in o["kenarlar"]}
    assert kenar[("bist30", "ana_pazar")]["kor"] > 0.4 and kenar[("bist30", "ana_pazar")]["anlamli"] and kenar[("bist30", "ana_pazar")]["tutarli"]
    assert abs(kenar[("ana_pazar", "bist30")]["kor"]) < 0.15
    assert o["liderlik"]["bist30"] > o["liderlik"]["ana_pazar"]
    D = agac.fiyat_gecikmesi(P, min_gun=200)
    assert D.loc["T0", "gecikme_olcusu"] > D.loc["L0", "gecikme_olcusu"] and D.loc["T0", "l1_beta"] > 0.3


def test_bh_esik_hic_anlamli_yoksa_eksi_bir():
    assert agac.bh_esik(np.array([0.5, 0.7, 0.9]), 0.1) == -1.0
    assert agac.bh_esik(np.array([0.0, 0.0, 0.9]), 0.1) == 0.0  # p = 0 olanlar anlamlı sayılır
    assert agac.bh_esik(np.array([0.001, 0.002, 0.9]), 0.1) == pytest.approx(0.002)


def test_korelasyon_agi_ciktisi():
    R = _rastgele(T=450, N=16)
    A = agac.korelasyon_agi(_panel(R, bist100=list(R.columns[:4])), min_gun=300, kume_sayisi=3)
    assert A["hisse"] == 16 and len(A["kenarlar"]) == 15 and len(A["dugumler"]) == 16
    assert abs(A["ort_kor_artik"]) < 0.1 < A["ort_kor_ham"]  # küçük N'de artık korelasyonun beklenen değeri ≈ −1/(N−1)
    json.dumps(A)  # JSON'a yazılabilir


# --- yatırımcı tipleri --------------------------------------------------------------------------
def test_tavan_dizisi_sayimi_ve_dizi_sonu():
    gun = pd.bdate_range("2024-01-02", periods=60)
    r = np.full(60, 0.001)
    r[10:13] = 0.10  # 3 günlük tavan serisi
    r[13] = -0.04  # seri bozuldu
    R = pd.DataFrame({"A": r, **{f"B{i}": np.full(60, 0.001) for i in range(3)}}, index=gun)
    o = yatirimci.tavan_dizileri(_panel(R))["tavan"]
    assert o["gun"] == 3 and o["dizi_bitince"]["n"] == 1
    assert o["dizi_bitince"]["bitis_gunu_getiri"] == pytest.approx(-0.04)


def test_taban_alimi_kilit_gercek_getiriyi_dusurur():
    gun = pd.bdate_range("2024-01-02", periods=100)
    ra, rc = np.full(100, 0.002), np.full(100, 0.002)
    ra[30:36] = -0.10  # 6 gün üst üste taban
    rc[60:66] = -0.10
    R = pd.DataFrame({"A": ra, "B": np.full(100, 0.001), "C": rc}, index=gun)
    GI = R * 0.0  # tabanda açılıp tabanda kapanıyor: kâğıt üstünde gün içi getiri 0
    o = yatirimci.taban_alimi(_panel(R, GI=GI), min_hacim=1e6)
    assert o["olay"] == 12
    hepsi = o["hepsi"]
    assert hepsi["olculen_ort"] == pytest.approx(0.0, abs=1e-9)
    assert hepsi["gercek_ort"] < -0.05 and hepsi["kilitli_kalan"] > 0.5  # satılamadığı için zarar taşınır
    assert o["kilitli"]["gercek_ort"] < o["ayni_gun_cikilabilen"].get("gercek_ort", 0.0) + 1e-9


def test_faktor_primleri_bilinen_etkiyi_bulur():
    rng = np.random.default_rng(3)
    T, N = 500, 80
    gun = pd.bdate_range("2024-01-02", periods=T)
    kalite = rng.normal(0, 1, N)
    R = pd.DataFrame(rng.normal(0, 0.02, (T, N)) + kalite * 0.0015, index=gun, columns=[f"H{i:02d}" for i in range(N)])
    P = _panel(R)
    X = {"kalite": pd.DataFrame(np.repeat(kalite[None, :], T, 0), index=gun, columns=R.columns)}
    o = yatirimci.faktor_primleri(P, X, 20)["ozellik"]["kalite"]["bist100_disi"]
    assert o["ust_alt"] > 0.03 and o["t"] > 3 and o["yari1"] > 0 and o["yari2"] > 0


# --- kural testleri -----------------------------------------------------------------------------
def test_gece_tasima_tavanda_kapanani_almaz_ve_maliyet_duser():
    gun = pd.bdate_range("2024-01-02", periods=120)
    R = pd.DataFrame(0.001, index=gun, columns=[f"H{i}" for i in range(8)])
    GI = R * 0.0  # tüm getiri gecede
    R.iloc[50, 0] = 0.10  # tavanda kapanış: o gün alınamaz
    GI.iloc[51, 0] = -0.05
    R.iloc[51, 0] = 0.20 * 1 - 0.05  # ertesi gece +%20 gibi büyük boşluk
    o = strateji.gece_tasima(_panel(R, GI=GI), None, "bist100_disi", 0.2, 1e6, (0.001, 0.003))
    assert o["brut"]["ort"] == pytest.approx(0.001, abs=2e-4)  # tavandaki hissenin dev boşluğu sepete girmedi
    assert o["net_10bp"]["ort"] == pytest.approx(o["brut"]["ort"] - 0.001)
    assert o["net_30bp"]["ort"] < 0 < o["net_10bp"]["ort"] + 0.001


def test_deflated_sharpe_deneme_artinca_duser():
    rng = np.random.default_rng(4)
    r = pd.Series(rng.normal(0.001, 0.01, 700))
    a, b = strateji.deflated_sharpe(r, 2), strateji.deflated_sharpe(r, 200)
    assert 0 <= b < a <= 1
    assert strateji._phi_ters(0.975) == pytest.approx(1.95996, abs=1e-3)


def test_donemsel_portfoy_devir_ve_kiyas():
    R = _rastgele(T=400, N=60, tohum=5)
    P = _panel(R)
    puan = R.rolling(20).mean()
    o = strateji.donemsel_portfoy(P, puan, "bist100_disi", 0.2, 20, 1e6, (0.003,))
    assert 0 < o["ort_devir"] <= 1 and o["brut"]["donem"] >= 10
    assert o["net_30bp"]["ort"] < o["brut"]["ort"]


# --- akış ---------------------------------------------------------------------------------------
def test_kuresel_degisimler_gece_ve_seans():
    gunler = pd.bdate_range("2026-01-05", periods=130)
    saatler = pd.date_range("2026-01-05", gunler[-1] + pd.Timedelta(days=1), freq="h")
    deger = 100 + np.arange(len(saatler), dtype=float)  # her saat +1
    SS = pd.DataFrame({"sembol": "ES=F", "zaman": saatler.strftime("%Y-%m-%d %H:%M"), "kapanis": deger})
    K = akis.kuresel_degisimler(SS, gunler)["ES=F"]
    # ilk satır: 5 Oca 18:00 (değer 118) → 6 Oca 10:00 (değer 134) → 6 Oca 18:00 (değer 142)
    assert K.index[0] == pd.Timestamp("2026-01-06")
    assert K["gece"].iloc[0] == pytest.approx(134 / 118 - 1) and K["seans"].iloc[0] == pytest.approx(142 / 134 - 1)
    # hafta sonu: Cuma 18:00 → Pazartesi 10:00 = 64 saat
    pzt = K.loc[pd.Timestamp("2026-01-12")]
    cuma18 = 100 + (pd.Timestamp("2026-01-09 18:00") - pd.Timestamp("2026-01-05")).total_seconds() / 3600
    assert pzt["gece"] == pytest.approx(64 / cuma18)


def test_mevsimsellik_ve_varlik_rotasyonu():
    gun = pd.bdate_range("2010-01-04", "2026-11-12")
    rng = np.random.default_rng(6)
    S = pd.DataFrame({"XU100.IS": 100 * np.exp(np.cumsum(rng.normal(0.0008, 0.015, len(gun)))), "GC=F": 1000 * np.exp(np.cumsum(rng.normal(0.0003, 0.01, len(gun)))),
                      "USDTRY=X": 1.5 * np.exp(np.cumsum(rng.normal(0.0007, 0.008, len(gun)))), "SI=F": 20 * np.exp(np.cumsum(rng.normal(0.0002, 0.018, len(gun))))}, index=gun)  # fmt: skip
    ms = akis.mevsimsellik(S)
    assert set(ms["BIST 100"]["aylar"]) == set(range(1, 13)) and ms["BIST 100"]["aylar"][1]["yil"] >= 16
    vr = akis.varlik_rotasyonu(S)
    assert set(vr["kural"]) == {"1ay", "3ay", "6ay", "12ay"} and len(vr["yillik"]) == 17


# --- panel ve rapor -----------------------------------------------------------------------------
def test_evren_kur_sektor_endeksten():
    tv = pd.DataFrame({"hisse": ["GARAN", "ABCDE", "TERA"], "type": ["stock"] * 3, "description": ["GARANTİ", "ABC", "TERA"], "sector": ["Finance", "Utilities", "Finance"],
                       "market_cap_basic": [6e11, 1e9, 1e9], "float_shares_percent_current": [14.0, 40.0, 30.0], "ipo_offer_date": [644630400, 1700000000, 1700000000],
                       "indexes": [json.dumps([{"name": "BIST 30", "proname": "BIST:XU030"}, {"name": "BIST 100", "proname": "BIST:XU100"}, {"name": "BIST Banks", "proname": "BIST:XBANK"}]),
                                   json.dumps([{"name": "BIST Main", "proname": "BIST:XBANA"}]), None]})  # fmt: skip
    ev = evren_kur(tv)
    assert "TERA" not in ev.index  # kullanıcı kuralı
    assert ev.at["GARAN", "sektor"] == "banka" and ev.at["GARAN", "grup"] == "bist30" and ev.at["GARAN", "bist100"] == 1
    assert ev.at["ABCDE", "sektor"] == "elektrik" and ev.at["ABCDE", "grup"] == "ana_pazar"


def test_panel_yukle_kucuk_veri(tmp_path):
    gun = pd.bdate_range("2024-01-02", periods=90)
    rng = np.random.default_rng(7)
    isy, yh = [], []
    for h in ("AAAAA", "BBBBB"):
        k = 10 * np.exp(np.cumsum(rng.normal(0, 0.01, len(gun))))
        for t, p in zip(gun, k):
            isy.append({"hisse": h, "HGDG_KAPANIS": p, "HGDG_AOF": p, "HGDG_MIN": p * 0.99, "HGDG_MAX": p * 1.01, "HGDG_HACIM": 1e7, "END_DEGER": 10000.0, "DD_DEGER": 30.0,
                        "DOLAR_BAZLI_FIYAT": p / 30, "DOLAR_HACIM": 3e5, "SERMAYE": 1e8, "PD": p * 1e8, "PD_USD": p * 1e8 / 30, "HAO_PD": p * 3e7, "HAO_PD_USD": p * 1e6, "tarih": t.strftime("%Y-%m-%d")})  # fmt: skip
            yh.append({"hisse": h, "tarih": t.strftime("%Y-%m-%d"), "acilis": p * 0.995, "yuksek": p * 1.01, "dusuk": p * 0.99, "kapanis": p, "duz_kapanis": p, "hacim": 1e6, "temettu": 0, "bolunme": 0})
    pd.DataFrame(isy).to_csv(tmp_path / "isy_panel.csv.gz", index=False, compression="gzip")
    pd.DataFrame(yh).to_csv(tmp_path / "gunluk_panel.csv.gz", index=False, compression="gzip")
    pd.DataFrame({"hisse": ["AAAAA", "BBBBB"], "type": "stock", "description": ["A", "B"], "sector": "Finance", "market_cap_basic": 1e9, "float_shares_percent_current": 30.0,
                  "ipo_offer_date": 1.7e9, "indexes": [None, None]}).to_csv(tmp_path / "tv_tarama.csv", index=False)  # fmt: skip
    P = panel_yukle(tmp_path, min_gun=30)
    assert P.R.shape == (90, 2) and P.GI.notna().sum().sum() > 100
    assert P.GI.iloc[5, 0] == pytest.approx(1 / 0.995 - 1)
    assert ((1 + P.GECE) * (1 + P.GI) - 1 - P.R).abs().max().max() < 1e-9
    assert P.evren.at["AAAAA", "halka_aciklik"] == pytest.approx(0.3)


def test_rapor_bicimleri_ve_bos_sonuc():
    assert y(0.0234) == "+%2,3" and y(-0.2, 0) == "−%20" and y(-0.00001, 2) == "%0,00" and y(None) == "-"
    assert s(-0.14) == "−0,14" and s(-0.0001) == "0,00"
    assert baslik_tr("YEŞİL YATIRIM HOLDİNG A.Ş.") == "Yeşil Yatırım Holding A.Ş."
    metin = rapor_yaz({"veri": {"donem": ["2024-01-02", "2026-11-12"], "gun": 717, "hisse": 614}, "hata": {}}, None)
    assert metin.startswith("# BIST ağ analizi") and "## 7. Sınırlar" in metin
