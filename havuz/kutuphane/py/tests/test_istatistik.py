"""istatistik modülünün testi: ortak vektörler (hoşgörülü) + standart kütüphane `statistics` ile karşılaştırma."""

from __future__ import annotations

import dataclasses
import json
import math
import random
import re
import statistics
from pathlib import Path
from typing import Any

import pytest

from kutuphane import istatistik
from kutuphane.istatistik import (
    StatsError,
    linear_regression,
    mean,
    median,
    pearson,
    precise_sum,
    quantile,
    standard_deviation,
    variance,
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
        return len(actual) == len(expected) and all(
            _close(a, e) for a, e in zip(actual, expected, strict=True)
        )
    if isinstance(expected, dict):
        return all(_close(actual[k], v) for k, v in expected.items())
    return bool(actual == expected)


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("istatistik").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(istatistik, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(StatsError):
            fn(*case["girdi"], **kwargs)
    else:
        result = _plain(fn(*case["girdi"], **kwargs))
        assert _close(result, case["cikti"]), f"{result!r} != {case['cikti']!r}"


def test_matches_statistics_module() -> None:
    """Başvuru gerçeklemesi: Python'un statistics modülü."""
    rng = random.Random(71)
    for _ in range(300):
        values = [(rng.random() - 0.5) * 1000 for _ in range(rng.randint(2, 50))]
        assert math.isclose(mean(values), statistics.fmean(values), rel_tol=1e-12, abs_tol=1e-12)
        assert math.isclose(median(values), statistics.median(values), rel_tol=1e-12)
        assert math.isclose(variance(values), statistics.variance(values), rel_tol=1e-9)
        assert math.isclose(
            standard_deviation(values, sample=False), statistics.pstdev(values), rel_tol=1e-9
        )
        expected_quartiles = statistics.quantiles(values, n=4, method="inclusive")
        for q, expected in zip((0.25, 0.5, 0.75), expected_quartiles, strict=True):
            assert math.isclose(quantile(values, q), expected, rel_tol=1e-9, abs_tol=1e-9)
        ys = [2 * x + rng.random() for x in values]
        regression = linear_regression(values, ys)
        reference = statistics.linear_regression(values, ys)
        assert math.isclose(regression.slope, reference.slope, rel_tol=1e-9)
        assert math.isclose(regression.intercept, reference.intercept, rel_tol=1e-6, abs_tol=1e-6)
        assert math.isclose(pearson(values, ys), statistics.correlation(values, ys), rel_tol=1e-9)


def test_precise_sum_and_errors() -> None:
    assert precise_sum([1e100, 1.0, -1e100]) == 1.0
    with pytest.raises(StatsError):
        mean([1.0, float("nan")])
    with pytest.raises(StatsError):
        mean([True, 2])
