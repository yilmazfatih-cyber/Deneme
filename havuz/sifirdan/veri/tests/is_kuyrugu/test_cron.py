"""Cron ifadeleri: bilinen örnekler, hatalar ve atlamalı `next_after`'ın dakika dakika aramayla
aynılığı."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given
from hypothesis import strategies as st

from is_kuyrugu import Cron, CronError


def at(text: str) -> datetime:
    return datetime.fromisoformat(text).replace(tzinfo=UTC)


@pytest.mark.parametrize(
    ("expression", "start", "expected"),
    [
        ("*/15 * * * *", "2026-11-16 10:07", "2026-11-16 10:15"),
        ("*/15 * * * *", "2026-11-16 10:15", "2026-11-16 10:30"),  # KESİN sonrası
        ("0 9 * * 1-5", "2026-11-14 12:00", "2026-11-16 09:00"),  # Cumartesi → Pazartesi
        ("30 2 1 * *", "2026-11-16 00:00", "2026-12-01 02:30"),
        ("0 0 29 2 *", "2026-03-01 00:00", "2028-02-29 00:00"),  # artık yıl
        ("0 12 13 * 5", "2026-11-14 00:00", "2026-11-20 12:00"),  # 13'ü YA DA Cuma (Vixie)
        ("5,35 8-9 * * *", "2026-11-16 08:36", "2026-11-16 09:05"),
        ("0 0 * * 7", "2026-11-16 00:00", "2026-11-22 00:00"),  # 7 = Pazar
        ("@daily", "2026-12-31 23:59", "2027-01-01 00:00"),
    ],
)
def test_known_next_times(expression: str, start: str, expected: str) -> None:
    assert Cron.parse(expression).next_after(at(start)) == at(expected)


@pytest.mark.parametrize(
    ("expression", "message"),
    [
        ("* * * *", "5 alan"),
        ("60 * * * *", "0–59"),
        ("*/0 * * * *", "pozitif"),
        ("a * * * *", "anlaşılmadı"),
        ("5-2 * * * *", "aralığında"),
    ],
)
def test_errors_are_explained(expression: str, message: str) -> None:
    with pytest.raises(CronError, match=message):
        Cron.parse(expression)


FIELD = st.one_of(
    st.just("*"),
    st.integers(1, 6).map(lambda n: f"*/{n}"),
    st.lists(st.integers(0, 6), min_size=1, max_size=3, unique=True).map(
        lambda xs: ",".join(map(str, sorted(xs)))
    ),
)


@given(
    minute=FIELD,
    hour=FIELD,
    weekday=st.one_of(st.just("*"), st.integers(0, 6).map(str)),
    day=st.one_of(st.just("*"), st.integers(1, 28).map(str)),
    start=st.datetimes(datetime(2026, 1, 1), datetime(2027, 12, 31)),
)
def test_next_after_equals_minute_by_minute_search(
    minute: str, hour: str, weekday: str, day: str, start: datetime
) -> None:
    cron = Cron.parse(f"{minute} {hour} {day} * {weekday}")
    begin = start.replace(tzinfo=UTC)
    found = cron.next_after(begin)
    probe = begin.replace(second=0, microsecond=0) + timedelta(minutes=1)
    while not cron.matches(probe):  # kaba kuvvet başvuru: dakika dakika ilerle
        probe += timedelta(minutes=1)
    assert found == probe
