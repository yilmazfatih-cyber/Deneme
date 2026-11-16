"""BİLEREK kalan testler: raporlayıcının başarısızlıkta neler gösterdiğini görmek için.

Çalıştırma: python -m test_cercevesi test_cercevesi/ornekler_hatali   (çıkış kodu 1 beklenir)
"""

from __future__ import annotations

import time

from test_cercevesi import raises, timeout


def topla(a: int, b: int) -> int:
    return a + b


def test_esitlik_kalir() -> None:
    assert topla(2, 2) == 5


def test_metin_farki() -> None:
    assert "merhaba dünya" == "merhaba dunya"


def test_liste_farki() -> None:
    assert [1, 2, 3] == [1, 2, 4], "listeler aynı olmalıydı"


def test_deger_gosterimi() -> None:
    sepet: list[str] = []
    assert sepet


def test_beklenen_hata_olusmadi() -> None:
    with raises(ValueError):
        topla(1, 1)


@timeout(0.3)
def test_zaman_asimi() -> None:
    time.sleep(3)


def test_beklenmeyen_istisna() -> None:
    _ = 1 / 0


def test_eksik_fixture(boyle_bir_fixture_yok: int) -> None:
    assert boyle_bir_fixture_yok
