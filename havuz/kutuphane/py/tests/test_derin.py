"""derin modülünün testi: ortak vektörler + NaN, döngüsel yapı, kopyanın bağımsızlığı."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import derin
from kutuphane.derin import deep_clone, deep_equal, deep_merge, set_path


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
    for name, cases in _load_vectors("derin").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(derin, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises((ValueError, TypeError)):
            fn(*case["girdi"], **kwargs)
    else:
        assert deep_equal(fn(*case["girdi"], **kwargs), case["cikti"])


def test_nan_cycles_and_types() -> None:
    assert deep_equal({"x": float("nan")}, {"x": float("nan")})
    assert not deep_equal([1, 2], (1, 2))
    assert deep_equal({1, 2}, {2, 1})
    a: dict[str, Any] = {"ad": "a"}
    a["ben"] = a
    b: dict[str, Any] = {"ad": "a"}
    b["ben"] = b
    assert deep_equal(a, b)


def test_clone_is_independent() -> None:
    original: dict[str, Any] = {"liste": [1, {"iç": True}]}
    original["kendisi"] = original
    copy = deep_clone(original)
    assert copy is not original
    assert copy["kendisi"] is copy
    copy["liste"][1]["iç"] = False
    assert original["liste"][1]["iç"] is True


def test_merge_and_set_path_do_not_mutate() -> None:
    base: dict[str, Any] = {"a": {"b": 1}, "liste": [1]}
    assert deep_merge(base, {"a": {"c": 2}}) == {"a": {"b": 1, "c": 2}, "liste": [1]}
    updated = set_path(base, "a.b", 9)
    assert updated["a"]["b"] == 9
    assert base["a"]["b"] == 1
    assert set_path([], [2], "x") == [None, None, "x"]
