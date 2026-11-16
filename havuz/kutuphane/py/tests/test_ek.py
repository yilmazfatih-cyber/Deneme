"""ek modülünün testi: ortak vektörler (vektorler/ek.json) + sayı okunuşu özellik testleri."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import ek
from kutuphane.ek import SuffixError, add_suffix, reading_for_suffix, suffix_of


def _load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    here = Path(__file__).resolve().parent
    for candidate in (
        here / "vektorler" / f"{name}.json",
        here.parents[1] / "vektorler" / f"{name}.json",
    ):
        if candidate.exists():
            data: dict[str, Any] = json.loads(candidate.read_text(encoding="utf-8"))
            return dict(data["islevler"])
    raise FileNotFoundError(
        f"vektorler/{name}.json bulunamadı (testin yanında ya da kutuphane/vektorler altında)"
    )


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("ek").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(ek, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(SuffixError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


_ONES = ["sıfır", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]


def test_last_nonzero_digit_decides_reading() -> None:
    for n in range(1, 5000):
        if n % 10:
            assert reading_for_suffix(str(n)) == _ONES[n % 10]


def test_tens_hundreds_thousands() -> None:
    for n in range(10, 5000, 10):
        expected = _TENS[(n // 10) % 10] if n % 100 else "yüz" if n % 1000 else "bin"
        assert reading_for_suffix(str(n)) == expected


def test_every_number_takes_every_suffix() -> None:
    kinds = ["dative", "locative", "ablative", "accusative", "genitive", "instrumental", "ordinal"]
    for n in range(300):
        for kind in kinds:
            result = add_suffix(str(n), kind)  # type: ignore[arg-type]
            assert result.startswith(f"{n}'")
            assert len(result) > len(str(n)) + 1


def test_locative_after_voiceless() -> None:
    for number, suffix in [
        ("3", "te"),
        ("4", "te"),
        ("5", "te"),
        ("60", "ta"),
        ("70", "te"),
        ("40", "ta"),
    ]:
        assert suffix_of(number, "locative") == suffix
