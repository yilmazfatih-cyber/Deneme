from pathlib import Path

import pytest

from yemekhane_kasa.fiyat import AZAMI_ADET, Kalem, fiyatlandir
from yemekhane_kasa.menu import menu_yukle


def test_basit_toplam(menu):
    adisyon = fiyatlandir(menu, [Kalem("kuru_fasulye"), Kalem("ayran", 2)])
    assert [(s.menu_id, s.adet, s.tutar_kurus) for s in adisyon.satirlar] == [
        ("kuru_fasulye", 1, 12000),
        ("ayran", 2, 5000),
    ]
    assert adisyon.toplam_kurus == 17000
    assert not adisyon.kontrol_gerekli


def test_ayni_kalemler_birlesir_siralama_menu_sirasidir(menu):
    adisyon = fiyatlandir(menu, [Kalem("ayran", 1, guven=0.9), Kalem("kuru_fasulye"), Kalem("ayran", 1, guven=0.7)])
    assert adisyon.kalem_imzasi() == (("kuru_fasulye", "tam", 1), ("ayran", "tam", 2))
    assert adisyon.satirlar[1].guven == 0.7


def test_yarim_porsiyon(menu):
    adisyon = fiyatlandir(menu, [Kalem("pirinc_pilavi", 1, "yarim"), Kalem("izmir_kofte", 1, "yarim")])
    kofte, pilav = adisyon.satirlar  # satırlar menüdeki sırayla gelir
    assert (pilav.porsiyon, pilav.tutar_kurus) == ("yarim", 3500)
    assert (kofte.porsiyon, kofte.tutar_kurus) == ("tam", 16500)  # yarım porsiyonu yok: tam fiyat


def test_dusuk_guven_adisyonda_kalir_ama_kontrol_ister(menu):
    adisyon = fiyatlandir(menu, [Kalem("tavuk_sote", guven=0.42)], en_dusuk_guven=0.6)
    assert adisyon.toplam_kurus == 15000
    assert adisyon.kontrol_gerekli
    assert adisyon.uyarilar == ["Tavuk sote için emin değilim (güven %42)"]


def test_menude_olmayan_ve_taninmayan(menu):
    adisyon = fiyatlandir(menu, [Kalem("lahmacun"), Kalem("ayran")], taninmayanlar=["kırmızı soslu makarna"])
    assert adisyon.kalem_imzasi() == (("ayran", "tam", 1),)
    assert adisyon.uyarilar == ["Menüde olmayan kimlik atlandı: lahmacun", "Menüde bulunamadı: kırmızı soslu makarna"]
    assert adisyon.taninmayanlar == ["kırmızı soslu makarna"]


def test_adet_siniri_ve_gecersiz_adet(menu):
    adisyon = fiyatlandir(menu, [Kalem("ayran", 25), Kalem("cacik", 0), Kalem("revani", -1)])
    assert adisyon.kalem_imzasi() == (("ayran", "tam", AZAMI_ADET),)
    assert "sınırlandı" in adisyon.uyarilar[0]


def test_fiks_menu_en_pahali_kalemlerle_uygulanir(menu):
    kalemler = [Kalem(k) for k in ("mercimek_corbasi", "kuru_fasulye", "izmir_kofte", "pirinc_pilavi", "ayran")]
    adisyon = fiyatlandir(menu, kalemler)
    # Tek çorba var: bir kez uygulanır; ana yemeklerden pahalısı (köfte 165) seçilir: 60 + 165 + 55 − 210 = 70
    assert [(i.tutar_kurus, i.menu_idler) for i in adisyon.indirimler] == [
        (7000, ["mercimek_corbasi", "izmir_kofte", "pirinc_pilavi"])
    ]
    assert adisyon.toplam_kurus == 6000 + 12000 + 16500 + 5500 + 2500 - 7000


def test_fiks_menu_iki_kez_ve_yarim_porsiyon_sayilmaz(menu):
    kalemler = [
        Kalem("mercimek_corbasi", 2),
        Kalem("kuru_fasulye", 2),
        Kalem("pirinc_pilavi", 1),
        Kalem("bulgur_pilavi", 1, "yarim"),
    ]
    adisyon = fiyatlandir(menu, kalemler)
    assert len(adisyon.indirimler) == 1  # ikinci set için tam porsiyon yardımcı yok
    assert adisyon.indirimler[0].tutar_kurus == 6000 + 12000 + 5500 - 21000

    adisyon = fiyatlandir(menu, [Kalem("mercimek_corbasi", 2), Kalem("kuru_fasulye", 2), Kalem("pirinc_pilavi", 2)])
    assert [i.tutar_kurus for i in adisyon.indirimler] == [2500, 2500]


def test_fiks_menu_indirim_yoksa_uygulanmaz(tmp_path: Path):
    yol = tmp_path / "m.yaml"
    yol.write_text(
        "yemekler:\n"
        "  - {id: c, ad: Ç, fiyat: 10, kategori: corba}\n"
        "  - {id: a, ad: A, fiyat: 20, kategori: ana}\n"
        "fiks_menuler:\n  - {ad: Pahalı set, kategoriler: [corba, ana], fiyat: 40}\n",
        encoding="utf-8",
    )
    adisyon = fiyatlandir(menu_yukle(yol), [Kalem("c"), Kalem("a")])
    assert adisyon.indirimler == []
    assert adisyon.toplam_kurus == 3000


def test_kdv_dokumu_farkli_oranlar_ve_indirim_payi(tmp_path: Path):
    yol = tmp_path / "m.yaml"
    yol.write_text(
        "kdv: 10\n"
        "yemekler:\n"
        "  - {id: c, ad: Çorba, fiyat: 60, kategori: corba}\n"
        "  - {id: a, ad: Ana, fiyat: 140, kategori: ana}\n"
        "  - {id: k, ad: Kola, fiyat: 50, kategori: icecek, kdv: 20}\n"
        "fiks_menuler:\n  - {ad: Set, kategoriler: [corba, ana], fiyat: 180}\n",
        encoding="utf-8",
    )
    adisyon = fiyatlandir(menu_yukle(yol), [Kalem("c"), Kalem("a"), Kalem("k")])
    assert adisyon.toplam_kurus == 25000 - 2000
    # İndirim (20 TL) yalnız %10'luk kalemlere düşer: %10 brüt 180 TL, %20 brüt 50 TL
    kdv = {k.oran: k for k in adisyon.kdv}
    assert kdv[10].matrah_kurus + kdv[10].tutar_kurus == 18000
    assert kdv[10].tutar_kurus == 1636  # 18000 × 10/110 = 1636,36
    assert kdv[20].matrah_kurus + kdv[20].tutar_kurus == 5000
    assert kdv[20].tutar_kurus == 833  # 5000 × 20/120 = 833,33
    assert sum(k.matrah_kurus + k.tutar_kurus for k in adisyon.kdv) == adisyon.toplam_kurus


@pytest.mark.parametrize("guven", [-0.5, 1.7])
def test_guven_sinirlanir(menu, guven):
    satir = fiyatlandir(menu, [Kalem("ayran", guven=guven)]).satirlar[0]
    assert 0.0 <= satir.guven <= 1.0
