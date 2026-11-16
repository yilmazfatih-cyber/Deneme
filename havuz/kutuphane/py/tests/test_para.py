"""para modülünün testi: ortak vektörler + paylaştırma/KDV değişmezleri (toplam korunur) için özellik testleri."""

from __future__ import annotations

import dataclasses
import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import para
from kutuphane.para import (
    Money,
    MoneyError,
    add,
    add_vat,
    allocate,
    format_money,
    money,
    parse_money,
    remove_vat,
    sum_money,
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


def _to_py(value: Any) -> Any:
    """JSON'daki { kurus, currency } nesnelerini Money'ye çevirir."""
    if isinstance(value, dict) and "kurus" in value:
        return Money(value["kurus"], value.get("currency", "TRY"))
    if isinstance(value, list):
        return [_to_py(item) for item in value]
    return value


def _plain(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("para").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(para, _snake(name))
    args = [_to_py(arg) for arg in case["girdi"]]
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(MoneyError):
            fn(*args, **kwargs)
    else:
        assert _plain(fn(*args, **kwargs)) == case["cikti"]


def test_allocation_preserves_total() -> None:
    rng = random.Random(21)
    for _ in range(2000):
        total = money(int((rng.random() - 0.3) * 1_000_000))
        ratios = [rng.randint(0, 99) for _ in range(rng.randint(1, 8))]
        if not any(ratios):
            ratios[0] = 1
        parts = allocate(total, ratios)
        assert sum_money(parts).kurus == total.kurus
        for part, ratio in zip(parts, ratios, strict=True):
            assert abs(part.kurus - total.kurus * ratio / sum(ratios)) < 1


def test_vat_parts_always_add_up() -> None:
    rng = random.Random(22)
    for _ in range(2000):
        amount = money(rng.randint(0, 10_000_000))
        rates: list[int | str] = [0, 1, 8, 10, 18, 20, "7.5"]
        rate = rng.choice(rates)
        removed = remove_vat(amount, rate)
        assert removed.net.kurus + removed.vat.kurus == amount.kurus
        added = add_vat(amount, rate)
        assert added.gross.kurus == amount.kurus + added.vat.kurus


def test_format_parse_round_trip() -> None:
    rng = random.Random(23)
    for _ in range(2000):
        m = money(int((rng.random() - 0.5) * 10 ** rng.randint(1, 13)))
        for style in ("symbol", "code", "plain"):
            assert parse_money(format_money(m, style=style)) == m


def test_overflow_and_types() -> None:
    with pytest.raises(MoneyError):
        money(2**53)
    with pytest.raises(MoneyError):
        add(money(2**53 - 1), money(1))
    with pytest.raises(MoneyError):
        money(True)
    with pytest.raises(MoneyError):
        para.from_decimal(float("nan"))
