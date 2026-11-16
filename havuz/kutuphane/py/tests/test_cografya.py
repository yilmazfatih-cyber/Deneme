"""cografya modülünün testi: ortak vektörler (hoşgörülü) + kosinüs yasasıyla karşılaştırma, gidiş-dönüş, kutu kapsamı."""

from __future__ import annotations

import dataclasses
import json
import math
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import cografya
from kutuphane.cografya import (
    EARTH_RADIUS_M,
    GeoError,
    LatLon,
    bounding_box,
    destination_point,
    haversine_distance,
    initial_bearing,
    is_in_bounding_box,
    nearest,
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


def _camel(name: str) -> str:
    head, *rest = name.split("_")
    return head + "".join(part.title() for part in rest)


def _plain(value: Any) -> Any:
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    return value


def _close(actual: Any, expected: Any) -> bool:
    if isinstance(expected, bool):
        return bool(actual == expected)
    if isinstance(expected, int | float):
        return math.isclose(actual, expected, abs_tol=1e-6)
    if isinstance(expected, dict):
        return all(_close(actual[k], v) for k, v in expected.items())
    return bool(actual == expected)


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("cografya").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(cografya, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(GeoError):
            fn(*case["girdi"], **kwargs)
    else:
        result = _plain(fn(*case["girdi"], **kwargs))
        assert _close(result, case["cikti"]), f"{result!r} != {case['cikti']!r}"


def test_haversine_matches_law_of_cosines() -> None:
    rng = random.Random(81)
    for _ in range(500):
        a = LatLon((rng.random() - 0.5) * 170, (rng.random() - 0.5) * 358)
        b = LatLon((rng.random() - 0.5) * 170, (rng.random() - 0.5) * 358)
        cos_angle = math.sin(math.radians(a.lat)) * math.sin(math.radians(b.lat)) + math.cos(
            math.radians(a.lat)
        ) * math.cos(math.radians(b.lat)) * math.cos(math.radians(b.lon - a.lon))
        reference = math.acos(min(1.0, cos_angle)) * EARTH_RADIUS_M
        assert abs(haversine_distance(a, b) - reference) < 1


def test_destination_round_trip_and_box() -> None:
    rng = random.Random(82)
    for _ in range(300):
        start = LatLon((rng.random() - 0.5) * 140, (rng.random() - 0.5) * 358)
        bearing = rng.random() * 360
        distance = 1 + rng.random() * 50_000
        end = destination_point(start, bearing, distance)
        assert abs(haversine_distance(start, end) - distance) < 1e-3
        back = initial_bearing(start, end)
        assert min(abs(back - bearing), 360 - abs(back - bearing)) < 1e-6
        assert is_in_bounding_box(end, bounding_box(start, distance * 1.000001))


def test_nearest() -> None:
    branches = [
        ("Kadıköy", LatLon(40.99, 29.03)),
        ("Beşiktaş", LatLon(41.04, 29.0)),
        ("Ankara", LatLon(39.93, 32.86)),
    ]
    result = nearest(LatLon(41.03, 29.0), branches, key=lambda b: b[1], limit=2)
    assert [r.item[0] for r in result] == ["Beşiktaş", "Kadıköy"]
