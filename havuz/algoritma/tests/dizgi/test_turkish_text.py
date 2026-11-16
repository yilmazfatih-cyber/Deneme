from __future__ import annotations

import unicodedata

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.turkish_text import (
    capitalize_tr,
    casefold_tr,
    equals_ignore_case_tr,
    lower_tr,
    normalize_nfc,
    sort_key_tr,
    title_tr,
    upper_tr,
    utf8_length,
)

TURKISH = "abcçdefgğhıijklmnoöprsştuüvyzABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ "


def test_hand_checked_example() -> None:
    assert upper_tr("ılık ilik") == "ILIK İLİK"
    assert lower_tr("ILIK İLİK") == "ılık ilik"
    assert "İ".lower() != "i"  # Python'un kendi davranışı: "i" + U+0307 (2 kod noktası)
    assert title_tr("istanbul ılıca yolu") == "İstanbul Ilıca Yolu"
    assert equals_ignore_case_tr("İSTANBUL", "istanbul")
    assert not equals_ignore_case_tr("ISPARTA", "isparta")  # I → ı: "ısparta" ≠ "isparta"
    words = ["şeker", "Sabun", "çorba", "Zil", "ıhlamur", "İnci", "üzüm", "ufuk", "öğle", "Ova"]
    assert sorted(words, key=sort_key_tr) == [
        "çorba", "ıhlamur", "İnci", "Ova", "öğle", "Sabun", "şeker", "ufuk", "üzüm", "Zil",
    ]  # fmt: skip
    assert sorted(["kâr", "kar", "kas"], key=sort_key_tr) == ["kar", "kâr", "kas"]


def test_edge_cases() -> None:
    assert upper_tr("") == lower_tr("") == capitalize_tr("") == ""
    assert utf8_length("ğ") == 2 and utf8_length("a") == 1 and utf8_length("😀") == 4
    decomposed = "g\u0306"  # "g" + birleşen breve
    assert decomposed != "ğ" and normalize_nfc(decomposed) == "ğ"
    assert casefold_tr("STRASSE") == casefold_tr("straße")  # casefold almanca ß'yi de açar
    assert sorted(["b2", "b10", "b 1"], key=sort_key_tr) == ["b 1", "b10", "b2"]  # sayılar metin


@given(st.text(alphabet=TURKISH, max_size=20))
def test_round_trip_and_lengths(text: str) -> None:
    assert lower_tr(upper_tr(text)) == lower_tr(text)
    assert upper_tr(lower_tr(text)) == upper_tr(text)
    assert len(upper_tr(text)) == len(text) == len(lower_tr(text))  # harf sayısı korunur
    assert equals_ignore_case_tr(upper_tr(text), lower_tr(text))
    assert utf8_length(text) == len(text.encode())


@given(st.lists(st.text(alphabet="abcçgğıioöşuü", max_size=4), max_size=12))
def test_sort_matches_alphabet_positions(words: list[str]) -> None:
    alphabet = "abcçdefgğhıijklmnoöprsştuüvyz"
    expected = sorted(words, key=lambda w: ([alphabet.index(c) for c in w], w))
    assert sorted(words, key=sort_key_tr) == expected
    assert all(unicodedata.is_normalized("NFC", normalize_nfc(w)) for w in words)
