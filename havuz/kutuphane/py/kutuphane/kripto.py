"""kripto — standart kütüphanenin kriptosu (hashlib, hmac, secrets) üstüne ince ve güvenli sarmalayıcılar: SHA-256,
HMAC-SHA256, sabit zamanlı karşılaştırma, rastgele belirteç, imzalı belirteç (HMAC; süreli), parola özeti
(PBKDF2-SHA256, Django biçimi). KENDİ ŞİFRELEME ALGORİTMASI YOKTUR. TypeScript eşiyle aynı çıktıyı verir.

Kullanım:
    sha256("metin")                                     # "…64 hane hex"
    hmac_sha256(gizli, govde)                           # webhook imzası
    t = sign_token({"sub": "42"}, gizli, expires_in_seconds=3600)
    verify_token(t, gizli)                              # {"ok": True, "payload": {...}} | {"ok": False, "reason": ...}
    ozet = hash_password(parola)                        # "pbkdf2_sha256$600000$tuz$özet"
    verify_password(parola, ozet)                       # True / False (sabit zamanlı)

Kararlar: Parola özeti PBKDF2-SHA256, 600 000 tur (OWASP 2023 önerisi; standart kütüphanede Argon2 yok). Biçim
Django'nunkiyle aynıdır; Django ile karşılıklı denenmedi. Parola NFC'ye normalleştirilir. İmzalı belirteç
"v1.<base64url(JSON)>.<base64url(HMAC)>" biçimindedir; yük ŞİFRELENMEZ, yalnız imzalanır. TypeScript eşi aynı
belirteci üretir ve doğrular (JSON: ayırıcısız, ensure_ascii=False, anahtar sırası korunur).

Sınırlar: Gizli anahtar en az 32 bayt rastgele olmalı (random_token). Belirteçte float kullanmayın (Python 1.0'ı
"1.0", JS "1" yazar). Belirteç iptal listesi yoktur (kısa süre verin).

Genişletme: Yeni işlev yalnız hashlib/hmac/secrets kullanır; TypeScript eşine (crypto.subtle) aynı çıktıyı verecek
biçimde eklenir ve `vektorler/kripto.json`'a örnek yazılır.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import re
import secrets
import time
import unicodedata
from typing import Any, Literal

__all__ = [
    "DEFAULT_PASSWORD_ITERATIONS",
    "hash_password",
    "hmac_sha256",
    "needs_rehash",
    "random_token",
    "sha256",
    "sign_token",
    "timing_safe_equal",
    "verify_password",
    "verify_token",
]

DEFAULT_PASSWORD_ITERATIONS = 600_000
_MAX_ITERATIONS = 100_000_000
_SALT_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
Encoding = Literal["hex", "base64url"]


def _to_bytes(data: str | bytes) -> bytes:
    return data.encode("utf-8") if isinstance(data, str) else bytes(data)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _from_b64url(text: str) -> bytes | None:
    if not re.fullmatch("[A-Za-z0-9_-]*", text) or len(text) % 4 == 1:
        return None
    try:
        return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))
    except (binascii.Error, ValueError):
        return None


def _encode(digest: bytes, encoding: Encoding) -> str:
    return digest.hex() if encoding == "hex" else _b64url(digest)


def sha256(data: str | bytes, encoding: Encoding = "hex") -> str:
    """SHA-256 özeti (metin UTF-8 olarak)."""
    return _encode(hashlib.sha256(_to_bytes(data)).digest(), encoding)


def hmac_sha256(key: str | bytes, data: str | bytes, encoding: Encoding = "hex") -> str:
    """HMAC-SHA256 (webhook imzası, belirteç imzası)."""
    return _encode(hmac.new(_to_bytes(key), _to_bytes(data), hashlib.sha256).digest(), encoding)


def timing_safe_equal(a: str | bytes, b: str | bytes) -> bool:
    """Sabit zamanlı karşılaştırma: imza/belirteç karşılaştırırken `==` yerine bunu kullanın."""
    return hmac.compare_digest(_to_bytes(a), _to_bytes(b))


def random_token(size: int = 32) -> str:
    """Kriptografik rastgele belirteç (base64url). 32 bayt = 256 bit."""
    if size < 16:
        raise ValueError("En az 16 bayt kullanın.")
    return _b64url(secrets.token_bytes(size))


def _dumps(value: Any) -> str:
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def sign_token(
    payload: dict[str, Any],
    secret: str,
    *,
    expires_in_seconds: int | None = None,
    now_seconds: int | None = None,
) -> str:
    """İmzalı belirteç üretir: "v1.<yük>.<imza>". Yüke `iat` ve süre verildiyse `exp` eklenir."""
    iat = now_seconds if now_seconds is not None else int(time.time())
    claims = {**payload, "iat": iat}
    if expires_in_seconds is not None:
        claims["exp"] = iat + expires_in_seconds
    body = "v1." + _b64url(_dumps(claims).encode("utf-8"))
    return f"{body}.{hmac_sha256(secret, body, 'base64url')}"


def verify_token(token: str, secret: str, *, now_seconds: int | None = None) -> dict[str, Any]:
    """Belirteci doğrular: önce imza, sonra süre. Hata fırlatmaz; {"ok": False, "reason": ...} döndürür."""
    parts = token.split(".")
    if len(parts) != 3 or parts[0] != "v1":
        return {"ok": False, "reason": "format"}
    body, signature = parts[1], parts[2]
    if not timing_safe_equal(hmac_sha256(secret, f"v1.{body}", "base64url"), signature):
        return {"ok": False, "reason": "signature"}
    raw = _from_b64url(body)
    try:
        claims = json.loads(raw.decode("utf-8")) if raw is not None else None
    except (UnicodeDecodeError, ValueError):
        return {"ok": False, "reason": "format"}
    if not isinstance(claims, dict):
        return {"ok": False, "reason": "format"}
    now = now_seconds if now_seconds is not None else int(time.time())
    exp = claims.get("exp")
    if isinstance(exp, int | float) and not isinstance(exp, bool) and now >= exp:
        return {"ok": False, "reason": "expired"}
    return {"ok": True, "payload": claims}


def _pbkdf2(password: str, salt: str, iterations: int) -> str:
    normalized = unicodedata.normalize("NFC", password).encode("utf-8")
    digest = hashlib.pbkdf2_hmac("sha256", normalized, salt.encode("utf-8"), iterations, dklen=32)
    return base64.b64encode(digest).decode("ascii")


def hash_password(
    password: str, *, iterations: int = DEFAULT_PASSWORD_ITERATIONS, salt: str | None = None
) -> str:
    """Parola özeti: "pbkdf2_sha256$<tur>$<tuz>$<base64>". `salt` yalnız test için verilir."""
    if not 1 <= iterations <= _MAX_ITERATIONS:
        raise ValueError("Tur sayısı 1 ile 100 milyon arasında tam sayı olmalı.")
    chosen = (
        salt if salt is not None else "".join(secrets.choice(_SALT_ALPHABET) for _ in range(22))
    )
    if not re.fullmatch("[A-Za-z0-9./+]{1,128}", chosen):
        raise ValueError("Tuz yalnız harf, rakam, . / + içerebilir.")
    return f"pbkdf2_sha256${iterations}${chosen}${_pbkdf2(password, chosen, iterations)}"


def _parse_stored(stored: str) -> tuple[int, str, str] | None:
    match = re.fullmatch(
        r"pbkdf2_sha256\$([0-9]{1,9})\$([A-Za-z0-9./+]{1,128})\$([A-Za-z0-9+/=]{1,128})", stored
    )
    if not match:
        return None
    iterations = int(match.group(1))
    if not 1 <= iterations <= _MAX_ITERATIONS:
        return None
    return iterations, match.group(2), match.group(3)


def verify_password(password: str, stored: str) -> bool:
    """Parolayı saklanan özetle sabit zamanlı karşılaştırır. Bozuk özet → False."""
    parsed = _parse_stored(stored)
    if parsed is None:
        return False
    iterations, salt, expected = parsed
    return timing_safe_equal(_pbkdf2(password, salt, iterations), expected)


def needs_rehash(stored: str, iterations: int = DEFAULT_PASSWORD_ITERATIONS) -> bool:
    """Özet eski (daha az turlu) ya da bozuksa True: kullanıcı giriş yaptığında yeniden özetleyin."""
    parsed = _parse_stored(stored)
    return parsed is None or parsed[0] < iterations
