from pathlib import Path

import pytest

from turkce_model.ayarlar import (
    GOMME_KARARLARI,
    KARAR_VER,
    AyarHatasi,
    ayarlari_yukle,
    eksik_karar_mesaji,
    gomme_uyarilari,
)

PROJE = Path(__file__).resolve().parents[1]


def test_depodaki_ayarlarda_gomme_kararlari_bos():
    ayarlar = ayarlari_yukle(PROJE / "ayarlar.toml")
    assert ayarlar.gomme.eksikler() == [ad for ad, _, _ in GOMME_KARARLARI]
    assert all(getattr(ayarlar.gomme, ad) == KARAR_VER for ad, _, _ in GOMME_KARARLARI)


def test_eksik_karar_mesaji_her_karari_anlatir():
    mesaj = eksik_karar_mesaji([ad for ad, _, _ in GOMME_KARARLARI])
    for ad, _, _ in GOMME_KARARLARI:
        assert f"gomme.{ad}" in mesaj
    assert "GOMME_KARARLARI.md" in mesaj


def test_gecersiz_kilma_degerleri():
    ayarlar = ayarlari_yukle(
        PROJE / "ayarlar.toml",
        ["gomme.boyut=384", "gomme.konum=rope", 'gomme.norm="rmsnorm"', "gomme.cikis_baglama=true", "egitim.tdk.ogrenme_orani=1e-3", "model.katman=4"],
    )
    assert ayarlar.gomme.boyut == 384 and ayarlar.gomme.konum == "rope" and ayarlar.gomme.norm == "rmsnorm"
    assert ayarlar.gomme.cikis_baglama is True
    assert ayarlar.tdk.ogrenme_orani == 1e-3 and ayarlar.meb.ogrenme_orani != 1e-3
    assert ayarlar.model.katman == 4
    assert ayarlar.kok == PROJE


def test_bilinmeyen_alan_hata():
    with pytest.raises(AyarHatasi, match="Bilinmeyen ayar"):
        ayarlari_yukle(None, ["gomme.renk=mavi"])
    with pytest.raises(AyarHatasi, match="Bilinmeyen"):
        ayarlari_yukle(None, ["egitim.baska.adim=3"])


def test_deney_adi_kararlardan_turetilir():
    ayarlar = ayarlari_yukle(
        None,
        [
            "gomme.boyut=256", "gomme.konum=alibi", "gomme.cikis_baglama=false", "gomme.faktor_boyutu=64",
            "gomme.kategori_gommesi=true", "gomme.bicim_paylasimi=true", "gomme.olcek=false", "gomme.norm=yok",
            "gomme.baslatma_std=otomatik", "gomme.dropout=0.1", "model.katman=4",
        ],
    )
    assert ayarlar.deney_adi == "g256-alibi-ayri-f64-kat-bicim-k4"
    assert ayarlar.gomme.std() == pytest.approx(256**-0.5)


def test_uyarilar():
    ayarlar = ayarlari_yukle(
        None,
        [
            "gomme.boyut=256", "gomme.konum=sinus", "gomme.cikis_baglama=true", "gomme.faktor_boyutu=0",
            "gomme.kategori_gommesi=false", "gomme.bicim_paylasimi=false", "gomme.olcek=false", "gomme.norm=yok",
            "gomme.baslatma_std=0.02", "gomme.dropout=0.0",
        ],
    )
    assert any("Sinüs" in u for u in gomme_uyarilari(ayarlar.gomme))
