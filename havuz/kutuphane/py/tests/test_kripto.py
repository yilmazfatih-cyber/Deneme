"""kripto modülünün testi: ortak vektörler (standart SHA-256/HMAC/PBKDF2 değerleri) + gidiş-dönüş ve kurcalama."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import kripto
from kutuphane.kripto import (
    hash_password,
    needs_rehash,
    random_token,
    sign_token,
    verify_password,
    verify_token,
)


def _load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    here = Path(__file__).resolve().parent
    for candidate in (
        here / "vektorler" / f"{name}.json",
        here.parents[1] / "vektorler" / f"{name}.json",
    ):
        if candidate.exists():
            data: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
            return dict(data["islevler"])
    raise FileNotFoundError(f"vektorler/{name}.json bulunamadı")


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("kripto").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(kripto, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(ValueError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


def _flip(text: str) -> str:
    return text[:-1] + ("B" if text.endswith("A") else "A")


def test_token_round_trip_and_tampering() -> None:
    secret = random_token()
    token = sign_token(
        {"sub": "ayşe", "roller": ["okur"]}, secret, expires_in_seconds=60, now_seconds=1000
    )
    assert verify_token(token, secret, now_seconds=1030) == {
        "ok": True,
        "payload": {"sub": "ayşe", "roller": ["okur"], "iat": 1000, "exp": 1060},
    }
    prefix, body, signature = token.split(".")
    tampered_body = verify_token(f"{prefix}.{_flip(body)}.{signature}", secret, now_seconds=1030)
    assert tampered_body == {"ok": False, "reason": "signature"}
    tampered_signature = verify_token(
        f"{prefix}.{body}.{_flip(signature)}", secret, now_seconds=1030
    )
    assert tampered_signature == {"ok": False, "reason": "signature"}
    assert verify_token(token, secret, now_seconds=1060) == {"ok": False, "reason": "expired"}


def test_password_hashing() -> None:
    first = hash_password("Şifre!123", iterations=1000)
    second = hash_password("Şifre!123", iterations=1000)
    assert first != second
    assert verify_password("Şifre!123", first)
    assert verify_password(
        "S\N{COMBINING CEDILLA}ifre!123", first
    )  # ayrışık yazılmış Ş aynı parola
    assert not verify_password("şifre!123", first)
    assert needs_rehash(first)
    assert not needs_rehash(first, 1000)
    assert re.fullmatch("[A-Za-z0-9_-]{22}", random_token(16))
    with pytest.raises(ValueError):
        random_token(8)
