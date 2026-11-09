from __future__ import annotations

import copy

import pytest

from ithalat_ajani.ayarlar import Ayarlar
from ithalat_ajani.tarife import varsayilan_tarife

KUR = 50.0


@pytest.fixture
def tarife():
    return varsayilan_tarife()


@pytest.fixture
def ayarlar():
    return Ayarlar()


def aday_sozluk(**ust) -> dict:
    """Varsayılan: eşarp, 2 $, 0,07 kg (ilandan), 4 Türkiye ilanı. `alibaba`/`turkiye` alanları birleştirilir."""
    temel = {
        "urun": "Deneme eşarp",
        "kategori": "esarp-sal",
        "alibaba": {
            "url": "https://example.com/a/1",
            "fiyat_usd": 2.0,
            "moq": 100,
            "birim_agirlik_kg": 0.07,
            "agirlik_kaynagi": "ilan",
        },
        "turkiye": {"fiyatlar": [{"fiyat_tl": f, "kaynak": "trendyol"} for f in (900, 950, 1000, 1100)]},
    }
    sonuc = copy.deepcopy(temel)
    for anahtar, deger in ust.items():
        if anahtar in ("alibaba", "turkiye") and isinstance(deger, dict):
            sonuc[anahtar].update(deger)
        else:
            sonuc[anahtar] = deger
    return sonuc
