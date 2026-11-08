"""Beş boyut: marj, zamanlama, segment uyumu, stok riski."""

from datetime import date

import pytest

from moda_radar.sema import TahminKaydi, Yon
from moda_radar.yatirim import ayar, boyutlar

E = ayar.esikler()
TAKVIM = E["satin_alma_takvimi"]
MALIYET = ayar.maliyet("kadin-ust")
ORTA = ayar.segment("orta")


def tahmin(**kw) -> TahminKaydi:
    temel = {
        "sezon": "FW25",
        "segment": "orta",
        "kategori": "kadin-ust",
        "nitelik_ekseni": "urun",
        "nitelik_degeri": "kombinasyon",
        "olasilik": 0.7,
        "esik_raf_payi": 0.04,
        "ufuk_sezon": "SS27",
        "yon": Yon.YUKSELIS,
        "gecikme_sezon": 3,
        "gecikme_kaynagi": "onsel",
        "kaynak_sayisi": 3,
        "model_surumu": "test",
        "gerekce": "deneme",
    }
    return TahminKaydi(**(temel | kw))


URUN = {
    "kategori": "kadin-ust",
    "siluet": "oversize",
    "kumas_gorunumu": "keten",
    "desen": "duz",
    "detay": "yok",
    "sezon": "SS27",
    "renk_hex": "#2E5A88",
}
BUGUN = date(2026, 11, 8)


def test_marj_kullanici_degerleriyle():
    b = boyutlar.hesapla(tahmin(), URUN, ORTA, MALIYET, hedef_fiyat=899, maliyet_adet=380, bugun=BUGUN)
    assert b.marj_yuzde == pytest.approx((899 - 380) / 899 * 100, abs=0.05)


def test_marj_bant_ortasi_ve_desen_ek_maliyeti():
    b, a = boyutlar.hesapla_ayrintili(tahmin(), URUN | {"desen": "cicekli"}, ORTA, MALIYET, bugun=BUGUN)
    keten = MALIYET["kumas_maliyeti"]["keten"]["orta"]
    fiyat = MALIYET["hedef_satis_fiyati"]["orta"]
    beklenen_mal = (keten["alt"] + keten["ust"]) / 2 + MALIYET["ek_maliyet_seviyeleri"]["orta"]["orta"]
    beklenen_fiyat = (fiyat["alt"] + fiyat["ust"]) / 2
    assert a["maliyet"] == pytest.approx(beklenen_mal)
    assert a["hedef_fiyat"] == pytest.approx(beklenen_fiyat)
    assert b.marj_yuzde == pytest.approx((beklenen_fiyat - beklenen_mal) / beklenen_fiyat * 100, abs=0.05)


def test_nakis_duz_detaydan_pahali():
    m1, _ = boyutlar.maliyet_bul(URUN, "orta", MALIYET)
    m2, _ = boyutlar.maliyet_bul(URUN | {"detay": "nakis"}, "orta", MALIYET)
    assert m2 - m1 == MALIYET["ek_maliyet_seviyeleri"]["orta"]["yuksek"]


def test_maliyet_dosyasi_yoksa_segment_bandi_ve_maliyet_zorunlu():
    with pytest.raises(ValueError, match="maliyet"):
        boyutlar.hesapla(tahmin(), URUN, ORTA, None, bugun=BUGUN)
    _b, a = boyutlar.hesapla_ayrintili(tahmin(), URUN, ORTA, None, maliyet_adet=300, bugun=BUGUN)
    assert a["hedef_fiyat"] == (ORTA.fiyat_bandi_try["kadin_ust_alt"] + ORTA.fiyat_bandi_try["kadin_ust_ust"]) / 2


@pytest.mark.parametrize(
    "ufuk,bugun,beklenen",
    [
        ("SS27", date(2026, 11, 8), "zamaninda"),
        ("FW27", date(2026, 11, 8), "erken"),
        ("SS28", date(2026, 11, 8), "erken"),
        ("FW26", date(2026, 11, 8), "gec"),
        ("SS27", date(2026, 12, 15), "gec"),  # SS27 sipariş penceresi Kasım sonunda kapandı
        ("SS27", date(2026, 3, 1), "zamaninda"),  # pencereden önce planlama
    ],
)
def test_zamanlama(ufuk, bugun, beklenen):
    z, aciklama = boyutlar.zamanlama_hesapla(tahmin(ufuk_sezon=ufuk), "SS27", bugun, TAKVIM)
    assert z == beklenen
    assert aciklama


def test_siparis_penceresi():
    assert boyutlar.siparis_penceresi("SS27", TAKVIM) == (date(2026, 9, 1), date(2026, 11, 30))
    assert boyutlar.siparis_penceresi("FW27", TAKVIM) == (date(2027, 3, 1), date(2027, 5, 31))


def test_sezon_yardimcilari():
    assert boyutlar.sezon_ekle("SS27", -3) == "FW25"
    assert boyutlar.siradaki_sezon(date(2026, 11, 8)) == "SS27"
    assert boyutlar.siradaki_sezon(date(2027, 2, 1)) == "FW27"
    assert boyutlar.siradaki_sezon(date(2026, 12, 1)) == "FW27"


def test_segment_uyumu_segmentlere_gore_farkli():
    deri = URUN | {"kumas_gorunumu": "deri", "detay": "nakis"}
    luks = boyutlar.segment_uyumu(deri, "luks", E["uyum_agirliklari"])
    deger = boyutlar.segment_uyumu(deri, "deger", E["uyum_agirliklari"])
    assert luks > deger
    assert 0 <= deger <= 1


@pytest.mark.parametrize(
    "hex_,aile",
    [
        ("#000000", "notr"),
        ("#F0EEE9", "notr"),
        ("#1F2A44", "notr"),
        ("#C19A6B", "notr"),
        ("#E4572E", "moda"),
        ("#2E5A88", "moda"),
        (None, "bilinmiyor"),
    ],
)
def test_renk_ailesi(hex_, aile):
    assert boyutlar.renk_ailesi(hex_, E["notr_renk"]) == aile


def test_stok_riski():
    assert boyutlar.stok_riski_hesapla("notr", 0.4, "yukselis", 1, E)[0] == "dusuk"
    assert boyutlar.stok_riski_hesapla("moda", 0.7, "yukselis", 1, E)[0] == "orta"
    assert boyutlar.stok_riski_hesapla("moda", 0.5, "yukselis", 1, E)[0] == "yuksek"
    assert boyutlar.stok_riski_hesapla("notr", 0.7, "yukselis", 6, E)[0] == "orta"
    assert boyutlar.stok_riski_hesapla("moda", 0.7, "yukselis", 6, E)[0] == "yuksek"
    assert boyutlar.stok_riski_hesapla("notr", 0.7, "zirve", 1, E)[0] == "orta"


def test_ivme_ve_yon_tahminden():
    b = boyutlar.hesapla(tahmin(olasilik=0.42, yon=Yon.GIRIS), URUN, ORTA, MALIYET, bugun=BUGUN)
    assert b.trend_ivmesi == 0.42 and b.trend_yonu == Yon.GIRIS
