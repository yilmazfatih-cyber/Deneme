"""Ayrıştırıcı testleri: öncelik (S-ifadesi dökümüyle), deyimler, yol gösteren hatalar."""

from __future__ import annotations

import pytest

from yorumlayici import dump, parse
from yorumlayici.errors import TohumError


def tree(source: str) -> str:
    return " ".join(dump(stmt) for stmt in parse(source).body)


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("1 + 2 * 3", "(+ 1 (* 2 3))"),
        ("(1 + 2) * 3", "(* (+ 1 2) 3)"),
        ("1 - 2 - 3", "(- (- 1 2) 3)"),
        ("2 ** 3 ** 2", "(** 2 (** 3 2))"),
        ("-2 ** 2", "(- (** 2 2))"),
        ("2 ** -1", "(** 2 (- 1))"),
        ("değil a == b", "(değil (== a b))"),
        ("a veya b ve c", "(veya a (ve b c))"),
        ("a < b == doğru", "(== (< a b) doğru)"),
        ("f(1)(2)[0]", "(dizin (çağır (çağır f 1) 2) 0)"),
        ('{"a": [1, 2,], "b": yok}', "(sözlük ('a' (liste 1 2)) ('b' yok))"),
        ("işlev(x) { döndür x }(5)", "(çağır (işlev <adsız> (x) (blok (döndür x))) 5)"),
    ],
)
def test_expression_precedence(source: str, expected: str) -> None:
    assert tree(source) == expected


def test_statements_and_compound_assignment() -> None:
    src = "değişken x = 1\nx += 2; l[0] -= 1\nişlev f(a, b) { döndür a }"
    assert tree(src) == (
        "(değişken x 1) (+= x 2) (-= (dizin l 0) 1) (işlev f (a b) (blok (döndür a)))"
    )


def test_else_if_chain_and_else_on_next_line() -> None:
    src = "eğer a { 1 }\ndeğilse eğer b { 2 }\ndeğilse { 3 }"
    assert tree(src) == "(eğer a (blok 1) (blok (eğer b (blok 2) (blok 3))))"


def test_statement_after_block_needs_no_separator() -> None:
    assert tree("eğer a { b } c") == "(eğer a (blok b)) c"


def test_multiline_literals_and_operator_continuation() -> None:
    src = 'değişken d = {\n  "a": 1,\n  "b": 2,\n}\ndeğişken t = 1 +\n  2'
    assert tree(src) == "(değişken d (sözlük ('a' 1) ('b' 2))) (değişken t (+ 1 2))"


@pytest.mark.parametrize(
    ("source", "message", "hint"),
    [
        ("a < b < c", "zincirlenemez", "a < b ve b < c"),
        ("x = 1 y = 2", "deyim burada bitmeliydi", "yeni satırla"),
        ("f() = 1", "atama yapılamaz", "=="),
        ("eğer x:\n  yazdır(1)", "bloğun başında '{' bekleniyordu", "{ … }"),
        ("eğer (1 < 2 { }", "')' bekleniyordu", "açılmıştı"),
        ("yazdır(1 +)", "ifade bekleniyordu", "Fazladan"),
        ("x = değişken", "ifade bekleniyordu", "deyimdir"),
        ("eğer x = 1 { }", "'=' kullanılamaz", "=="),
        ("}", "fazladan '}'", None),
        ("değilse { }", "'değilse' bir 'eğer'", None),
        ("işlev f(a, a) { }", "iki kez", None),
        ("değişken 5 = 1", "'ad' bekleniyordu", "değişken x = 1"),
    ],
)
def test_syntax_errors_are_helpful(source: str, message: str, hint: str | None) -> None:
    with pytest.raises(TohumError) as info:
        parse(source)
    assert message in info.value.message
    if hint is not None:
        assert info.value.hint is not None and hint in info.value.hint


def test_unclosed_block_points_to_opening_brace() -> None:
    with pytest.raises(TohumError) as info:
        parse("işlev f() {\n  yazdır(1)\n")
    assert info.value.at_eof
    assert info.value.hint is not None and "1:11" in info.value.hint


def test_error_rendering_shows_caret_under_column() -> None:
    src = "değişken x = 1\nyazdır(x +* 2)"
    with pytest.raises(TohumError) as info:
        parse(src)
    rendered = info.value.render(src)
    assert "Sözdizimi hatası (satır 2, sütun 11)" in rendered
    assert rendered.splitlines()[2].endswith(" " * 10 + "^")


def test_nesting_limit_stops_malicious_input() -> None:
    with pytest.raises(TohumError, match="çok derin"):
        parse("(" * 500 + "1" + ")" * 500)
    with pytest.raises(TohumError, match="çok derin"):
        parse("eğer a { " * 200 + "}" * 200)
