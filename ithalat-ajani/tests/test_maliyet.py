from __future__ import annotations

from dataclasses import replace

import pytest

from ithalat_ajani.ayarlar import Ayarlar
from ithalat_ajani.maliyet import MaliyetGirdisi, birim_maliyet, kat, satis_dokumu, ucretli_agirlik
from ithalat_ajani.tarife import Kategori

KATEGORI = Kategori(
    anahtar="deneme", ad="Deneme", grup="aksesuar", gtip=("9999",), gv=0.10, igv=0.30, kdv=0.20,
    ornek_agirlik_kg=0.5, mevsim="hepsi", guven="kaynakli", kaynak="test",
)  # fmt: skip


def test_formul_elle_hesaplananla_ayni():
    ayarlar = Ayarlar()  # kargo 5 $/kg, ambalaj %10, sigorta %0,5, sabit 12.000 TL / 3.000 $, ödeme %3
    d = birim_maliyet(MaliyetGirdisi(fiyat_usd=10.0, agirlik_kg=0.5), KATEGORI, 40.0, ayarlar)
    assert d.ucretli_kg == pytest.approx(0.55)
    assert d.kargo_usd == pytest.approx(2.75)
    assert d.sigorta_usd == pytest.approx(12.75 * 0.005)
    assert d.cif_usd == pytest.approx(10 + 2.75 + 0.06375)
    assert d.cif_tl == pytest.approx(512.55)
    assert d.gv_tl == pytest.approx(51.255)
    assert d.igv_tl == pytest.approx(153.765)
    assert d.odeme_usd == pytest.approx(0.30)
    assert d.sabit_pay_tl == pytest.approx(40.0)  # 12.000 × 10 / 3.000
    assert d.birim_maliyet_tl == pytest.approx((10 + 0.30 + 2.75 + 0.06375) * 40 + 51.255 + 153.765 + 40.0)
    assert d.kdv_matrahi_tl == pytest.approx(512.55 + 51.255 + 153.765)
    assert d.ithalat_kdv_tl == pytest.approx(d.kdv_matrahi_tl * 0.20)
    assert d.nakit_cikis_tl == pytest.approx(d.birim_maliyet_tl + d.ithalat_kdv_tl)
    assert d.vergi_yuku == pytest.approx(0.40)
    assert d.kargo_payi == pytest.approx(2.75 / 12.75)


def test_hacimsel_agirlik_gercegi_asarsa_kullanilir():
    ayarlar = Ayarlar()
    kg, hacimsel = ucretli_agirlik(MaliyetGirdisi(fiyat_usd=5, agirlik_kg=0.5, olcu_cm=(30, 20, 10)), ayarlar)
    assert hacimsel and kg == pytest.approx(1.2)
    kg, hacimsel = ucretli_agirlik(MaliyetGirdisi(fiyat_usd=5, agirlik_kg=0.5, olcu_cm=(10, 10, 2)), ayarlar)
    assert not hacimsel and kg == pytest.approx(0.55)


def test_kargo_ucreti_ayardan_gelir():
    ucuz = replace(Ayarlar(), kargo=replace(Ayarlar().kargo, usd_kg=2.0))
    d1 = birim_maliyet(MaliyetGirdisi(fiyat_usd=10, agirlik_kg=1.0), KATEGORI, 40, Ayarlar())
    d2 = birim_maliyet(MaliyetGirdisi(fiyat_usd=10, agirlik_kg=1.0), KATEGORI, 40, ucuz)
    assert d1.kargo_usd == pytest.approx(5.5) and d2.kargo_usd == pytest.approx(2.2)


def test_igv_stres_icin_degistirilebilir():
    g = MaliyetGirdisi(fiyat_usd=10, agirlik_kg=0.5)
    normal = birim_maliyet(g, KATEGORI, 40, Ayarlar())
    stres = birim_maliyet(g, KATEGORI, 40, Ayarlar(), igv=0.45)
    assert stres.igv_tl == pytest.approx(normal.cif_tl * 0.45)
    assert stres.birim_maliyet_tl > normal.birim_maliyet_tl


def test_kat_kdv_haric_karsilastirir():
    d = birim_maliyet(MaliyetGirdisi(fiyat_usd=10, agirlik_kg=0.5), KATEGORI, 40, Ayarlar())
    raf = 3 * d.birim_maliyet_tl * 1.20  # KDV %20 dahil raf fiyatı tam 3 kat
    assert kat(raf, d, KATEGORI) == pytest.approx(3.0)


def test_satis_dokumu_komisyonu_kdv_dahil_fiyattan_alir():
    ayarlar = Ayarlar()
    d = birim_maliyet(MaliyetGirdisi(fiyat_usd=2, agirlik_kg=0.05), KATEGORI, 40, ayarlar)
    s = satis_dokumu(1200.0, d, KATEGORI, ayarlar)
    assert s.satis_net_tl == pytest.approx(1000.0)
    assert s.komisyon_tl == pytest.approx(1200 * 0.215)
    assert s.iade_tl == pytest.approx(0.10 * 90)
    assert s.birim_kar_tl == pytest.approx(1000 - 258 - 90 - 9 - d.birim_maliyet_tl)


@pytest.mark.parametrize("alan", ["fiyat_usd", "agirlik_kg"])
def test_sifir_girdi_reddedilir(alan):
    g = {"fiyat_usd": 1.0, "agirlik_kg": 0.1, alan: 0}
    with pytest.raises(ValueError):
        birim_maliyet(MaliyetGirdisi(**g), KATEGORI, 40, Ayarlar())
