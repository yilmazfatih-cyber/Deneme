"""dogrulama modülünün testi: ortak vektörler + üreteç/sağlama özellik testleri (tek hane hatası yakalanır)."""

from __future__ import annotations

import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import dogrulama
from kutuphane.dogrulama import (
    generate_card_number,
    generate_iban_tr,
    generate_phone_tr,
    generate_tckn,
    generate_vkn,
    luhn_check,
    validate_card_number,
    validate_iban,
    validate_iban_tr,
    validate_phone_tr,
    validate_tckn,
    validate_vkn,
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
    for name, cases in _load_vectors("dogrulama").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(dogrulama, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(ValueError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


def _mutate(value: str, index: int, delta: int) -> str:
    return value[:index] + str((int(value[index]) + delta) % 10) + value[index + 1 :]


def test_generated_values_are_valid() -> None:
    rng = random.Random(41)
    for _ in range(1000):
        assert validate_tckn(generate_tckn(rng))
        assert validate_vkn(generate_vkn(rng))
        assert validate_iban_tr(generate_iban_tr(rng))
        assert validate_card_number(generate_card_number(rng))
        assert validate_phone_tr(generate_phone_tr(rng))
    assert generate_iban_tr(rng, "00061")[4:9] == "00061"
    assert generate_card_number(rng, prefix="9792").startswith("9792")


def test_last_digit_errors_are_caught() -> None:
    rng = random.Random(42)
    for _ in range(500):
        tckn, vkn = generate_tckn(rng), generate_vkn(rng)
        for delta in range(1, 10):
            assert not validate_tckn(_mutate(tckn, 10, delta))
            assert not validate_vkn(_mutate(vkn, 9, delta))


def test_iban_and_luhn_catch_every_single_digit_error() -> None:
    rng = random.Random(43)
    for _ in range(100):
        iban, card = generate_iban_tr(rng), generate_card_number(rng)
        for position in range(2, len(iban)):
            for delta in range(1, 10):
                assert not validate_iban(_mutate(iban, position, delta))
        for position in range(len(card)):
            for delta in range(1, 10):
                assert not luhn_check(_mutate(card, position, delta))
