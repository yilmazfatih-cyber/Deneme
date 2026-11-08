from hesap_analiz.okuma import _sayiya


def test_turkce_sayi_bicimleri():
    assert _sayiya("1.234,56") == 1234.56
    assert _sayiya("-250,00 TL") == -250.0
    assert _sayiya("(250,00)") == -250.0
    assert _sayiya("1,234.56") == 1234.56
    assert _sayiya(1500) == 1500.0
    assert _sayiya("") != _sayiya("")  # NaN
