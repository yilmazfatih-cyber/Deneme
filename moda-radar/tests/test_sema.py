from datetime import date

import pytest
from pydantic import ValidationError

from moda_radar.sema import (
    Kaynak,
    KaynakTuru,
    Lab,
    PantoneEslesme,
    TahminKaydi,
    YatirimBoyutlari,
    YatirimKarti,
    Yon,
)


def _kaynak() -> Kaynak:
    return Kaynak(
        tur=KaynakTuru.PODYUM, url="https://example.org/defile/1", tarama_tarihi=date(2026, 3, 1), sezon="SS27"
    )


def test_sezon_bicimi():
    with pytest.raises(ValidationError):
        Kaynak(tur=KaynakTuru.PODYUM, url="u", tarama_tarihi=date(2026, 3, 1), sezon="2027-yaz")


def test_pantone_kod_ve_guven():
    e = PantoneEslesme(kod="17-1564 TCX", hex="#da321c", delta_e=2.4)
    assert e.hex == "#DA321C"
    assert e.guven == "eslesme"
    assert PantoneEslesme(kod="17-1564 TCX", hex="#DA321C", delta_e=4).guven == "yakin"
    assert PantoneEslesme(kod="17-1564 TCX", hex="#DA321C", delta_e=7).guven == "yaklasik"
    with pytest.raises(ValidationError):
        PantoneEslesme(kod="171564", hex="#DA321C", delta_e=1)


def test_tahmin_kesinlik_dili_reddedilir():
    temel = {
        "sezon": "SS27",
        "segment": "premium",
        "kategori": "kadin-ust",
        "nitelik_ekseni": "renk",
        "nitelik_degeri": "17-1564 TCX",
        "olasilik": 0.62,
        "esik_raf_payi": 0.04,
        "ufuk_sezon": "SS27",
        "yon": Yon.YUKSELIS,
        "gecikme_sezon": 2,
        "gecikme_kaynagi": "onsel",
        "kaynak_sayisi": 14,
        "model_surumu": "v0",
    }
    TahminKaydi(**temel, gerekce="Podyum payı +3,2 puan; talep ivmesi pozitif.")
    with pytest.raises(ValidationError):
        TahminKaydi(**temel, gerekce="Bu renk kesin tutacak.")


def test_yatirim_karti_urun_anahtarlari():
    boyut = YatirimBoyutlari(
        trend_ivmesi=0.7,
        trend_yonu=Yon.GIRIS,
        segment_uyumu=0.8,
        zamanlama="zamaninda",
        marj_yuzde=52,
        stok_riski="orta",
        rakip_sayisi=2,
    )
    with pytest.raises(ValidationError):
        YatirimKarti(
            sezon="SS27",
            segment="orta",
            urun={"kategori": "kadin-ust"},
            boyutlar=boyut,
            karar="YATIR",
            gerekce="x",
            degistirecek_sinyal="y",
            kaynak_sayisi=3,
            model_surumu="v0",
        )
    k = YatirimKarti(
        sezon="SS27",
        segment="orta",
        urun={
            "kategori": "kadin-ust",
            "siluet": "kutu",
            "kumas_gorunumu": "keten",
            "desen": "duz",
            "renk_tcx": "14-4318 TCX",
        },
        boyutlar=boyut,
        karar="YATIR",
        gerekce="x",
        degistirecek_sinyal="y",
        kaynak_sayisi=3,
        model_surumu="v0",
    )
    assert "tavsiye" in k.uyari


def test_lab_sinirlari():
    with pytest.raises(ValidationError):
        Lab(L=101, a=0, b=0)
