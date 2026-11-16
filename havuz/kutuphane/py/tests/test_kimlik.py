"""kimlik modülünün testi: ortak vektörler + sıralılık, sapmasızlık ve sabit baytlarla diller arası aynı çıktı."""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest

from kutuphane import kimlik
from kutuphane.kimlik import (
    Uuidv7Generator,
    is_uuid,
    readable_code,
    short_id,
    uuidv7,
    uuidv7_timestamp,
    validate_readable_code,
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
    for name, cases in _load_vectors("kimlik").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(kimlik, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(ValueError):
            fn(*case["girdi"], **kwargs)
    else:
        assert fn(*case["girdi"], **kwargs) == case["cikti"]


def _fixed_bytes() -> Callable[[int], bytes]:
    """Sabit bayt akışı: (i·37 + 11) mod 256. TypeScript testi aynı akışı kullanır."""
    position = 0

    def source(count: int) -> bytes:
        nonlocal position
        out = bytes(((position + i) * 37 + 11) % 256 for i in range(count))
        position += count
        return out

    return source


def test_monotonic_even_when_clock_goes_back() -> None:
    clock = [1_763_280_000_000]
    generator = Uuidv7Generator(now=lambda: clock[0])
    ids: list[str] = []
    for i in range(2000):
        if i % 100 == 0:
            clock[0] += 1
        if i == 1500:
            clock[0] -= 50
        ids.append(generator.next())
    assert sorted(ids) == ids
    assert len(set(ids)) == len(ids)
    assert all(is_uuid(i, 7) for i in ids)
    assert uuidv7_timestamp(ids[0]) == 1_763_280_000_001


def test_default_generator_uses_real_clock() -> None:
    before = time.time_ns() // 1_000_000
    value = uuidv7_timestamp(uuidv7())
    assert before <= value <= time.time_ns() // 1_000_000


def test_same_bytes_same_ids_as_typescript() -> None:
    assert short_id(21, random_bytes=_fixed_bytes()) == "LwV6fEpOzY9iHsR2bAlKv"
    assert short_id(10, alphabet="0123456789", random_bytes=_fixed_bytes()) == "0549382716"
    assert readable_code(8, check=True, random_bytes=_fixed_bytes()) == "BGNT-Z49E-Y"


def test_uniform_distribution() -> None:
    counts = Counter(short_id(60_000, alphabet="0123456789"))
    assert all(abs(count - 6000) < 400 for count in counts.values())


def test_single_character_errors_detected() -> None:
    for i in range(300):
        code = readable_code(8, check=True)
        assert validate_readable_code(code)
        chars = list(code.replace("-", ""))
        position = i % len(chars)
        chars[position] = "B" if chars[position] == "A" else "A"
        assert not validate_readable_code("".join(chars))
    with pytest.raises(ValueError):
        short_id(5, alphabet="a")
