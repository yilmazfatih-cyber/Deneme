import pytest

from moda_radar.renk import pantone, uzay


def test_tablo_yuklenir_ve_onbellekte():
    t = pantone.tablo()
    assert len(t.kodlar) == 2310 and t.lab.shape == (2310, 3)
    assert pantone.tablo() is t


@pytest.mark.parametrize("i", range(0, 2310, 97))
def test_tablodaki_renk_kendisine_eslesir(i):
    t = pantone.tablo()
    bir, iki = pantone.esle(t.hexler[i])
    assert bir.delta_e == pytest.approx(0.0, abs=1e-6)
    assert bir.hex == t.hexler[i]
    assert bir.guven == "eslesme"
    assert iki.delta_e >= bir.delta_e and iki.kod != bir.kod


def test_bilinen_kod():
    bir, _ = pantone.esle("#DD4132")
    assert bir.kod == "17-1564 TCX" and bir.delta_e < 1e-6


def test_beyaz_ve_siyah_makul():
    bir, iki = pantone.esle("#FFFFFF")
    assert bir.kod.startswith("11-") and bir.delta_e < 5
    assert pantone.aile(uzay.hex_to_lab(bir.hex)) in {"beyaz", "notr-acik"}
    bir, iki = pantone.esle("#000000")
    assert bir.kod.startswith("19-")
    assert pantone.aile(uzay.hex_to_lab(bir.hex)) in {"siyah", "notr-koyu"}
    assert iki.delta_e >= bir.delta_e


def test_en_yakin_n():
    adaylar = pantone.en_yakin(uzay.hex_to_lab("#2E5A88"), n=5)
    assert len(adaylar) == 5
    assert [a.delta_e for a in adaylar] == sorted(a.delta_e for a in adaylar)


def test_kod_ile():
    e = pantone.kod_ile("17-1564 TCX")
    assert e is not None and e.hex == "#DD4132" and e.delta_e == 0
    assert pantone.kod_ile("17-1564") == e
    assert pantone.kod_ile("99-9999 TCX") is None
    assert pantone.kod_ile("rastgele") is None


@pytest.mark.parametrize(
    ("hex_", "beklenen"),
    [
        ("#DA321C", "kirmizi"),
        ("#800020", "kirmizi"),
        ("#FFA500", "turuncu"),
        ("#FFFF00", "sari"),
        ("#E1AD01", "sari"),
        ("#00A000", "yesil"),
        ("#808000", "yesil"),
        ("#2E5A88", "mavi"),
        ("#0000FF", "mavi"),
        ("#000080", "mavi"),
        ("#008080", "mavi"),
        ("#800080", "mor"),
        ("#FF69B4", "pembe"),
        ("#FFC0CB", "pembe"),
        ("#8B4513", "kahverengi"),
        ("#C19A6B", "kahverengi"),
        ("#F5F5DC", "notr-acik"),
        ("#C0C0C0", "notr-acik"),
        ("#505050", "notr-koyu"),
        ("#FFFFFF", "beyaz"),
        ("#000000", "siyah"),
    ],
)
def test_aile(hex_, beklenen):
    assert pantone.aile(uzay.hex_to_lab(hex_)) == beklenen


def test_aile_degerleri_tanimli_kume_icinde():
    t = pantone.tablo()
    for i in range(0, 2310, 7):
        assert pantone.aile(uzay.hex_to_lab(t.hexler[i])) in pantone.AILELER
