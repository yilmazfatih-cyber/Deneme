"""JWT HS256: RFC 7515 Ek A.1 örneği, imzala/doğrula ve bilinen saldırıların her biri için bir
test.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from typing import Any

import pytest

from kripto_egitim.encoding import b64url_decode, b64url_encode
from kripto_egitim.jwt import JwtError, _parse_json_object, sign_hs256, verify_hs256

KEY = b"k" * 32
NOW = 1_700_000_000.0


def _forge(
    header: dict[str, Any], claims: dict[str, Any], key: bytes = KEY, raw: bool = False
) -> str:
    """Saldırganın elle kurduğu belirteç (kendi seçtiği başlıkla)."""
    head = b64url_encode(json.dumps(header).encode())
    body = b64url_encode(json.dumps(claims).encode())
    if raw:
        return f"{head}.{body}."
    sig = hmac.digest(key, f"{head}.{body}".encode(), "sha256")
    return f"{head}.{body}.{b64url_encode(sig)}"


def test_rfc7515_ek_a1_ornegi_dogrulanir() -> None:
    jwk_k = "AyM1SysPpbyDfgZld3umj1qzKObwVMkoqQ-EstJQLr_T-1qS0gZH75aKtMN3Yj0iPS4hcgUuTwjAzZr1Z9CAow"
    token = (
        "eyJ0eXAiOiJKV1QiLA0KICJhbGciOiJIUzI1NiJ9"
        ".eyJpc3MiOiJqb2UiLA0KICJleHAiOjEzMDA4MTkzODAsDQogImh0dHA6Ly9leGFtcGxlLmNvbS9pc19yb290"
        "Ijp0cnVlfQ"
        ".dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    )
    claims = verify_hs256(token, b64url_decode(jwk_k), now=1300819379, issuer="joe")
    assert claims["http://example.com/is_root"] is True
    with pytest.raises(JwtError, match="süresi dolmuş"):
        verify_hs256(token, b64url_decode(jwk_k), now=1300819380)


def test_imzala_dogrula_gidis_donus_ve_stdlib_imzasi() -> None:
    claims = {"sub": "ayşe", "exp": NOW + 60, "aud": "not-defteri"}
    token = sign_hs256(claims, KEY)
    head, body, sig = token.split(".")
    assert b64url_decode(sig) == hmac.digest(KEY, f"{head}.{body}".encode(), hashlib.sha256)
    assert verify_hs256(token, KEY, now=NOW, audience="not-defteri") == claims


def _reason(token: str, **kwargs: Any) -> str:
    with pytest.raises(JwtError) as info:
        verify_hs256(token, KEY, now=NOW, **kwargs)
    return info.value.reason


def test_none_algoritmasi_reddedilir() -> None:
    assert _reason(_forge({"alg": "none"}, {"exp": NOW + 60}, raw=True)) == "bicim"
    assert _reason(_forge({"alg": "none"}, {"exp": NOW + 60})) == "algoritma"


@pytest.mark.parametrize("alg", ["HS512", "RS256", "hs256", "HS256 ", None])
def test_algoritma_karisikligi_reddedilir(alg: str | None) -> None:
    assert _reason(_forge({"alg": alg}, {"exp": NOW + 60})) == "algoritma"


def test_crit_basligi_reddedilir() -> None:
    assert _reason(_forge({"alg": "HS256", "crit": ["b64"]}, {"exp": NOW + 60})) == "algoritma"


def test_degistirilmis_govde_ve_yanlis_anahtar() -> None:
    token = sign_hs256({"sub": "ayşe", "exp": NOW + 60}, KEY)
    head, _body, sig = token.split(".")
    evil = b64url_encode(json.dumps({"sub": "admin", "exp": NOW + 60}).encode())
    assert _reason(f"{head}.{evil}.{sig}") == "imza"
    with pytest.raises(JwtError, match="İmza"):
        verify_hs256(token, b"x" * 32, now=NOW)


def test_kanonik_olmayan_imza_yazilisi_reddedilir() -> None:
    token = sign_hs256({"exp": NOW + 60}, KEY)
    head, body, sig = token.split(".")
    # Son karakterin kullanılmayan bitleri değiştirilirse stdlib aynı baytları çözer; biz
    # reddederiz.
    alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    tweaked = sig[:-1] + alphabet[alphabet.index(sig[-1]) ^ 1]
    assert _reason(f"{head}.{body}.{tweaked}") in {"bicim", "imza"}
    assert _reason(f"{head}.{body}.{sig}=") == "bicim"


def test_yinelenen_anahtar_ve_nan_reddedilir() -> None:
    head = b64url_encode(b'{"alg":"HS256","alg":"none"}')
    assert _reason(f"{head}.e30.c2ln") == "yinelenen-anahtar"
    token = _forge({"alg": "HS256"}, {"exp": NOW + 60})
    head, _body, _sig = token.split(".")
    body = b64url_encode(b'{"exp": NaN}')
    sig = b64url_encode(hmac.digest(KEY, f"{head}.{body}".encode(), "sha256"))
    assert _reason(f"{head}.{body}.{sig}") == "gecersiz-json"


def test_derin_ic_ice_json_cokertmez() -> None:
    # Boyut sınırı (8192) iç içeliği ~3000 düzeyle sınırlar; bu girdi çökme olmadan reddedilmeli.
    head = b64url_encode(b'{"alg":"HS256","x":' + b"[" * 3000 + b"]" * 3000 + b"}")
    assert _reason(f"{head}.e30.c2ln") in {"gecersiz-json", "imza"}
    # Sınır olmasaydı: özyineleme hatası da düzgün bir JwtError'a çevrilir (iç işlev doğrudan
    # sınanır).
    with pytest.raises(JwtError, match="JSON"):
        _parse_json_object(b"[" * 200_000 + b"]" * 200_000, "Başlık")


@pytest.mark.parametrize(
    ("claims", "reason"),
    [
        ({"exp": NOW - 1}, "suresi-dolmus"),
        ({"exp": NOW}, "suresi-dolmus"),
        ({"exp": "yarın"}, "gecersiz-talep"),
        ({"exp": True}, "gecersiz-talep"),
        ({"exp": NOW + 60, "nbf": NOW + 30}, "henuz-gecerli-degil"),
        ({"exp": NOW + 60, "iat": NOW + 300}, "gelecekten"),
        ({}, "eksik-talep"),
        ({"exp": NOW + 60, "aud": "baska-hizmet"}, "yanlis-izleyici"),
    ],
)
def test_talep_denetimleri(claims: dict[str, Any], reason: str) -> None:
    assert _reason(sign_hs256(claims, KEY)) == reason


def test_izleyici_listesi_ve_duzenleyen() -> None:
    token = sign_hs256({"exp": NOW + 60, "aud": ["a", "b"], "iss": "köprü"}, KEY)
    assert verify_hs256(token, KEY, now=NOW, audience="b", issuer="köprü")["iss"] == "köprü"
    assert _reason(token, audience="c") == "yanlis-izleyici"
    assert _reason(token, audience="a", issuer="başkası") == "yanlis-duzenleyen"


def test_esneklik_payi() -> None:
    token = sign_hs256({"exp": NOW - 5}, KEY)
    assert verify_hs256(token, KEY, now=NOW, leeway=10)["exp"] == NOW - 5


@pytest.mark.parametrize("bad", ["", "a.b", "a.b.c.d", "a..c", "x" * 9000, "ş.ş.ş"])
def test_bicimsiz_belirtecler(bad: str) -> None:
    assert _reason(bad) == "bicim"


def test_kisa_anahtar_reddedilir() -> None:
    with pytest.raises(ValueError, match="32 bayt"):
        sign_hs256({"exp": NOW}, b"kisa")
    with pytest.raises(ValueError, match="32 bayt"):
        verify_hs256("a.b.c", b"kisa", now=NOW)


def test_alg_basligi_ezilemez() -> None:
    token = sign_hs256({"exp": NOW + 60}, KEY, extra_headers={"alg": "none", "kid": "1"})
    header = json.loads(b64url_decode(token.split(".")[0]))
    assert header == {"kid": "1", "alg": "HS256", "typ": "JWT"}
