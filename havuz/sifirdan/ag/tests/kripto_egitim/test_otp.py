"""HOTP/TOTP: RFC 4226 Ek D ve RFC 6238 Ek B vektörleri, doğrulama penceresi, yeniden oynatma,
otpauth adresi.
"""

from __future__ import annotations

import hashlib
from urllib.parse import parse_qs, unquote, urlsplit

import pytest

from kripto_egitim.encoding import b32decode
from kripto_egitim.otp import generate_secret, hotp, otpauth_uri, totp, verify_totp

KEY_SHA1 = b"12345678901234567890"
KEY_SHA256 = b"12345678901234567890123456789012"
KEY_SHA512 = b"1234567890" * 6 + b"1234"


def test_hotp_rfc4226_ek_d() -> None:
    expected = ["755224", "287082", "359152", "969429", "338314"]
    expected += ["254676", "287922", "162583", "399871", "520489"]
    assert [hotp(KEY_SHA1, counter) for counter in range(10)] == expected


@pytest.mark.parametrize(
    ("at", "sha1_code", "sha256_code", "sha512_code"),
    [
        (59, "94287082", "46119246", "90693936"),
        (1111111109, "07081804", "68084774", "25091201"),
        (1111111111, "14050471", "67062674", "99943326"),
        (1234567890, "89005924", "91819424", "93441116"),
        (2000000000, "69279037", "90698825", "38618901"),
        (20000000000, "65353130", "77737706", "47863826"),
    ],
)
def test_totp_rfc6238_ek_b(at: int, sha1_code: str, sha256_code: str, sha512_code: str) -> None:
    assert totp(KEY_SHA1, at, digits=8) == sha1_code
    assert totp(KEY_SHA256, at, digits=8, digestmod=hashlib.sha256) == sha256_code
    assert totp(KEY_SHA512, at, digits=8, digestmod=hashlib.sha512) == sha512_code


def test_dogrulama_penceresi_saat_kaymasini_tolere_eder() -> None:
    now = 1_700_000_000.0
    previous = totp(KEY_SHA1, now - 30)
    following = totp(KEY_SHA1, now + 30)
    assert verify_totp(KEY_SHA1, previous, now) == int(now // 30) - 1
    assert verify_totp(KEY_SHA1, following, now) == int(now // 30) + 1
    assert verify_totp(KEY_SHA1, totp(KEY_SHA1, now - 90), now) is None
    assert verify_totp(KEY_SHA1, previous, now, window=0) is None


def test_ayni_kod_ikinci_kez_kullanilamaz() -> None:
    now = 1_700_000_000.0
    code = totp(KEY_SHA1, now)
    used = verify_totp(KEY_SHA1, code, now)
    assert used is not None
    assert verify_totp(KEY_SHA1, code, now + 5, last_used_counter=used) is None


@pytest.mark.parametrize("bad", ["", "12345", "1234567", "12345a", "١٢٣٤٥٦", "  "])
def test_bicimsiz_kod_reddedilir(bad: str) -> None:
    assert verify_totp(KEY_SHA1, bad, 1_700_000_000.0) is None


def test_bosluklu_kod_kabul_edilir() -> None:
    now = 1_700_000_000.0
    code = totp(KEY_SHA1, now)
    assert verify_totp(KEY_SHA1, f"{code[:3]} {code[3:]}", now) is not None


def test_gizli_anahtar_uretimi_belirlenimci_kaynakla() -> None:
    secret = generate_secret(randbytes=lambda n: bytes(range(n)))
    assert len(secret) == 32
    assert b32decode(secret + "=" * (-len(secret) % 8)) == bytes(range(20))
    with pytest.raises(ValueError, match="128 bit"):
        generate_secret(8)


def test_otpauth_adresi_turkce_yayinci() -> None:
    uri = otpauth_uri("JBSWY3DPEHPK3PXP", "ayşe@örnek.test", "Köprü Şirketi")
    parts = urlsplit(uri)
    assert parts.scheme == "otpauth"
    assert parts.netloc == "totp"
    assert unquote(parts.path) == "/Köprü Şirketi:ayşe@örnek.test"
    query = parse_qs(parts.query)
    assert query["issuer"] == ["Köprü Şirketi"]
    assert query["secret"] == ["JBSWY3DPEHPK3PXP"]
    assert " " not in uri


def test_otpauth_iki_nokta_reddedilir() -> None:
    with pytest.raises(ValueError, match="':'"):
        otpauth_uri("JBSWY3DPEHPK3PXP", "a:b", "Köprü")


def test_hotp_parametre_sinirlari() -> None:
    with pytest.raises(ValueError, match="Basamak"):
        hotp(KEY_SHA1, 0, digits=5)
    with pytest.raises(ValueError, match="Sayaç"):
        hotp(KEY_SHA1, -1)
