"""bulanik_arama modülünün testi: ortak vektörler (kesirli puan hoşgörülü) + uzaklıkların metrik özellikleri."""

from __future__ import annotations

import dataclasses
import json
import math
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import bulanik_arama
from kutuphane.bulanik_arama import damerau_levenshtein, fuzzy_search, levenshtein


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


def _plain(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {f.name: _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    if isinstance(value, list | tuple):
        return [_plain(item) for item in value]
    return value


def _close(actual: Any, expected: Any) -> bool:
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        return bool(actual == expected)
    if isinstance(expected, int | float):
        return isinstance(actual, int | float) and math.isclose(actual, expected, abs_tol=1e-9)
    if isinstance(expected, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(_close(a, e) for a, e in zip(actual, expected, strict=True))
        )
    if isinstance(expected, dict):
        return (
            isinstance(actual, dict)
            and set(actual) == set(expected)
            and all(_close(actual[k], v) for k, v in expected.items())
        )
    return bool(actual == expected)


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("bulanik_arama").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(bulanik_arama, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    result = _plain(fn(*case["girdi"], **kwargs))
    assert _close(result, case["cikti"]), f"{result!r} != {case['cikti']!r}"


_WORDS = [
    "",
    "a",
    "ab",
    "ba",
    "abc",
    "acb",
    "ankara",
    "ankra",
    "çay",
    "cay",
    "kitap",
    "kitaplık",
    "İzmir",
]


def test_metric_properties() -> None:
    for a in _WORDS:
        for b in _WORDS:
            lev = levenshtein(a, b)
            assert levenshtein(b, a) == lev
            assert damerau_levenshtein(a, b) == damerau_levenshtein(b, a)
            assert damerau_levenshtein(a, b) <= lev
            assert (lev == 0) == (a == b)
            for limit in (0, 1, 2):
                assert levenshtein(a, b, limit) == (lev if lev <= limit else limit + 1)
            for c in _WORDS:
                assert lev <= levenshtein(a, c) + levenshtein(c, b)


def test_search_objects_by_key() -> None:
    people = [{"ilce": "Kadıköy"}, {"ilce": "Üsküdar"}, {"ilce": "Şişli"}]
    assert fuzzy_search("USKUDAR", people, key=lambda p: p["ilce"])[0].item["ilce"] == "Üsküdar"
    assert fuzzy_search("sisli", people, key=lambda p: p["ilce"])[0].score == 1
    assert fuzzy_search("kadkoy", people, key=lambda p: p["ilce"])[0].item["ilce"] == "Kadıköy"
