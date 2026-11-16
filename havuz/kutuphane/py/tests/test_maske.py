"""maske modülünün testi: ortak vektörler + "gizli kısım sızmaz" özellik testi."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import maske
from kutuphane.maske import mask_card_number, mask_middle, mask_tckn


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
    for name, cases in _load_vectors("maske").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(maske, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    assert fn(*case["girdi"], **kwargs) == case["cikti"]


def test_mask_middle_preserves_shape() -> None:
    for text in ["ABC-12345", "TR33 0006 1005", "a.b@c.d", "Çağrı Öztürk", "1-2-3"]:
        for start in range(4):
            for end in range(4):
                masked = mask_middle(text, keep_start=start, keep_end=end)
                assert len(masked) == len(text)
                revealed = sum(
                    1 for a, b in zip(masked, text, strict=True) if a == b and b.isalnum()
                )
                assert revealed <= start + end


def test_middle_digits_never_leak() -> None:
    assert mask_tckn("98765432109")[3:9] == "******"
    assert not re.search("[23]", mask_card_number("4111 2222 3333 4444"))
