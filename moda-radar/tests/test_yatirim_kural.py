"""Karar kuralı (PLAN bölüm 8): her karar için örnek ve eşik sınırları."""

import pytest

from moda_radar.sema import Karar, YatirimBoyutlari, Yon
from moda_radar.yatirim import ayar, kural

E = ayar.esikler()


def b(**kw) -> YatirimBoyutlari:
    temel = {
        "trend_ivmesi": 0.70,
        "trend_yonu": Yon.YUKSELIS,
        "segment_uyumu": 0.8,
        "zamanlama": "zamaninda",
        "marj_yuzde": 60.0,
        "stok_riski": "orta",
        "rakip_sayisi": 1,
    }
    return YatirimBoyutlari(**(temel | kw))


def karar(boyut, seg="orta", sinyal="tutarli"):
    return kural.karar_ver(boyut, E, seg, sinyal)[0]


def test_yatir():
    k, g = kural.karar_ver(b(), E, "orta")
    assert k == Karar.YATIR
    assert "0,70" in g


def test_yatir_ivme_esiginde():
    assert karar(b(trend_ivmesi=E["yatir_ivme"])) == Karar.YATIR
    assert karar(b(trend_ivmesi=E["yatir_ivme"] - 0.01)) == Karar.DENE


def test_yatir_giris_yonu_de_olur():
    assert karar(b(trend_yonu=Yon.GIRIS)) == Karar.YATIR


@pytest.mark.parametrize(
    "degisiklik",
    [
        {"trend_yonu": Yon.ZIRVE},
        {"zamanlama": "gec"},
        {"marj_yuzde": 50.0},  # orta hedef 52
        {"stok_riski": "yuksek"},
    ],
)
def test_yatir_kosulu_eksikse_dene(degisiklik):
    k, g = kural.karar_ver(b(**degisiklik), E, "orta")
    assert k == Karar.DENE
    assert "YATIR için eksik" in g and "deneme partisi" in g


def test_dene_ivme_araligi():
    assert karar(b(trend_ivmesi=0.50)) == Karar.DENE
    assert karar(b(trend_ivmesi=E["dene_ivme_alt"])) == Karar.DENE


def test_dene_zamanlama_erken_dusuk_ivme():
    assert karar(b(trend_ivmesi=0.30, zamanlama="erken")) == Karar.DENE


def test_bekle_dusuk_ivme():
    assert karar(b(trend_ivmesi=0.40)) == Karar.BEKLE


def test_bekle_erken_ve_riskli():
    assert karar(b(zamanlama="erken", stok_riski="yuksek")) == Karar.BEKLE


@pytest.mark.parametrize("sinyal", ["celiskili", "yok"])
def test_bekle_sinyal_celiskili_ya_da_yok(sinyal):
    assert karar(b(), sinyal=sinyal) == Karar.BEKLE


def test_girme_cikis():
    k, g = kural.karar_ver(b(trend_yonu=Yon.CIKIS, trend_ivmesi=0.9), E, "orta")
    assert k == Karar.GIRME and "çıkış" in g


def test_girme_uyum_dusuk():
    assert karar(b(segment_uyumu=0.29)) == Karar.GIRME
    assert karar(b(segment_uyumu=0.30)) == Karar.YATIR


def test_girme_rakip_yogun_marj_dar():
    assert karar(b(rakip_sayisi=E["rakip_yogun"], marj_yuzde=50.0)) == Karar.GIRME
    # Rakip yoğun ama marj hedefin üstünde: GİRME değil
    assert karar(b(rakip_sayisi=E["rakip_yogun"], marj_yuzde=60.0)) == Karar.YATIR


def test_girme_marj_taban():
    assert karar(b(marj_yuzde=E["marj_taban"] - 1)) == Karar.GIRME


def test_marj_hedefi_segmente_gore():
    # %50 marj: pazar (35) için yeterli, lüks (65) için değil
    assert karar(b(marj_yuzde=50.0), seg="pazar") == Karar.YATIR
    assert karar(b(marj_yuzde=50.0), seg="luks") == Karar.DENE


def test_gerekce_en_fazla_uc_cumle_ve_400_karakter():
    for boyut in (b(), b(trend_ivmesi=0.5), b(trend_yonu=Yon.CIKIS), b(trend_ivmesi=0.3)):
        _, g = kural.karar_ver(boyut, E, "orta")
        assert len(g) <= 400
        assert g.count(". ") <= 2


@pytest.mark.parametrize(
    "boyut,beklenen",
    [
        (b(), "DENE'ye iner"),
        (b(trend_ivmesi=0.5), "YATIR'a çıkar"),
        (b(trend_ivmesi=0.3), "DENE'ye çıkar"),
        (b(trend_yonu=Yon.CIKIS), "yükselişe"),
        (b(segment_uyumu=0.1), "yeniden değerlendirilir"),
    ],
)
def test_degistirecek_sinyal(boyut, beklenen):
    k = karar(boyut)
    s = kural.degistirecek_sinyal(boyut, k, E, "orta")
    assert beklenen in s and len(s) <= 200


def test_esikler_koda_gomulu_degil():
    e = dict(E) | {"yatir_ivme": 0.80}
    assert kural.karar_ver(b(), e, "orta")[0] == Karar.DENE
