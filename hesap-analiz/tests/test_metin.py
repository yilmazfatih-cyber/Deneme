from hesap_analiz.metin import anlamli_kelimeler, buyuk, gurultu_ayikla, sade


def test_turkce_buyuk_harf():
    assert buyuk("ilaç için") == "İLAÇ İÇİN"


def test_sade_ascii():
    assert sade("Ayşe Çelik İş") == "AYSE CELIK IS"


def test_gurultu_iban_ve_sayilar():
    m = gurultu_ayikla("FAST GELEN TR12 0001 0000 1234 5678 9012 34 AHMET YILMAZ 12.03.2026 1.250,00 TL")
    assert "TR12" not in m and "1.250,00" not in m and "AHMET" in m


def test_anlamli_kelimeler():
    assert anlamli_kelimeler("EFT GIDEN - ALICI: AHMET YILMAZ REF 123456") == ["AHMET", "YILMAZ"]
