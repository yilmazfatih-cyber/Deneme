"""test_cercevesi ile yazılmış örnek testler (hepsi geçer).

Çalıştırma: python -m test_cercevesi test_cercevesi/ornekler -v
"""

from __future__ import annotations

import time
from collections.abc import Iterator
from pathlib import Path

from sepet import Sepet

from test_cercevesi import fixture, parametrize, raises, skip, skip_now, timeout

KURULUM_SAYISI = {"modul": 0}


@fixture
def sepet() -> Iterator[Sepet]:
    s = Sepet()
    s.ekle("ekmek", 1500)
    yield s
    s.kalemler.clear()  # temizlik: test kalsa da çalışır


@fixture(scope="modul")
def fiyat_listesi() -> dict[str, int]:
    KURULUM_SAYISI["modul"] += 1
    return {"süt": 3250, "çay": 9900}


@fixture
def dolu_sepet(sepet: Sepet, fiyat_listesi: dict[str, int]) -> Sepet:
    for ad, fiyat in fiyat_listesi.items():
        sepet.ekle(ad, fiyat)
    return sepet


def test_bos_sepet_toplami_sifir() -> None:
    assert Sepet().toplam() == 0


def test_fixture_ile_toplam(sepet: Sepet) -> None:
    sepet.ekle("ekmek", 1500, 2)
    assert sepet.toplam() == 4500


def test_bagimli_fixture(dolu_sepet: Sepet) -> None:
    assert dolu_sepet.toplam() == 1500 + 3250 + 9900


def test_modul_fixture_bir_kez_kurulur(fiyat_listesi: dict[str, int]) -> None:
    assert KURULUM_SAYISI["modul"] == 1


@parametrize("indirim, beklenen", [(0, 1500), (10, 1350), (100, 0)])
def test_indirim(sepet: Sepet, indirim: int, beklenen: int) -> None:
    assert sepet.toplam(indirim) == beklenen


def test_hatali_adet_hata_verir(sepet: Sepet) -> None:
    with raises(ValueError, match="adet sıfır olamaz"):
        sepet.ekle("su", 500, adet=0)


def test_gecici_klasor(tmp_dir: Path) -> None:
    dosya = tmp_dir / "fis.txt"
    dosya.write_text("toplam: 15,00 TL", encoding="utf-8")
    assert dosya.read_text(encoding="utf-8").endswith("TL")


@timeout(5)
def test_zaman_asimi_icinde_biter() -> None:
    time.sleep(0.01)


@skip("örnek: bilerek atlanan test")
def test_atlanan() -> None:
    raise AssertionError("çalışmamalıydı")


def test_icerden_atlama() -> None:
    skip_now("koşul sağlanmadı")
