"""Yerleşik işlevlerin testleri (her birinin olağan kullanımı ve hata iletisi)."""

from __future__ import annotations

import pytest

from yorumlayici import TohumError, run
from yorumlayici.natives import TABLE, make_builtins


def show(expr: str) -> str:
    return run(f"yazdır({expr})").rstrip("\n")


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ('uzunluk("çğü")', "3"),
        ('uzunluk({"a": 1})', "1"),
        ("metin(1.5) + metin([1])", "1.5[1]"),
        ('sayı("42") + sayı(" -2.5 ")', "39.5"),
        ('sayı("1_000")', "1000"),
        ('tür("a") + tür(yok) + tür(doğru)', "dizgiyokmantıksal"),
        ("aralık(3)", "[0, 1, 2]"),
        ("aralik(2, 8, 3)", "[2, 5]"),
        ("aralık(3, 0, -1)", "[3, 2, 1]"),
        ('anahtarlar({"b": 1, "a": 2})', '["b", "a"]'),
        ("içerir([1, 2.0], 2)", "doğru"),
        ('içerir("merhaba", "hab")', "doğru"),
        ('icerir({"a": 1}, "b")', "yanlış"),
        ("mutlak(-3) + taban(2.7) + taban(-2.5)", "2"),
        ("karekök(16)", "4.0"),
        ("sırala([3, 1.5, 2])", "[1.5, 2, 3]"),
        ('sırala(["b", "a"])', '["a", "b"]'),
        ('birleştir(["a", "b", "c"], "-")', "a-b-c"),
        ('parçala("a  b c")', '["a", "b", "c"]'),
        ('parcala("a,b", ",")', '["a", "b"]'),
        ('büyük_harf("iyi ılık")', "İYİ ILIK"),
        ('küçük_harf("İYİ ILIK")', "iyi ılık"),
        ('dolaş({"x": 1})', '["x"]'),
        ('dolaş("ab")', '["a", "b"]'),
    ],
)
def test_builtins(expr: str, expected: str) -> None:
    assert show(expr) == expected


def test_list_mutation_builtins() -> None:
    assert run("değişken l = [1]\nekle(l, 2)\nyazdır(çıkar(l), l)") == "2 [1]\n"


def test_print_without_arguments_prints_empty_line() -> None:
    assert run("yazdır()") == "\n"


@pytest.mark.parametrize(
    ("expr", "message"),
    [
        ("uzunluk(5)", "'uzunluk' dizgi, liste ya da sözlük bekliyor, sayı verildi"),
        ("uzunluk()", "'uzunluk' 1 bağımsız değişken bekliyor, 0 verildi"),
        ("aralık(1, 2, 3, 4)", "'aralık' 1–3 bağımsız değişken bekliyor, 4 verildi"),
        ("aralık(1, 5, 0)", "adımı sıfır olamaz"),
        ("aralık(1.5)", "tamsayı bekliyor"),
        ("çıkar([])", "boş listeden"),
        ('sayı("3,5")', "sayıya çevrilemez"),
        ('sayı("abc")', "sayıya çevrilemez"),
        ("karekök(-1)", "gerçel değil"),
        ('sırala([1, "a"])', "yalnız sayılardan ya da yalnız dizgilerden"),
        ("birleştir([1, 2])", "'birleştir' dizgi bekliyor"),
        ('parçala("a", "")', "ayracı boş olamaz"),
        ("büyük_harf(1)", "dizgi bekliyor"),
    ],
)
def test_builtin_errors(expr: str, message: str) -> None:
    with pytest.raises(TohumError) as info:
        show(expr)
    assert message in info.value.message


def test_comma_decimal_gets_hint() -> None:
    with pytest.raises(TohumError) as info:
        show('sayı("3,5")')
    assert info.value.hint is not None and "nokta" in info.value.hint


def test_every_builtin_has_ascii_alias_without_turkish_letters() -> None:
    table = make_builtins()
    for name, alias, _fn, _lo, _hi in TABLE:
        assert alias.isascii(), alias
        assert table[name] is table[alias]
