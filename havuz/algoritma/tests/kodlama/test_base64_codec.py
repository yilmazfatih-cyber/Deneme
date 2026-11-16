from __future__ import annotations

import base64
import binascii

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.base64_codec import b64decode, b64encode

RFC_VECTORS = [  # RFC 4648 §10 test vektörleri
    (b"", ""), (b"f", "Zg=="), (b"fo", "Zm8="), (b"foo", "Zm9v"),
    (b"foob", "Zm9vYg=="), (b"fooba", "Zm9vYmE="), (b"foobar", "Zm9vYmFy"),
]  # fmt: skip


@pytest.mark.parametrize(("raw", "encoded"), RFC_VECTORS)
def test_rfc_vectors(raw: bytes, encoded: str) -> None:
    assert b64encode(raw) == encoded and b64decode(encoded) == raw


def test_edge_cases() -> None:
    for bad in ("Zg=", "Z===", "Zg==Zg==", "Zm9v!", "Zh=="):  # son: dolgu bitleri sıfır değil
        with pytest.raises(ValueError):
            b64decode(bad)
    assert b64encode(b"\xfb\xff", url_safe=True) == "-_8=" and b64decode("-_8=", url_safe=True)
    with pytest.raises(ValueError):
        b64decode("-_8=")  # standart alfabede '-' ve '_' yok


@given(st.binary(max_size=200))
def test_matches_stdlib(data: bytes) -> None:
    assert b64encode(data) == base64.b64encode(data).decode()
    assert b64encode(data, url_safe=True) == base64.urlsafe_b64encode(data).decode()
    assert b64decode(b64encode(data)) == data


@given(st.text(alphabet="ABCDEFabcdef0123456789+/=", max_size=16))
def test_rejects_exactly_what_stdlib_strict_rejects(text: str) -> None:
    try:
        expected: bytes | None = base64.b64decode(text, validate=True)
    except binascii.Error:
        expected = None
    try:
        ours: bytes | None = b64decode(text)
    except ValueError:
        ours = None
    if expected is not None and ours is None:
        # stdlib dolgu bitleri sıfır olmayan girdiyi kabul eder; biz kanonik olmayanı reddederiz
        assert b64encode(expected) != text
    else:
        assert ours == expected
