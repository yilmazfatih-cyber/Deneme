"""Sözcük çözümleyici testleri: belirteç türleri, Türkçe/ASCII anahtar sözcükler, NFC, hatalar."""

from __future__ import annotations

import pytest

from yorumlayici.errors import TohumError
from yorumlayici.lexer import tokenize
from yorumlayici.tokens import TokenType as T


def types(source: str) -> list[T]:
    return [t.type for t in tokenize(source)]


def test_simple_statement_tokens() -> None:
    assert types("değişken x = 1 + 2.5") == [
        T.VAR,
        T.IDENT,
        T.ASSIGN,
        T.NUMBER,
        T.PLUS,
        T.NUMBER,
        T.EOF,
    ]


@pytest.mark.parametrize(
    ("turkish", "ascii_form"),
    [("eğer", "eger"), ("değilse", "degilse"), ("için", "icin"), ("işlev", "islev"),
     ("döndür", "dondur"), ("doğru", "dogru"), ("yanlış", "yanlis"), ("kır", "kir")],
)  # fmt: skip
def test_ascii_aliases_map_to_same_keyword(turkish: str, ascii_form: str) -> None:
    assert types(turkish) == types(ascii_form)
    assert types(turkish)[0] is not T.IDENT


def test_source_is_nfc_normalized() -> None:
    decomposed = "değişken x = 1"  # ğ ve ş birleşik işaretle yazılmış
    assert types(decomposed)[0] is T.VAR


def test_numbers_and_values() -> None:
    toks = tokenize("1_000 3.14 2e3 7")
    assert [t.value for t in toks[:-1]] == [1000, 3.14, 2000.0, 7]
    assert isinstance(toks[0].value, int) and isinstance(toks[2].value, float)


def test_string_escapes() -> None:
    tok = tokenize(r'"a\n\t\"\\ \u{1F600} ğ"')[0]
    assert tok.value == 'a\n\t"\\ \U0001f600 ğ'


def test_newlines_inside_parentheses_are_ignored() -> None:
    assert T.NEWLINE not in types("f(1,\n 2)")
    assert T.NEWLINE in types("a\nb")


def test_positions_are_one_based() -> None:
    toks = tokenize("x\n  yz")
    assert (toks[2].pos.line, toks[2].pos.col) == (2, 3)


@pytest.mark.parametrize(
    ("source", "message", "hint"),
    [
        ('"açık', "dizgi kapanmadı", "kapatın"),
        (r'"\q"', "bilinmeyen kaçış", "Geçerli kaçışlar"),
        ("a ! b", "beklenmeyen karakter '!'", "değil"),
        ("a && b", "beklenmeyen karakter '&'", "ve"),
        ("'tek'", "beklenmeyen karakter", "çift tırnak"),
        ("12abc", "sayıdan hemen sonra harf", "rakamla başlayamaz"),
        ("1.", "ondalık noktadan sonra", "3.0"),
        (r'"\u{110000}"', "geçersiz Unicode", None),
    ],
)
def test_lexer_errors_guide_the_user(source: str, message: str, hint: str | None) -> None:
    with pytest.raises(TohumError) as info:
        tokenize(source)
    assert message in info.value.message
    if hint is not None:
        assert info.value.hint is not None and hint in info.value.hint


def test_unterminated_string_at_eof_is_flagged_for_repl() -> None:
    with pytest.raises(TohumError) as info:
        tokenize('yazdır("merhaba')
    assert info.value.at_eof


def test_huge_number_literal_is_rejected() -> None:
    with pytest.raises(TohumError, match="sayı çok uzun"):
        tokenize("1" * 5000)
