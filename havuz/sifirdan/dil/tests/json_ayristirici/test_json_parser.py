"""JSON ayrıştırıcı örnek testleri: RFC 8259 kuralları, hata konumları ve ipuçları, sınırlar."""

from __future__ import annotations

import pytest

from json_ayristirici import JsonError, Options, loads, loads_bytes


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("0", 0),
        ("-0", 0),
        ("-0.0", -0.0),
        ("1.5e3", 1500.0),
        ("1E-2", 0.01),
        ("123456789012345678901234567890", 123456789012345678901234567890),
        ('"\\u00e7\\u011f"', "çğ"),
        ('"\\ud83d\\ude00"', "😀"),
        ('"\\"\\\\\\/\\b\\f\\n\\r\\t"', '"\\/\b\f\n\r\t'),
        (" \t\n\r[ ] ", []),
        ('{"a": {"b": [true, false, null]}}', {"a": {"b": [True, False, None]}}),
        ('{"a": 1, "a": 2}', {"a": 2}),
        ('"tek satır ✓ 😀"', "tek satır ✓ 😀"),
    ],
)
def test_valid_documents(text: str, expected: object) -> None:
    result = loads(text)
    assert result == expected
    assert repr(result) == repr(expected)  # 1 ile 1.0, 0.0 ile -0.0 ayrımı


@pytest.mark.parametrize(
    ("text", "line", "col", "message", "hint"),
    [
        ("[1, 2,]", 1, 7, "sondaki virgül", "virgülü silin"),
        ('{"a": 1,\n}', 2, 1, "sondaki virgül", None),
        ("{'a': 1}", 1, 2, "nesne anahtarı", "çift tırnak"),
        ("{ad: 1}", 1, 2, "nesne anahtarı", "çift tırnağa alın"),
        ('{"a" 1}', 1, 6, "':' bekleniyordu", None),
        ("[1 2]", 1, 4, "',' ya da ']' bekleniyordu", "virgül koyun"),
        ("NaN", 1, 1, "değer bekleniyordu", "NaN"),
        ("[Infinity]", 1, 2, "değer bekleniyordu", "Infinity"),
        ("True", 1, 1, "değer bekleniyordu", "küçük harfle"),
        ("// yorum\n1", 1, 1, "değer bekleniyordu", "yorum"),
        ("[+1]", 1, 2, "değer bekleniyordu", "Sayı +"),
        ("[.5]", 1, 2, "değer bekleniyordu", "0.5"),
        ("007", 1, 1, "0 ile başlayıp sürüyor", "sıfırları silin"),
        ("1.", 1, 3, "ondalık noktadan sonra rakam", None),
        ("-x", 1, 2, "eksi işaretinden sonra rakam", None),
        ("1e", 1, 3, "üsten sonra rakam", None),
        ('"abc', 1, 1, "dizgi kapanmadı", None),
        ('"a\tb"', 1, 3, "kaçışsız denetim karakteri (U+0009)", "\\t"),
        ('"\\x41"', 1, 2, "geçersiz kaçış", None),
        ('"\\u00g1"', 1, 2, "geçersiz \\u kaçışı", None),
        ('"\\ud800"', 1, 2, "eşi olmayan vekil", None),
        ('{"a": [1,\n  {"b": 2}', 2, 11, "dizi kapanmadı", "satır 1, sütun 7"),
        ("", 1, 1, "değer bekleniyordu, metin bitti", "Boş metin"),
        ("[1] [2]", 1, 5, "fazladan veri", "dizi"),
        ("﻿{}", 1, 1, "BOM", None),
        ("1e999", 1, 1, "ondalık aralığın dışında", None),
    ],
)
def test_errors_point_to_line_and_column(
    text: str, line: int, col: int, message: str, hint: str | None
) -> None:
    with pytest.raises(JsonError) as info:
        loads(text)
    err = info.value
    assert (err.line, err.col) == (line, col)
    assert message in err.message
    if hint is not None:
        assert err.hint is not None and hint in err.hint


def test_error_render_has_caret() -> None:
    text = '{\n  "a": [1, 2,]\n}'
    with pytest.raises(JsonError) as info:
        loads(text)
    rendered = info.value.render(text)
    assert "satır 2, sütun 14" in rendered
    assert rendered.splitlines()[2] == "     | " + " " * 13 + "^"


def test_depth_limit_stops_deep_nesting_without_crash() -> None:
    assert loads("[" * 400 + "]" * 400) is not None
    with pytest.raises(JsonError, match="çok derin"):
        loads("[" * 401 + "]" * 401)
    with pytest.raises(JsonError, match="çok derin"):
        loads("[" * 200_000)
    with pytest.raises(JsonError, match="çok derin"):
        loads('{"a":' * 20 + "1" + "}" * 20, Options(max_depth=10))


def test_number_length_limit() -> None:
    assert loads("9" * 1000) == int("9" * 1000)
    with pytest.raises(JsonError, match="sayı çok uzun"):
        loads("9" * 1001)


def test_options_lone_surrogates_and_duplicates() -> None:
    assert loads('"\\ud800x"', Options(allow_lone_surrogates=True)) == "\ud800x"
    with pytest.raises(JsonError, match="iki kez"):
        loads('{"a": 1, "a": 2}', Options(reject_duplicate_keys=True))


def test_bytes_input() -> None:
    assert loads_bytes(b'\xef\xbb\xbf{"\xc3\xa7": 1}') == {"ç": 1}
    with pytest.raises(JsonError, match="geçersiz UTF-8"):
        loads_bytes(b'["\xff"]')
