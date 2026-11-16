"""fark modülünün testi: ortak vektörler + fark uygulanınca hedefin çıkması ve en kısa olma (LCS ile)."""

from __future__ import annotations

import dataclasses
import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import fark
from kutuphane.fark import Changed, diff_by_key, diff_sequences, unified_diff


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


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _plain(value: Any) -> Any:
    """Dataclass → sözlük; TypeScript'te hiç yazılmayan alanlar (eksik before/after) atlanır."""
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {
            _camel(f.name): _plain(getattr(value, f.name))
            for f in dataclasses.fields(value)
            if getattr(value, f.name) is not fark._MISSING
        }
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("fark").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(fark, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    assert _plain(fn(*case["girdi"], **kwargs)) == case["cikti"]


def _lcs_length(a: list[str], b: list[str]) -> int:
    """Bağımsız gerçekleme: dinamik programlamayla en uzun ortak alt dizi uzunluğu."""
    row = [0] * (len(b) + 1)
    for x in a:
        diagonal = 0
        for j in range(1, len(b) + 1):
            up = row[j]
            row[j] = diagonal + 1 if x == b[j - 1] else max(up, row[j - 1])
            diagonal = up
    return row[len(b)]


def test_diff_rebuilds_and_is_minimal() -> None:
    rng = random.Random(61)
    for _ in range(400):
        a = [rng.choice("abc") for _ in range(rng.randint(0, 11))]
        b = [rng.choice("abc") for _ in range(rng.randint(0, 11))]
        ops = diff_sequences(a, b)
        assert [x for op in ops if op.type != "insert" for x in op.items] == a
        assert [x for op in ops if op.type != "delete" for x in op.items] == b
        edits = sum(len(op.items) for op in ops if op.type != "equal")
        assert edits == len(a) + len(b) - 2 * _lcs_length(a, b)


def test_diff_by_key_ignores_moves() -> None:
    before = [{"id": 1, "ad": "Ali"}, {"id": 2, "ad": "Veli"}, {"id": 3, "ad": "Can"}]
    after = [{"id": 3, "ad": "Can"}, {"id": 1, "ad": "Ali Rıza"}, {"id": 4, "ad": "Ece"}]
    result = diff_by_key(before, after, key=lambda k: k["id"])
    assert result.added == [{"id": 4, "ad": "Ece"}]
    assert result.removed == [{"id": 2, "ad": "Veli"}]
    assert result.changed == [Changed({"id": 1, "ad": "Ali"}, {"id": 1, "ad": "Ali Rıza"})]
    assert result.unchanged == [{"id": 3, "ad": "Can"}]
    assert unified_diff("a\n", "a\n") == ""
