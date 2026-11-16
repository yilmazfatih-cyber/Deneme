"""cron modülünün testi: ortak vektörler + dakika dakika kaba kuvvetle karşılaştırma."""

from __future__ import annotations

import dataclasses
import json
import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from kutuphane import cron
from kutuphane.cron import CronError, matches_cron, next_run, next_runs, parse_cron


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
    if isinstance(value, datetime):
        return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    if dataclasses.is_dataclass(value) and not isinstance(value, type):
        return {_camel(f.name): _plain(getattr(value, f.name)) for f in dataclasses.fields(value)}
    return value


_CASES = [
    pytest.param(name, case, id=f"{name}#{index + 1}")
    for name, cases in _load_vectors("cron").items()
    for index, case in enumerate(cases)
]


@pytest.mark.parametrize(("name", "case"), _CASES)
def test_vectors(name: str, case: dict[str, Any]) -> None:
    fn = getattr(cron, _snake(name))
    kwargs = {_snake(key): value for key, value in case.get("secenek", {}).items()}
    if case.get("hata"):
        with pytest.raises(CronError):
            fn(*case["girdi"], **kwargs)
    else:
        assert _plain(fn(*case["girdi"], **kwargs)) == case["cikti"]


def test_next_run_matches_brute_force() -> None:
    expressions = [
        "*/7 * * * *",
        "0 */5 * * 1-5",
        "15 3 1,15 * *",
        "0 0 1 * 1",
        "30 12 * NOV-DEC SAT,SUN",
        "*/20 9-17 * * *",
    ]
    start = datetime.fromisoformat("2026-11-16T10:07:00+03:00")
    for expression in expressions:
        schedule = parse_cron(expression)
        after = start
        for run in next_runs(schedule, start, 5):
            candidate = after.replace(second=0, microsecond=0) + timedelta(minutes=1)
            while not matches_cron(schedule, candidate):
                candidate += timedelta(minutes=1)
            assert run == candidate, expression
            after = run


def test_naive_datetime_rejected() -> None:
    with pytest.raises(CronError):
        next_run("* * * * *", datetime(2026, 11, 16, 10, 0))
