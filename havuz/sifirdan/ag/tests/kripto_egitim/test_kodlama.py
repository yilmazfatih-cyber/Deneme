"""Base64/Base32: RFC 4648 §10 vektörleri, `base64` ile farksal test, sıkı (kanonik) çözme."""

from __future__ import annotations

import base64
import contextlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from kripto_egitim.encoding import (
    DecodeError,
    b32decode,
    b32encode,
    b64decode,
    b64encode,
    b64url_decode,
    b64url_encode,
    normalize_base32_secret,
)

RFC4648 = [
    (b"", "", ""),
    (b"f", "Zg==", "MY======"),
    (b"fo", "Zm8=", "MZXQ===="),
    (b"foo", "Zm9v", "MZXW6==="),
    (b"foob", "Zm9vYg==", "MZXW6YQ="),
    (b"fooba", "Zm9vYmE=", "MZXW6YTB"),
    (b"foobar", "Zm9vYmFy", "MZXW6YTBOI======"),
]


@pytest.mark.parametrize(("raw", "b64", "b32"), RFC4648)
def test_rfc4648_vektorleri(raw: bytes, b64: str, b32: str) -> None:
    assert b64encode(raw) == b64
    assert b64decode(b64) == raw
    assert b32encode(raw) == b32
    assert b32decode(b32) == raw


@given(st.binary(max_size=100))
def test_stdlib_ile_ayni_ve_gidis_donus(data: bytes) -> None:
    assert b64encode(data) == base64.b64encode(data).decode()
    assert b64encode(data, urlsafe=True) == base64.urlsafe_b64encode(data).decode()
    assert b32encode(data) == base64.b32encode(data).decode()
    assert b64decode(b64encode(data)) == data
    assert b32decode(b32encode(data)) == data
    assert b64url_decode(b64url_encode(data)) == data


@pytest.mark.parametrize(
    "bad",
    [
        "QR==",  # artık bitler sıfır değil (stdlib bunu "Q" olarak kabul eder)
        "Zm9=",
        "Zg=",  # eksik dolgu
        "Zg===",  # fazla dolgu
        "Z===",  # tek karakter bayt taşıyamaz
        "Zm 9v",
        "Zm9v\n",
        "Zg==Zg==",  # ortada dolgu
        "Zm-v",  # URL alfabesi standart çözücüde yok
    ],
)
def test_kanonik_olmayan_ya_da_bozuk_base64_reddedilir(bad: str) -> None:
    with pytest.raises(DecodeError):
        b64decode(bad)


def test_dolgusuz_url_bicimi_dolgu_kabul_etmez() -> None:
    assert b64url_decode("Zm8") == b"fo"
    with pytest.raises(DecodeError):
        b64url_decode("Zm8=")


@pytest.mark.parametrize("bad", ["MY=====", "M=======", "MZXW6YQ1", "my======", "MZ======"])
def test_bozuk_base32_reddedilir(bad: str) -> None:
    with pytest.raises(DecodeError):
        b32decode(bad)


def test_kullanici_anahtari_normallestirilir() -> None:
    assert normalize_base32_secret("mzxw 6ytb-oi") == b"foobar"
    with pytest.raises(DecodeError):
        normalize_base32_secret("ışık")


@given(st.text(max_size=30))
def test_rastgele_metin_cokertmez(text: str) -> None:
    for decoder in (b64decode, b32decode, b64url_decode):
        with contextlib.suppress(DecodeError):
            decoder(text)
