"""SHA-256/SHA-1, HMAC, PBKDF2, HKDF: hashlib/hmac ile farksal test + RFC/FIPS sınama vektörleri."""

from __future__ import annotations

import hashlib
import hmac

import pytest
from hypothesis import given
from hypothesis import strategies as st

from kripto_egitim.kdf import hkdf, hkdf_expand, hkdf_extract, pbkdf2_hmac
from kripto_egitim.mac import Hmac, constant_time_equal, hmac_digest
from kripto_egitim.sha import sha1, sha256


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (b"", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"),
        (b"abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"),
        (
            b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
        ),
    ],
)
def test_sha256_fips_vektorleri(data: bytes, expected: str) -> None:
    assert sha256(data).hexdigest() == expected


def test_sha1_fips_vektoru() -> None:
    assert sha1(b"abc").hexdigest() == "a9993e364706816aba3e25717850c26c9cd0d89d"


@pytest.mark.parametrize("length", [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000])
def test_dolgu_sinirlari_hashlib_ile_ayni(length: int) -> None:
    data = bytes(i % 251 for i in range(length))
    assert sha256(data).digest() == hashlib.sha256(data).digest()
    assert sha1(data).digest() == hashlib.sha1(data).digest()


@given(st.lists(st.binary(max_size=150), max_size=5))
def test_parcali_update_hashlib_ile_ayni(chunks: list[bytes]) -> None:
    ours, reference = sha256(), hashlib.sha256()
    for chunk in chunks:
        ours.update(chunk)
        reference.update(chunk)
        assert ours.digest() == reference.digest()  # digest() durumu bozmamalı


def test_copy_bagimsiz_durum() -> None:
    base = sha256(b"ortak-onek")
    left, right = base.copy(), base.copy()
    left.update(b"sol")
    right.update(b"sag")
    assert left.digest() == hashlib.sha256(b"ortak-oneksol").digest()
    assert right.digest() == hashlib.sha256(b"ortak-oneksag").digest()


def test_hmac_rfc4231_vaka2() -> None:
    expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    assert hmac_digest(b"Jefe", b"what do ya want for nothing?").hex() == expected


@given(st.binary(max_size=200), st.binary(max_size=200))
def test_hmac_stdlib_ile_ayni(key: bytes, msg: bytes) -> None:
    assert hmac_digest(key, msg) == hmac.digest(key, msg, "sha256")
    assert hmac_digest(key, msg, sha1) == hmac.digest(key, msg, "sha1")
    assert hmac_digest(key, msg, hashlib.sha512) == hmac.digest(key, msg, "sha512")


def test_hmac_artimli_ve_kopya() -> None:
    mac = Hmac(b"anahtar")
    mac.update(b"ilk ")
    clone = mac.copy()
    mac.update(b"ikinci")
    assert mac.digest() == hmac.digest(b"anahtar", b"ilk ikinci", "sha256")
    assert clone.digest() == hmac.digest(b"anahtar", b"ilk ", "sha256")


def test_sabit_zamanli_karsilastirma() -> None:
    assert constant_time_equal(b"abc", b"abc")
    assert not constant_time_equal(b"abc", b"abd")
    assert not constant_time_equal(b"abc", b"abcd")
    assert constant_time_equal(b"", b"")


@pytest.mark.parametrize(
    ("iterations", "expected"),
    [
        (1, "0c60c80f961f0e71f3a9b524af6012062fe037a6"),
        (2, "ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957"),
        (4096, "4b007901b765489abead49d926f721d065a429c1"),
    ],
)
def test_pbkdf2_sha1_rfc6070(iterations: int, expected: str) -> None:
    assert pbkdf2_hmac(b"password", b"salt", iterations, 20, sha1).hex() == expected


def test_pbkdf2_sha256_rfc7914() -> None:
    expected = (
        "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc"
        "49ca9cccf179b645991664b39d77ef317c71b845b1e30bd509112041d3a19783"
    )
    assert pbkdf2_hmac(b"passwd", b"salt", 1, 64).hex() == expected


@given(st.binary(max_size=40), st.binary(max_size=24), st.integers(1, 5), st.integers(1, 70))
def test_pbkdf2_hashlib_ile_ayni(password: bytes, salt: bytes, rounds: int, dklen: int) -> None:
    ours = pbkdf2_hmac(password, salt, rounds, dklen)
    assert ours == hashlib.pbkdf2_hmac("sha256", password, salt, rounds, dklen)


def test_pbkdf2_hatali_parametre() -> None:
    with pytest.raises(ValueError, match="Yineleme"):
        pbkdf2_hmac(b"p", b"s", 0)


def test_hkdf_rfc5869_vaka1() -> None:
    ikm = bytes([0x0B] * 22)
    salt = bytes(range(13))
    info = bytes(range(0xF0, 0xFA))
    prk = hkdf_extract(salt, ikm)
    assert prk.hex() == "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5"
    okm = hkdf_expand(prk, info, 42)
    assert okm.hex() == (
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
    )


def test_hkdf_rfc5869_vaka3_tuzsuz() -> None:
    okm = hkdf(bytes([0x0B] * 22), None, b"", 42)
    assert okm.hex() == (
        "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8"
    )


@given(st.binary(min_size=1, max_size=64), st.binary(max_size=32), st.integers(1, 200))
def test_hkdf_stdlib_hmac_ile_bagimsiz_gerceklemeyle_ayni(ikm: bytes, info: bytes, n: int) -> None:
    salt = b"tuz"
    prk = hmac.digest(salt, ikm, "sha256")
    t, okm, counter = b"", b"", 1
    while len(okm) < n:
        t = hmac.digest(prk, t + info + bytes([counter]), "sha256")
        okm += t
        counter += 1
    assert hkdf(ikm, salt, info, n) == okm[:n]


def test_hkdf_uzunluk_siniri() -> None:
    with pytest.raises(ValueError, match="en fazla"):
        hkdf_expand(b"x" * 32, b"", 255 * 32 + 1)
