"""Gizli sınav testi (veri-bas-harfler): baş harfler Türkçe büyük harf kuralına uyar (i → İ, ı → I)."""

import pytest
from verihavuzu.text import initials_tr


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("ayşe nur yılmaz", "AY"), ("Mehmet Öz", "MÖ"), ("ilker", "İ"), ("  can   ışık ", "CI"),
        ("", ""), ("   ", ""), ("ilker iğci", "İİ"), ("ırmak ılgaz", "II"), ("İsmail ünal", "İÜ"),
        ("çağrı şen", "ÇŞ"), ("öykü", "Ö"), ("Iğdır", "I"), ("idil\tince", "İİ"), ("ali veli ilhan", "Aİ"),
    ],
)  # fmt: skip
def test_bas_harfler(name: str, expected: str) -> None:
    assert initials_tr(name) == expected
