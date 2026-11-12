from datetime import date
from pathlib import Path

import pytest

from tests.conftest import ORNEK_MENU
from yemekhane_kasa.menu import MenuHatasi, MenuIzleyici, kurusa_cevir, menu_yukle, tl


@pytest.mark.parametrize(
    ("deger", "beklenen"),
    [(45, 4500), (45.5, 4550), ("45,50", 4550), ("45.05", 4505), (0, 0), (45.1, 4510), ("1 250", 125000)],
)
def test_kurusa_cevir(deger, beklenen):
    assert kurusa_cevir(deger) == beklenen


@pytest.mark.parametrize("deger", [-1, "abc", "45,555", None, True, "1.234,50", float("nan")])
def test_kurusa_cevir_hatali(deger):
    with pytest.raises(ValueError):
        kurusa_cevir(deger)


def test_tl_bicimi():
    assert tl(4550) == "45,50 TL"
    assert tl(123456) == "1.234,56 TL"
    assert tl(5) == "0,05 TL"
    assert tl(-2000) == "-20,00 TL"


def test_ornek_menu_gecerli(menu):
    assert len(menu.yemekler) == 12
    assert menu.yemek("kuru_fasulye").fiyat_kurus == 12000
    assert menu.yemek("kuru_fasulye").birim_fiyat("yarim") == 7500
    assert menu.yemek("izmir_kofte").birim_fiyat("yarim") == 16500  # yarım porsiyonu yok
    assert menu.yemek("ayran").plu == "6001"
    assert menu.kdv_orani(menu.yemek("ayran")) == 10
    assert "ekmek" in menu.yok_say
    assert menu.fiks_menuler[0].kategoriler == ["corba", "ana_yemek", "yardimci"]


def _yaz(yol: Path, metin: str) -> Path:
    yol.write_text(metin, encoding="utf-8")
    return yol


TEMEL = """
yemekler:
  - {id: corba, ad: Çorba, fiyat: 50, kategori: corba}
  - {id: pilav, ad: Pilav, fiyat: 40, kategori: yardimci}
"""


@pytest.mark.parametrize(
    ("ek", "ileti"),
    [
        ("  - {id: corba, ad: Başka, fiyat: 10}\n", "aynı kimlik"),
        ("  - {id: Kofte, ad: Köfte, fiyat: 10}\n", "geçersiz"),
        ("  - {id: tatli, ad: Tatlı, fiyat: 10, yarim_fiyat: 20}\n", "yarım porsiyon"),
        ("  - {id: tatli, ad: Tatlı, fiyat: 10.555}\n", "iki ondalık"),
        ("  - {id: tatli, ad: Tatlı, fiyat: 10, renk: kirmizi}\n", "renk"),
        ("fiks_menuler:\n  - {ad: Menü, kategoriler: [corba, tatli], fiyat: 70}\n", "kategoride yemek yok: tatli"),
    ],
)
def test_menu_hatalari(tmp_path, ek, ileti):
    with pytest.raises(MenuHatasi, match=ileti):
        menu_yukle(_yaz(tmp_path / "m.yaml", TEMEL + ek))


def test_ayni_plu_iki_yemekte(tmp_path):
    metin = "yemekler:\n  - {id: a, ad: A, fiyat: 1, plu: 7}\n  - {id: b, ad: B, fiyat: 1, plu: '7'}\n"
    with pytest.raises(MenuHatasi, match="aynı PLU"):
        menu_yukle(_yaz(tmp_path / "m.yaml", metin))


def test_referans_fotografi_yoksa_hata(tmp_path):
    metin = "yemekler:\n  - {id: a, ad: A, fiyat: 1, gorsel: referans/a.jpg}\n"
    with pytest.raises(MenuHatasi, match="referans fotoğraf yok"):
        menu_yukle(_yaz(tmp_path / "m.yaml", metin))


def test_referans_fotografi_menu_klasorune_gore(tmp_path):
    (tmp_path / "referans").mkdir()
    (tmp_path / "referans" / "a.jpg").write_bytes(b"x")
    menu = menu_yukle(_yaz(tmp_path / "m.yaml", "yemekler:\n  - {id: a, ad: A, fiyat: 1, gorsel: referans/a.jpg}\n"))
    assert menu.gorsel_yolu(menu.yemekler[0]) == tmp_path / "referans" / "a.jpg"


def test_izleyici_degisikligi_yukler_bozuk_dosyada_eskisini_korur(tmp_path):
    yol = _yaz(tmp_path / "menu.yaml", TEMEL)
    izleyici = MenuIzleyici("menu.yaml", tmp_path)
    ilk = izleyici.guncel()
    assert izleyici.guncel() is ilk  # değişmedi: yeniden okunmaz

    _yaz(yol, TEMEL.replace("fiyat: 50", "fiyat: 55") + "  # değişti\n")
    ikinci = izleyici.guncel()
    assert ikinci is not ilk and ikinci.yemek("corba").fiyat_kurus == 5500

    _yaz(yol, "yemekler: [bozuk")
    assert izleyici.guncel() is ikinci  # bozuk sürüm: son geçerli menü

    yol.unlink()
    assert izleyici.guncel() is ikinci  # dosya silindi: yine son geçerli menü


def test_izleyici_ilk_yuklemede_hata_verir(tmp_path):
    with pytest.raises(MenuHatasi, match="menü dosyası yok"):
        MenuIzleyici("yok.yaml", tmp_path).guncel()


def test_izleyici_tarih_deseni(tmp_path):
    (tmp_path / "menuler").mkdir()
    _yaz(tmp_path / "menuler" / "2026-11-12.yaml", TEMEL)
    gun = [date(2026, 11, 12)]
    izleyici = MenuIzleyici("menuler/{tarih}.yaml", tmp_path, bugun=lambda: gun[0])
    assert izleyici.yol() == tmp_path / "menuler" / "2026-11-12.yaml"
    assert izleyici.guncel().yemek("corba") is not None
    gun[0] = date(2026, 11, 13)  # ertesi günün menüsü henüz yok: dünkü kullanılır
    assert izleyici.guncel().yemek("corba") is not None


def test_ornek_menu_dosyasi_dogrudan(menu):
    assert ORNEK_MENU.is_file()
    assert [y.id for y in menu.yemekler][:2] == ["mercimek_corbasi", "ezogelin_corbasi"]
