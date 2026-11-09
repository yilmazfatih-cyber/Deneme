from __future__ import annotations

from dataclasses import replace

import pytest

from ithalat_ajani.aday import AdayHatasi, aday_oku
from ithalat_ajani.degerlendir import degerlendir_aday, toplu_degerlendir

from .conftest import KUR, aday_sozluk


def _sonuc(tarife, ayarlar, **ust):
    return degerlendir_aday(aday_oku(aday_sozluk(**ust), tarife), tarife, KUR, ayarlar)


def test_ucuz_hafif_esarp_uygun(tarife, ayarlar):
    s = _sonuc(tarife, ayarlar)
    assert s.kat >= 3 and s.durum == "UYGUN"
    assert s.tr.medyan == 975 and s.tr.adet == 4
    assert not s.dogrula


def test_az_karsilastirma_dogrulatir(tarife, ayarlar):
    s = _sonuc(tarife, ayarlar, turkiye={"fiyatlar": [{"fiyat_tl": 1000}, {"fiyat_tl": 1100}]})
    assert s.kat >= 3 and s.durum == "UYGUN-DOGRULA"
    assert any("2 ilana" in x for x in s.dogrula)


def test_esikler_yakin_ve_elendi(tarife, ayarlar):
    yakin = _sonuc(tarife, ayarlar, turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (520, 540, 560)]})
    assert 2.5 <= yakin.kat < 3 and yakin.durum == "YAKIN"
    elenen = _sonuc(tarife, ayarlar, turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (300, 320, 340)]})
    assert elenen.kat < 2.5 and elenen.durum == "ELENDI"


def test_hedef_kat_ayardan(tarife, ayarlar):
    gevsek = replace(ayarlar, esikler=replace(ayarlar.esikler, hedef_kat=1.5, yakin_kat=1.2))
    s = _sonuc(tarife, gevsek, turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (520, 540, 560)]})
    assert s.durum == "UYGUN"


def test_taklit_riski_her_zaman_elenir(tarife, ayarlar):
    s = _sonuc(tarife, ayarlar, taklit_riski=True)
    assert s.kat >= 3 and s.durum == "ELENDI"


def test_tahmini_vergi_stres_testi(tarife, ayarlar):
    rahat = _sonuc(
        tarife, ayarlar, kategori="taki-bijuteri",
        alibaba={"fiyat_usd": 0.5, "birim_agirlik_kg": 0.015},
        turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (450, 500, 550)]},
    )  # fmt: skip
    assert rahat.stres_kat is not None and rahat.stres_kat < rahat.kat
    assert rahat.stres_kat >= 3 and rahat.durum == "UYGUN"
    sinirda = _sonuc(
        tarife, ayarlar, kategori="taki-bijuteri",
        alibaba={"fiyat_usd": 0.5, "birim_agirlik_kg": 0.015},
        turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (155, 158, 160)]},
    )  # fmt: skip
    assert sinirda.kat >= 3 > sinirda.stres_kat
    assert sinirda.durum == "UYGUN-DOGRULA" and any("tahmini" in x for x in sinirda.dogrula)


def test_agirlik_yoksa_kategori_ortalamasi(tarife, ayarlar):
    ham = aday_sozluk()
    del ham["alibaba"]["birim_agirlik_kg"]
    aday = aday_oku(ham, tarife)
    assert aday.agirlik_kg == tarife.bul("esarp-sal").ornek_agirlik_kg and aday.agirlik_kaynagi == "kategori"


def test_agir_urunde_tahmini_agirlik_dogrulatir(tarife, ayarlar):
    s = _sonuc(
        tarife, ayarlar, kategori="mont-ceket-yelek",
        alibaba={"fiyat_usd": 8.0, "birim_agirlik_kg": 0.9, "agirlik_kaynagi": "tahmin"},
        turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (3000, 3200, 3400)]},
    )  # fmt: skip
    assert s.dokum.kargo_payi > 0.15 and any("brüt ağırlığı" in x for x in s.dogrula)


def test_moq_butceyi_asarsa_uyarir(tarife, ayarlar):
    s = _sonuc(tarife, ayarlar, alibaba={"moq": 2000})
    assert s.durum == "UYGUN-DOGRULA" and any("MOQ" in x for x in s.dogrula)


def test_ucuz_urunde_eksi_kar_dogrulatir(tarife, ayarlar):
    s = _sonuc(
        tarife, ayarlar, kategori="sac-aksesuari",
        alibaba={"fiyat_usd": 0.3, "birim_agirlik_kg": 0.01},
        turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (140, 150, 160)]},
    )  # fmt: skip
    assert s.kat >= 3 and s.satis.birim_kar_tl < 0
    assert s.durum == "UYGUN-DOGRULA" and any("kârı siliyor" in x for x in s.dogrula)


def test_kademe_daha_ucuzsa_kat_hesaplanir(tarife, ayarlar):
    s = _sonuc(tarife, ayarlar, alibaba={"kademeler": [{"min_adet": 2, "fiyat_usd": 2.5}, {"min_adet": 1000, "fiyat_usd": 1.5}]})
    assert s.en_iyi_kademe is not None and s.en_iyi_kademe.min_adet == 1000
    assert s.en_iyi_kademe.kat > s.kat


def test_alibaba_indirimi_ve_sureli_firsat(tarife, ayarlar):
    s = _sonuc(
        tarife, ayarlar,
        alibaba={"fiyat_usd": 2.0, "indirim": {"liste_fiyat_usd": 3.0, "bitis": "2026-11-15", "aciklama": "Deals"}},
        turkiye={"fiyatlar": [{"fiyat_tl": f} for f in (650, 700, 750)]},
    )  # fmt: skip
    assert s.indirim_orani == pytest.approx(1 / 3)
    assert s.kat >= 3 > s.indirimsiz_kat
    assert s.sureli_firsat and s.durum == "UYGUN"


def test_indirim_oranla_verilebilir(tarife):
    aday = aday_oku(aday_sozluk(alibaba={"fiyat_usd": 2.0, "indirim": {"oran": 0.2}}), tarife)
    assert aday.indirim.liste_fiyat_usd == pytest.approx(2.5)


def test_indirim_liste_fiyati_kucukse_hata(tarife):
    with pytest.raises(AdayHatasi):
        aday_oku(aday_sozluk(alibaba={"fiyat_usd": 2.0, "indirim": {"liste_fiyat_usd": 1.5}}), tarife)


def test_turkiye_indirimi_karari_raf_fiyatiyla_verir(tarife, ayarlar):
    fiyatlar = [
        {"fiyat_tl": 600, "liste_fiyat_tl": 900},
        {"fiyat_tl": 620, "liste_fiyat_tl": 950},
        {"fiyat_tl": 640},
        {"fiyat_tl": 700, "liste_fiyat_tl": 700},  # aynı fiyat: indirim sayılmaz
    ]
    s = _sonuc(tarife, ayarlar, turkiye={"fiyatlar": fiyatlar})
    assert s.tr.medyan == 630 and s.tr.indirimde_adet == 2
    assert s.tr.liste_medyan == pytest.approx(800)  # [900, 950, 640, 700] → (700 + 900) / 2
    assert s.tr_normal_kat > s.kat
    assert any("indirimde" in x for x in s.notlar)


@pytest.mark.parametrize(
    "bozuk, parca",
    [
        ({"kategori": "yok-boyle"}, "Bilinmeyen kategori"),
        ({"alibaba": {"url": "ftp://x"}}, "url"),
        ({"alibaba": {"fiyat_usd": 0}}, "fiyat_usd"),
        ({"alibaba": {"fiyat_usd": "2"}}, "sayı"),
        ({"turkiye": {"fiyatlar": []}}, "Türkiye fiyatı yok"),
        ({"urun": ""}, "urun"),
    ],
)
def test_bozuk_aday_reddedilir(tarife, bozuk, parca):
    with pytest.raises(AdayHatasi, match=parca):
        aday_oku(aday_sozluk(**bozuk), tarife)


def test_toplu_okunamayan_ve_tekrar_ve_siralama(tarife, ayarlar):
    adaylar = [
        aday_sozluk(urun="Pahalı", alibaba={"url": "https://example.com/a/pahali", "fiyat_usd": 6.0}),
        aday_sozluk(urun="İyi"),
        aday_sozluk(urun="Kopya"),  # aynı URL
        aday_sozluk(urun="Bozuk", kategori="yok"),
        "nesne değil",
    ]
    sonuclar, okunamayan = toplu_degerlendir(adaylar, tarife, KUR, ayarlar)
    assert [s.aday.urun for s in sonuclar] == ["İyi", "Pahalı"]
    assert sonuclar[0].durum == "UYGUN" and sonuclar[1].durum == "ELENDI"
    assert {o.urun for o in okunamayan} == {"Kopya", "Bozuk", "#5"}


def test_baglanti_kalitesi_denetlenir(tarife, ayarlar):
    from ithalat_ajani.degerlendir import tr_urun_sayfasi_mi, urun_ilani_mi

    assert urun_ilani_mi("https://www.alibaba.com/product-detail/Scarf_1600.html")
    assert urun_ilani_mi("https://www.alibaba.com/product-introduction/Scarf_1601.html")
    assert not urun_ilani_mi("https://www.alibaba.com/showroom/steel-jewelry.html")
    assert not urun_ilani_mi("https://www.alibaba.com/products/scarf.html")
    assert tr_urun_sayfasi_mi("https://www.trendyol.com/marka/esarp-p-123456")
    assert not tr_urun_sayfasi_mi("https://www.trendyol.com/90-x-90-giyim-x-c82-a92-v1576")
    assert tr_urun_sayfasi_mi("https://www.akakce.com/esarp/en-ucuz-twill-esarp-fiyati,1.html")
    assert not tr_urun_sayfasi_mi("https://www.akakce.com/esarp.html")
    assert tr_urun_sayfasi_mi("https://example.com/tr/1")

    s = _sonuc(
        tarife, ayarlar,
        alibaba={"url": "https://www.alibaba.com/showroom/scarf.html"},
        turkiye={"fiyatlar": [{"fiyat_tl": f, "url": "https://www.trendyol.com/esarp-x-c32"} for f in (900, 1000, 1100)]},
    )  # fmt: skip
    assert s.durum == "UYGUN-DOGRULA" and any("showroom" in x for x in s.dogrula)
    assert any("3 tanesi ürün değil" in x for x in s.notlar)
