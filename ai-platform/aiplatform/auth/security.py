"""Parola özeti (scrypt) ve anahtar üretimi — yalnız standart kütüphane."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets

# scrypt parametreleri: n=2^14 (16 MB bellek, ~50 ms) — OWASP'ın scrypt için önerdiği alt sınır
_N, _R, _P, _DKLEN = 2**14, 8, 1, 32
TOKEN_PREFIX = "aip_"
MIN_PASSWORD_LEN = 10


def _b64(b: bytes) -> str:
    return base64.b64encode(b).decode("ascii")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN)
    return f"scrypt${_N}${_R}${_P}${_b64(salt)}${_b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_b64, dk_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        salt, expected = base64.b64decode(salt_b64), base64.b64decode(dk_b64)
        dk = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=int(n), r=int(r), p=int(p), dklen=len(expected)
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(dk, expected)


# Kullanıcı yokken de doğrulama aynı süreyi alsın (kullanıcı adı tahmini zorlaşsın)
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_dummy(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


def password_problem(password: str) -> str | None:
    """Parola kuralını ihlal ediyorsa Türkçe açıklama döner, uygunsa None."""
    if len(password) < MIN_PASSWORD_LEN:
        return f"Parola en az {MIN_PASSWORD_LEN} karakter olmalı."
    if password.strip() != password:
        return "Parola boşlukla başlayamaz veya bitemez."
    return None


def new_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
