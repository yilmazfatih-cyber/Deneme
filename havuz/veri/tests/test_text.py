"""Türkçe metin yardımcıları: i/İ ve ı/I dönüşümleri, sıralama, eşleştirme anahtarı."""

from __future__ import annotations

from verihavuzu.text import (
    capitalize_tr,
    fold_ascii,
    lower_tr,
    match_key,
    slug_tr,
    sort_key_tr,
    squeeze_spaces,
    title_tr,
    upper_tr,
)


def test_upper_and_lower_use_turkish_rules() -> None:
    assert upper_tr("istanbul") == "İSTANBUL"
    assert upper_tr("ışık") == "IŞIK"
    assert lower_tr("İSTANBUL") == "istanbul"
    assert lower_tr("IŞIK") == "ışık"
    # Python'ın kendi işlevi "İ" için birleşik nokta üretir; bizimki üretmez.
    assert len(lower_tr("İ")) == 1


def test_round_trip_for_alphabet() -> None:
    lower = "abcçdefgğhıijklmnoöprsştuüvyz"
    upper = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ"
    assert upper_tr(lower) == upper
    assert lower_tr(upper) == lower


def test_title_and_capitalize() -> None:
    assert capitalize_tr("iSTANBUL") == "İstanbul"
    assert title_tr("ıĞDIR merkez") == "Iğdır Merkez"
    assert title_tr("fevzi çakmak-ilkyerleşim") == "Fevzi Çakmak-İlkyerleşim"
    assert capitalize_tr("") == ""


def test_fold_slug_and_match_key() -> None:
    assert fold_ascii("Şırnak Çığ Öğün") == "Sirnak Cig Ogun"
    assert slug_tr("  Şanlıurfa / Merkez ") == "sanliurfa-merkez"
    assert match_key("Yıldız Tic. A.Ş.") == match_key("YILDIZ TİC AŞ")
    assert squeeze_spaces("  a \t b\n c ") == "a b c"


def test_sort_follows_turkish_alphabet() -> None:
    words = ["zeytin", "çay", "cam", "ılık", "iz", "şeker", "su", "ördek", "oda", "ğ", "g"]
    expected = ["cam", "çay", "g", "ğ", "ılık", "iz", "oda", "ördek", "su", "şeker", "zeytin"]
    assert sorted(words, key=sort_key_tr) == expected
    assert sorted(["İzmir", "Iğdır", "Hatay"], key=sort_key_tr) == ["Hatay", "Iğdır", "İzmir"]
