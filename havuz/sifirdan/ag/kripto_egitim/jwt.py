"""JWT HS256 (RFC 7519 / 7515) imzalama ve SIKI doğrulama — sıfırdan.

Biçim: base64url(başlık) . base64url(gövde) . base64url(HMAC-SHA256(anahtar, "başlık.gövde"))
Doğrulama sırası (her adım bilinen bir saldırıyı keser):
    1. boyut/biçim: 3 parça, kanonik base64url, boş imza yok    → imzasız "none" belirteci
    2. başlıkta `alg` TAM OLARAK "HS256", `crit` yok            → algoritma karışıklığı
    3. imza sabit zamanda karşılaştırılır                       → zamanlama saldırısı
    4. gövde ANCAK imzadan sonra çözülür; yinelenen anahtar/NaN → ayrıştırıcı farkları
    5. `exp`, `nbf`, `iat`, `aud`, `iss` (saat dışarıdan verilir)
EĞİTSELDİR: üretimde bakımı yapılan bir kitaplık kullanın ve algoritmayı her zaman sunucu tarafında
sabitleyin.
Genişletme: yeni bir zorunlu talep için `verify_hs256` içindeki `_check_claims`'e bir koşul ve bir
test ekleyin.
"""

from __future__ import annotations

import json
from typing import Any

from kripto_egitim.encoding import DecodeError, b64url_decode, b64url_encode
from kripto_egitim.mac import constant_time_equal, hmac_digest
from kripto_egitim.sha import sha256

MAX_TOKEN_LENGTH = 8192
MIN_KEY_LENGTH = 32  # RFC 7518 §3.2: HS256 anahtarı en az 256 bit olmalı


class JwtError(ValueError):
    """Belirteç reddedildi. `reason` makinece okunur kısa ad, ileti Türkçe açıklamadır."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def _no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise JwtError("yinelenen-anahtar", f"JSON içinde yinelenen anahtar: {key!r}")
        result[key] = value
    return result


def _reject_constant(name: str) -> Any:
    raise JwtError("gecersiz-json", f"JSON'da {name} kabul edilmez.")


def _parse_json_object(raw: bytes, part: str) -> dict[str, Any]:
    try:
        value = json.loads(
            raw.decode("utf-8"), object_pairs_hook=_no_duplicates, parse_constant=_reject_constant
        )
    except (UnicodeDecodeError, json.JSONDecodeError, RecursionError) as exc:
        raise JwtError("gecersiz-json", f"{part} geçerli bir JSON değil.") from exc
    if not isinstance(value, dict):
        raise JwtError("gecersiz-json", f"{part} bir JSON nesnesi olmalı.")
    return value


def _check_key(key: bytes) -> None:
    if len(key) < MIN_KEY_LENGTH:
        raise ValueError(
            f"HS256 anahtarı en az {MIN_KEY_LENGTH} bayt olmalı (secrets.token_bytes(32))."
        )


def sign_hs256(
    claims: dict[str, Any], key: bytes, extra_headers: dict[str, Any] | None = None
) -> str:
    """Talepleri (claims) imzalar. `alg` ve `typ` her zaman bu işlev tarafından konur."""
    _check_key(key)
    header: dict[str, Any] = dict(extra_headers or {})
    header.update({"alg": "HS256", "typ": "JWT"})
    segments = [
        b64url_encode(json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode()),
        b64url_encode(json.dumps(claims, separators=(",", ":"), ensure_ascii=False).encode()),
    ]
    signing_input = ".".join(segments).encode("ascii")
    return ".".join([*segments, b64url_encode(hmac_digest(key, signing_input, sha256))])


def _is_number(value: Any) -> bool:
    return isinstance(value, int | float) and not isinstance(value, bool)


def _check_claims(
    claims: dict[str, Any],
    now: float,
    audience: str | None,
    issuer: str | None,
    leeway: float,
    require: tuple[str, ...],
) -> None:
    for name in require:
        if name not in claims:
            raise JwtError("eksik-talep", f"Zorunlu talep yok: {name}")
    for name in ("exp", "nbf", "iat"):
        if name in claims and not _is_number(claims[name]):
            raise JwtError("gecersiz-talep", f"{name} bir sayı (Unix zamanı) olmalı.")
    if "exp" in claims and now >= claims["exp"] + leeway:
        raise JwtError("suresi-dolmus", "Belirtecin süresi dolmuş.")
    if "nbf" in claims and now < claims["nbf"] - leeway:
        raise JwtError("henuz-gecerli-degil", "Belirteç henüz geçerli değil (nbf).")
    if "iat" in claims and claims["iat"] > now + leeway:
        raise JwtError("gelecekten", "Belirteç gelecekte düzenlenmiş görünüyor (iat).")
    if "aud" in claims or audience is not None:
        aud = claims.get("aud")
        accepted = [aud] if isinstance(aud, str) else aud if isinstance(aud, list) else []
        if audience is None or audience not in accepted:
            raise JwtError("yanlis-izleyici", "Belirteç bu hizmet için düzenlenmemiş (aud).")
    if issuer is not None and claims.get("iss") != issuer:
        raise JwtError("yanlis-duzenleyen", "Belirteci düzenleyen beklenen değil (iss).")


def verify_hs256(
    token: str,
    key: bytes,
    *,
    now: float,
    audience: str | None = None,
    issuer: str | None = None,
    leeway: float = 0.0,
    require: tuple[str, ...] = ("exp",),
) -> dict[str, Any]:
    """Belirteci doğrular ve talepleri döndürür; her sorunda `JwtError` fırlatır."""
    _check_key(key)
    if not isinstance(token, str) or len(token) > MAX_TOKEN_LENGTH or not token.isascii():
        raise JwtError("bicim", "Belirteç biçimi geçersiz ya da çok uzun.")
    parts = token.split(".")
    if len(parts) != 3 or not all(parts):
        raise JwtError("bicim", "Belirteç noktayla ayrılmış üç boş olmayan parçadan oluşmalı.")
    try:
        header_raw, payload_raw, signature = (b64url_decode(p) for p in parts)
    except DecodeError as exc:
        raise JwtError("bicim", "Belirteç parçaları kanonik base64url değil.") from exc
    header = _parse_json_object(header_raw, "Başlık")
    if header.get("alg") != "HS256":
        raise JwtError("algoritma", "Yalnız HS256 kabul edilir (alg).")
    if "crit" in header:
        raise JwtError("algoritma", "Desteklenmeyen kritik başlık uzantısı (crit).")
    typ = header.get("typ")
    if typ is not None and (not isinstance(typ, str) or typ.upper() != "JWT"):
        raise JwtError("bicim", "typ başlığı JWT olmalı.")
    expected = hmac_digest(key, f"{parts[0]}.{parts[1]}".encode("ascii"), sha256)
    if not constant_time_equal(expected, signature):
        raise JwtError("imza", "İmza doğrulanamadı.")
    claims = _parse_json_object(payload_raw, "Gövde")
    _check_claims(claims, now, audience, issuer, leeway, require)
    return claims
