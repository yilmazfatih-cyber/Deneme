"""sayi_yazi modülünün testi: ortak vektörler + yazıdan geri okuma ve gidiş-dönüş özellik testleri."""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import sayi_yazi
from kutuphane.sayi_yazi import (
    NumberFormatError,
    format_number_tr,
    number_to_words,
    parse_number_tr,
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
    for name, cases in _load_vectors("sayi_yazi").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(sayi_yazi, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(NumberFormatError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


_SMALL = {
    "bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5, "altı": 6, "yedi": 7, "sekiz": 8, "dokuz": 9,
    "on": 10, "yirmi": 20, "otuz": 30, "kırk": 40, "elli": 50, "altmış": 60, "yetmiş": 70, "seksen": 80,
    "doksan": 90,
}  # fmt: skip
_SCALES = {
    "bin": 10**3,
    "milyon": 10**6,
    "milyar": 10**9,
    "trilyon": 10**12,
    "katrilyon": 10**15,
    "kentilyon": 10**18,
}


def _words_to_number(text: str) -> int:
    """Bağımsız geri okuyucu: "bin iki yüz otuz dört" → 1234."""
    total = group = 0
    for word in text.split(" "):
        if word == "sıfır":
            continue
        if word == "yüz":
            group = (group or 1) * 100
        elif word in _SCALES:
            total += (group or 1) * _SCALES[word]
            group = 0
        else:
            group += _SMALL[word]
    return total + group


def test_words_round_trip() -> None:
    rng = random.Random(11)
    for _ in range(3000):
        value = int("".join(rng.choice("0123456789") for _ in range(rng.randint(1, 21))))
        words = number_to_words(value)
        assert _words_to_number(words) == value
        assert not re.search("(^|yon |yar )bir bin", words)  # "bir bin" değil "bin"
        assert "  " not in words


def test_format_parse_round_trip() -> None:
    rng = random.Random(12)
    for _ in range(3000):
        value = (rng.random() - 0.5) * 10 ** rng.randint(0, 11)
        assert parse_number_tr(format_number_tr(value)) == value


def test_two_decimals_match_python_format() -> None:
    """Tam kuruşlu değerlerde (yuvarlama gerekmez) Python'un kendi biçimiyle aynı sonucu verir."""
    rng = random.Random(13)
    for _ in range(2000):
        cents = rng.randint(-(10**9), 10**9)
        value = cents / 100
        expected = f"{value:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
        assert format_number_tr(value, decimals=2) == expected


def test_non_finite_and_wrong_types() -> None:
    for bad in (float("nan"), float("inf")):
        with pytest.raises(NumberFormatError):
            format_number_tr(bad)
    with pytest.raises(NumberFormatError):
        number_to_words(True)
    with pytest.raises(NumberFormatError):
        sayi_yazi.amount_to_words(12.5)  # type: ignore[arg-type]
