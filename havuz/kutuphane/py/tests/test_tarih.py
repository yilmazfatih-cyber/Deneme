"""tarih modülünün testi: ortak vektörler + iş günü ters işlem özelliği + saat dilimi tuzakları."""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
import random
import re
from pathlib import Path
from typing import Any

import pytest

from kutuphane import tarih
from kutuphane.tarih import (
    DateError,
    add_business_days,
    add_days,
    business_days_between,
    format_date_tr,
    is_business_day,
    parse_date_tr,
    relative_time_tr,
    to_iso_date,
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
    if isinstance(value, dt.date):
        return value.isoformat()
    if isinstance(value, list):
        return [_plain(item) for item in value]
    return value


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("tarih").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(tarih, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(DateError):
            fn(*case["girdi"], **kwargs)
    else:
        assert _plain(fn(*case["girdi"], **kwargs)) == case["cikti"]


def test_round_trip_format_parse() -> None:
    rng = random.Random(31)
    for _ in range(500):
        day = add_days("2000-01-01", rng.randint(-100_000, 100_000))
        for pattern in ("kisa", "orta", "uzun"):
            assert parse_date_tr(format_date_tr(day, pattern)) == day


def test_business_days_inverse() -> None:
    rng = random.Random(32)
    holidays = ["2026-03-20", "2026-05-27", "2026-05-28"]
    for _ in range(300):
        start = add_days("2026-01-01", rng.randint(0, 364))
        count = rng.randint(-30, 30)
        end = add_business_days(start, count, holidays=holidays)
        if count:
            assert is_business_day(end, holidays=holidays)
        assert business_days_between(start, end, holidays=holidays) == count


def test_timezone_traps() -> None:
    utc = dt.UTC
    assert to_iso_date(dt.datetime(2026, 11, 16, 20, 59, 59, tzinfo=utc)) == dt.date(2026, 11, 16)
    assert to_iso_date(dt.datetime(2026, 11, 16, 21, 0, tzinfo=utc)) == dt.date(2026, 11, 17)
    with pytest.raises(DateError):
        to_iso_date(dt.datetime(2026, 11, 16, 12, 0))  # saat dilimsiz datetime reddedilir
    now = dt.datetime(2026, 11, 16, 9, 0, tzinfo=utc)
    assert relative_time_tr(dt.date(2026, 11, 14), now) == "2 gün önce"
