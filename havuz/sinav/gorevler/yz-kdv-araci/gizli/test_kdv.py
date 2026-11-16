"""Gizli sınav testi (yz-kdv-araci): kdv_hesapla aracının tutarları, biçimi ve hata yolları."""

import importlib
import random
import re
from decimal import ROUND_HALF_UP, Decimal

import pytest
from yz.arac.hazir import kdv_araclari

_TUTAR = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2}) TL")


def _arac():
    bulunan = [arac for arac in kdv_araclari() if arac.ad == "kdv_hesapla"]
    assert bulunan, "kdv_araclari() içinde adı kdv_hesapla olan araç yok"
    return bulunan[0]


def _sayi(metin: str) -> Decimal:
    return Decimal(metin.replace(".", "").replace(",", "."))


def _yaz(deger: Decimal) -> str:
    return f"{deger:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")


def test_modulde_tanimli():
    assert hasattr(importlib.import_module("yz.arac.hazir.kdv"), "kdv_araclari")


def test_bicim():
    sonuc = _arac().calistir({"tutar": "1.000,00", "oran": 20})
    assert sonuc.icerik == "KDV hariç: 1.000,00 TL; KDV (%20): 200,00 TL; KDV dahil: 1.200,00 TL"


@pytest.mark.parametrize(
    ("argumanlar", "beklenen"),
    [
        ({"tutar": "50"}, ["50,00", "10,00", "60,00"]),
        ({"tutar": "2,50", "oran": 5}, ["2,50", "0,13", "2,63"]),
        ({"tutar": "0,25", "oran": 18}, ["0,25", "0,05", "0,30"]),
        ({"tutar": "1234,56", "oran": 10}, ["1.234,56", "123,46", "1.358,02"]),
        ({"tutar": "1.000.000", "oran": 1}, ["1.000.000,00", "10.000,00", "1.010.000,00"]),
        ({"tutar": "1.200,00", "oran": 20, "dahil": True}, ["1.000,00", "200,00", "1.200,00"]),
        ({"tutar": "100,00", "oran": 18, "dahil": True}, ["84,75", "15,25", "100,00"]),
        ({"tutar": "10,00", "oran": 8, "dahil": True}, ["9,26", "0,74", "10,00"]),
        ({"tutar": "99,99", "oran": 0}, ["99,99", "0,00", "99,99"]),
    ],
)
def test_tutarlar(argumanlar, beklenen):
    sonuc = _arac().calistir(argumanlar)
    assert not sonuc.hata, sonuc.icerik
    assert _TUTAR.findall(sonuc.icerik) == beklenen
    assert f"%{argumanlar.get('oran', 20)}" in sonuc.icerik


def test_rastgele_tutarlar_yarim_yukari_ve_toplam_korunur():
    rng = random.Random(31)
    for _ in range(400):
        kurus = rng.randint(0, 50_000_000)
        oran = rng.choice([1, 8, 10, 18, 20, 5, 0])
        tutar = Decimal(kurus) / 100
        metin = _yaz(tutar)
        haric, kdv, dahil = map(
            _sayi, _TUTAR.findall(_arac().calistir({"tutar": metin, "oran": oran}).icerik)
        )
        beklenen = (tutar * oran / 100).quantize(Decimal("0.01"), ROUND_HALF_UP)
        assert (haric, kdv, dahil) == (tutar, beklenen, tutar + beklenen), (metin, oran)
        sonuc = _arac().calistir({"tutar": metin, "oran": oran, "dahil": True}).icerik
        haric, kdv, dahil = map(_sayi, _TUTAR.findall(sonuc))
        assert dahil == tutar and haric + kdv == tutar, (metin, oran, sonuc)
        assert abs(haric - tutar * 100 / (100 + oran)) <= Decimal("0.005"), (metin, oran, sonuc)


@pytest.mark.parametrize(
    "argumanlar",
    [{"tutar": "abc"}, {"tutar": "-5"}, {"tutar": "10", "oran": -1}, {"tutar": "10", "oran": 101}],
)
def test_hatalar_gozlem_olarak_doner(argumanlar):
    assert _arac().calistir(argumanlar).hata
