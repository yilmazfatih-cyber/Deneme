"""Türkçe metin yardımcıları: noktalı/noktasız i, NFC birleştirme; örnek veri belirlenimciliği."""

from __future__ import annotations

import unicodedata

import numpy as np

from goruntu.synthetic import shape_image
from goruntu.text_tr import lower_ascii, lower_tr, nfc, upper_tr


def test_turkce_buyuk_kucuk_harf() -> None:
    assert lower_tr("İSTANBUL IŞIK") == "istanbul ışık"
    assert upper_tr("istanbul ışık çiğdem") == "İSTANBUL IŞIK ÇİĞDEM"
    assert lower_ascii("JPEG") == "jpeg"


def test_nfc_birlestirir() -> None:
    decomposed = unicodedata.normalize("NFD", "çanta şişe")
    assert decomposed != "çanta şişe" and nfc(decomposed) == "çanta şişe"


def test_ornek_goruntu_tohumla_ayni() -> None:
    first = shape_image("üçgen", "mavi", np.random.default_rng(7), 32)
    second = shape_image("üçgen", "mavi", np.random.default_rng(7), 32)
    assert np.array_equal(np.asarray(first), np.asarray(second))
