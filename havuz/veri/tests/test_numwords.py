"""Sayıyı yazıya çevirme: elle doğrulanmış örnekler + bağımsız çözücüyle gidiş-dönüş testi."""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from verihavuzu import reference
from verihavuzu.numwords import MAX_NUMBER, amount_to_words, number_to_words


def words_to_number(text: str) -> int:
    """Testin bağımsız çözücüsü: sözcükleri ``tr/sayi_sozcukleri.json`` tablosundan okur."""
    table = {
        row["sozcuk"]: int(row["deger"])
        for row in reference.load("sayi_sozcukleri")
        if row["tur"] == "asıl"
    }
    total = 0
    group = 0
    for word in text.split():
        value = table[word]
        if value < 100:
            group += value
        elif value == 100:
            group = (group or 1) * 100
        else:  # bin, milyon, milyar…
            total += (group or 1) * value
            group = 0
    return total + group


@pytest.mark.parametrize(
    ("number", "expected"),
    [
        (0, "sıfır"),
        (7, "yedi"),
        (10, "on"),
        (11, "on bir"),
        (21, "yirmi bir"),
        (100, "yüz"),
        (101, "yüz bir"),
        (200, "iki yüz"),
        (1000, "bin"),
        (1001, "bin bir"),
        (1100, "bin yüz"),
        (2026, "iki bin yirmi altı"),
        (11000, "on bir bin"),
        (21000, "yirmi bir bin"),
        (100000, "yüz bin"),
        (101000, "yüz bir bin"),
        (841235, "sekiz yüz kırk bir bin iki yüz otuz beş"),
        (1000000, "bir milyon"),
        (1001000, "bir milyon bin"),
        (1234567, "bir milyon iki yüz otuz dört bin beş yüz altmış yedi"),
        (1007475990, "bir milyar yedi milyon dört yüz yetmiş beş bin dokuz yüz doksan"),
        (2000000000005, "iki trilyon beş"),
        (-42, "eksi kırk iki"),
    ],
)
def test_known_numbers(number: int, expected: str) -> None:
    assert number_to_words(number) == expected


def test_joined_form_and_errors() -> None:
    assert number_to_words(1250, joined=True) == "binikiyüzelli"
    with pytest.raises(ValueError, match="çok büyük"):
        number_to_words(MAX_NUMBER + 1)
    with pytest.raises(TypeError):
        number_to_words(True)
    with pytest.raises(TypeError):
        number_to_words(1.5)  # type: ignore[arg-type]


@given(st.integers(min_value=0, max_value=MAX_NUMBER))
@settings(max_examples=1500, deadline=None)
def test_round_trip_through_independent_parser(number: int) -> None:
    assert words_to_number(number_to_words(number)) == number


def test_round_trip_small_numbers_exhaustively() -> None:
    for number in range(20001):
        assert words_to_number(number_to_words(number)) == number


def test_amounts() -> None:
    assert amount_to_words(Decimal("1250.50")) == "bin iki yüz elli lira elli kuruş"
    assert amount_to_words("0.05") == "sıfır lira beş kuruş"
    assert amount_to_words(3) == "üç lira"
    assert amount_to_words("12.345") == "on iki lira otuz beş kuruş"  # yarım yukarı yuvarlanır
    assert amount_to_words("-7.10") == "eksi yedi lira on kuruş"
    assert (
        amount_to_words("19.99", major="dolar", minor="sent") == "on dokuz dolar doksan dokuz sent"
    )
    with pytest.raises(TypeError, match="Decimal"):
        amount_to_words(0.1)  # type: ignore[arg-type]
