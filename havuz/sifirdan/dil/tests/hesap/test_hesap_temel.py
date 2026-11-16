"""Hesap makinesi testleri: öncelik, işlevler, değişkenler, Türkçe biçim, hatalar, güvenlik, CLI.

Farksal (hypothesis): rastgele aritmetik ağacı hem bu motorla hem doğrudan Python float
işlemleriyle hesaplanır; sonuçlar aynı olmalı.
"""

from __future__ import annotations

import math

import pytest
from hypothesis import given
from hypothesis import strategies as st

from hesap import CalcError, Calculator, calculate, format_number
from hesap.__main__ import interactive, main


def show(expr: str, turkish: bool = False) -> str:
    calc = Calculator(turkish)
    return calc.format(calc.calculate(expr))


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ("2 + 3 * 4", "14"),
        ("(2 + 3) * 4", "20"),
        ("10 - 4 - 3", "3"),
        ("2 ^ 3 ^ 2", "512"),
        ("-2 ^ 2", "-4"),
        ("2 ^ -1", "0.5"),
        ("-(-3)", "3"),
        ("+5", "5"),
        ("3! + 0!", "7"),
        ("(1 + 2)!", "6"),
        ("7 % 3", "1"),
        ("10 / 4", "2.5"),
        ("0.1 + 0.2", "0.3"),
        ("1e3 + 1_000", "2000"),
        ("2 * pi", "6.28318530718"),
        ("karekök(16) + kök(27, 3)", "7"),
        ("kök(-8, 3)", "-2"),
        ("max(1, 9, 3) - min(4, 2)", "7"),
        ("yuvarla(2.5) + yuvarla(3.5) + yuvarla(-2.5)", "4"),
        ("yuvarla(2.675, 2)", "2.68"),
        ("taban(-2.5) + tavan(2.1)", "0"),
        ("log(1000) + ln(e)", "4"),
        ("mutlak(-7.5)", "7.5"),
        ("1e20", "1e+20"),
    ],
)
def test_expressions(expr: str, expected: str) -> None:
    assert show(expr) == expected


@pytest.mark.parametrize(
    ("expr", "expected"),
    [
        ("1.234,5 * 2", "2.469"),
        ("0,1 + 0,2", "0,3"),
        ("max(1,5; 2,25)", "2,25"),
        ("12.345.678 / 1000", "12.345,678"),
        ("-1.000.000,5", "-1.000.000,5"),
        ("2,5 km kaç m", "2.500 m"),
    ],
)
def test_turkish_number_format(expr: str, expected: str) -> None:
    assert show(expr, turkish=True) == expected


def test_variables_and_last_result() -> None:
    calc = Calculator()
    calc.calculate("fiyat = 120")
    calc.calculate("adet = 3")
    assert calc.calculate("fiyat * adet").value == 360
    assert calc.calculate("son / 2").value == 180


@pytest.mark.parametrize(
    ("expr", "col", "message", "hint"),
    [
        ("2 +", 4, "ifade yarım kaldı", "değer"),
        ("2 3", 3, "işleç eksik", "2 * 3"),
        ("2(3)", 2, "'(' öncesinde işleç eksik", "2*(3+4)"),
        ("((1)", 1, "parantez kapanmadı", "')'"),
        ("1)", 2, "eşi olmayan ')'", None),
        ("* 2", 1, "değer bekleniyordu", None),
        ("1,5", 2, "ayraç yalnız işlev", "nokta"),
        ("x + 1", 1, "'x' tanımlı değil", "x = 5"),
        ("foo(1)", 1, "bilinmeyen işlev", "İşlevler:"),
        ("max()", 1, "en az 1 bağımsız değişken", None),
        ("kök(8)", 1, "2 bağımsız değişken", None),
        ("10 / 0", 4, "sıfıra bölme", None),
        ("5 % 0", 3, "kalan alınamaz", None),
        ("karekök(-1)", 1, "tanım aralığı dışında", None),
        ("171!", 4, "faktöriyel çok büyük", None),
        ("2.5!", 4, "negatif olmayan tam sayılar", None),
        ("(-8) ^ 0.5", 6, "gerçel değil", None),
        ("10 ^ 400", 4, "çok büyük", None),
        ("1e308 * 10", 7, "sonlu bir sayı değil", None),
        ("pi = 3", 1, "ayrılmış bir ad", None),
        ("1 = 2", 3, "atama yalnız başta", None),
        ("2 × 3", 3, "beklenmeyen karakter", "*"),
        ("", 1, "boş ifade", None),
    ],
)
def test_errors_have_column_and_hint(expr: str, col: int, message: str, hint: str | None) -> None:
    with pytest.raises(CalcError) as info:
        calculate(expr)
    err = info.value
    assert err.pos + 1 == col, str(err)
    assert message in err.message
    if hint is not None:
        assert err.hint is not None and hint in err.hint


def test_turkish_mode_rejects_ambiguous_dot() -> None:
    with pytest.raises(CalcError, match="binlik") as info:
        calculate("1.5", turkish=True)
    assert info.value.hint is not None and "1,5" in info.value.hint


def test_no_python_code_execution() -> None:
    for attack in ["__import__('os').system('echo x')", "open('/etc/passwd')", "().__class__"]:
        with pytest.raises(CalcError):
            calculate(attack)


def test_limits() -> None:
    with pytest.raises(CalcError, match="çok uzun"):
        calculate("1+" * 1500 + "1")
    assert calculate("(" * 600 + "1" + ")" * 600).value == 1  # özyineleme yok: yığın taşmaz


def test_render_shows_caret() -> None:
    with pytest.raises(CalcError) as info:
        calculate("2 + * 3")
    assert info.value.render("2 + * 3").splitlines()[2] == "      ^"


def test_format_number() -> None:
    assert format_number(1234567.0, turkish=True) == "1.234.567"
    assert format_number(-0.5, turkish=True) == "-0,5"
    assert format_number(1 / 3) == "0.333333333333"
    assert format_number(2.5e-7, turkish=True) == "2,5e-07"


@st.composite
def arithmetic(draw: st.DrawFn, depth: int = 0) -> tuple[str, float]:
    """(ifade metni, Python'un hesapladığı değer) üretir; sıfıra bölme dışarıda bırakılır."""
    if depth > 3 or draw(st.booleans()):
        value = draw(st.integers(min_value=0, max_value=50)) / draw(st.sampled_from([1, 2, 4, 10]))
        return format_number(value), value
    kind = draw(st.sampled_from(["+", "-", "*", "/", "neg", "()"]))
    left_text, left = draw(arithmetic(depth + 1))
    if kind == "neg":
        return f"-({left_text})", -left
    if kind == "()":
        return f"({left_text})", left
    right_text, right = draw(arithmetic(depth + 1))
    if kind == "/" and right == 0:
        right_text, right = "1", 1.0
    value = {"+": left + right, "-": left - right, "*": left * right, "/": left / (right or 1)}[
        kind
    ]
    return f"({left_text} {kind} {right_text})", value


@given(arithmetic())
def test_random_arithmetic_matches_python(case: tuple[str, float]) -> None:
    text, expected = case
    assert math.isclose(calculate(text).value, expected, rel_tol=1e-12, abs_tol=1e-12)


def test_cli_and_interactive(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["2 + 2"]) == 0
    assert main(["--tr", "1.000,5 * 2"]) == 0
    assert main(["2 +"]) == 1
    lines = iter(["x = 5 km", "x kaç m", "bozuk +", ":çık"])
    out: list[str] = []
    assert interactive(Calculator(), lambda prompt: next(lines), out.append) == 0
    captured = capsys.readouterr()
    assert captured.out == "4\n2.001\n"
    assert "ifade yarım kaldı" in captured.err
    assert "5000 m\n" in out and any("Hesap hatası" in o for o in out)
