"""yeniden_dene modülünün testi: sahte uyku/saat/rastgelelik ile gerçek bekleme yapılmaz."""

from __future__ import annotations

import asyncio
import threading
from datetime import UTC, datetime

import pytest

from kutuphane.yeniden_dene import (
    RetryCancelledError,
    RetryError,
    backoff_delay,
    is_retryable_http_status,
    parse_retry_after,
    retry,
    retry_async,
)


class _FakeClock:
    def __init__(self) -> None:
        self.time = 0.0
        self.delays: list[float] = []

    def now(self) -> float:
        return self.time

    def sleep(self, seconds: float) -> None:
        self.delays.append(seconds)
        self.time += seconds


class _HttpError(Exception):
    def __init__(self, status: int) -> None:
        super().__init__(f"HTTP {status}")
        self.status = status


def test_backoff_grows_and_caps() -> None:
    delays = [backoff_delay(n, min_delay=0.1, max_delay=1.0, jitter="none") for n in range(1, 7)]
    assert delays == pytest.approx([0.1, 0.2, 0.4, 0.8, 1.0, 1.0])
    assert backoff_delay(3, min_delay=0.1, random_value=0.5) == pytest.approx(0.2)
    assert backoff_delay(3, min_delay=0.1, jitter="equal", random_value=0) == pytest.approx(0.2)
    for _ in range(100):
        assert 0 <= backoff_delay(4, min_delay=0.1) < 0.8


def test_retries_until_success() -> None:
    clock = _FakeClock()
    calls: list[int] = []

    def flaky(attempt: int) -> str:
        calls.append(attempt)
        if attempt < 3:
            raise RuntimeError(f"geçici {attempt}")
        return "tamam"

    result = retry(flaky, sleep=clock.sleep, clock=clock.now, rng=lambda: 0.5, min_delay=0.1)
    assert result == "tamam"
    assert calls == [1, 2, 3]
    assert clock.delays == pytest.approx([0.05, 0.1])


def test_exhaustion_raises_retry_error() -> None:
    clock = _FakeClock()

    def always(attempt: int) -> None:
        raise RuntimeError(f"hata {attempt}")

    with pytest.raises(RetryError) as info:
        retry(always, retries=2, sleep=clock.sleep, clock=clock.now)
    assert info.value.attempts == 3
    assert str(info.value.__cause__) == "hata 3"
    assert len(info.value.errors) == 3


def test_non_retryable_error_is_raised_immediately() -> None:
    clock = _FakeClock()
    calls = 0

    def not_found(_attempt: int) -> None:
        nonlocal calls
        calls += 1
        raise _HttpError(404)

    def should_retry(error: Exception, _attempt: int) -> bool:
        return not isinstance(error, _HttpError) or is_retryable_http_status(error.status)

    with pytest.raises(_HttpError):
        retry(not_found, should_retry=should_retry, sleep=clock.sleep, clock=clock.now)
    assert calls == 1


def test_retry_after_is_capped_and_elapsed_limit_stops() -> None:
    clock = _FakeClock()
    seen: list[float] = []
    calls = 0

    def limited(_attempt: int) -> int:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise _HttpError(429)
        return 1

    retry(
        limited,
        max_delay=5,
        retry_after=lambda _e: 2.0 if calls == 1 else 9.0,
        on_retry=lambda _e, _n, delay: seen.append(delay),
        sleep=clock.sleep,
        clock=clock.now,
    )
    assert seen == [2.0, 5]
    clock2 = _FakeClock()
    with pytest.raises(RetryError):
        retry(
            lambda _n: 1 / 0,
            retries=10,
            min_delay=1,
            jitter="none",
            max_elapsed=3.5,
            sleep=clock2.sleep,
            clock=clock2.now,
        )
    assert clock2.delays == [1, 2]


def test_cancel_event_stops_waiting() -> None:
    cancel = threading.Event()
    timer = threading.Timer(0.05, cancel.set)
    timer.start()
    with pytest.raises(RetryCancelledError):
        retry(lambda _n: 1 / 0, min_delay=60, jitter="none", cancel=cancel)
    timer.cancel()


def test_async_variant() -> None:
    delays: list[float] = []

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)

    async def flaky(attempt: int) -> int:
        if attempt < 2:
            raise RuntimeError("geçici")
        return attempt

    assert asyncio.run(retry_async(flaky, sleep=fake_sleep, jitter="none", min_delay=0.5)) == 2
    assert delays == [0.5]


def test_parse_retry_after() -> None:
    assert parse_retry_after("120") == 120.0
    now = datetime(2026, 11, 16, 10, 0, tzinfo=UTC)
    assert parse_retry_after("Mon, 16 Nov 2026 10:00:30 GMT", now) == 30.0
    assert parse_retry_after("yarın", now) is None
    assert parse_retry_after(None) is None
