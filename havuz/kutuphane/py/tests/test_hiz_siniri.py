"""hiz_siniri modülünün testi: sahte saatle."""

from __future__ import annotations

import math

import pytest

from kutuphane.hiz_siniri import SlidingWindowLimiter, TokenBucket


class _Clock:
    def __init__(self, start: float = 0.0) -> None:
        self.time = start

    def now(self) -> float:
        return self.time


def test_token_bucket_burst_then_rate() -> None:
    clock = _Clock()
    bucket = TokenBucket(capacity=3, refill_per_second=2, now=clock.now)
    assert [bucket.try_take() for _ in range(4)] == [True, True, True, False]
    assert bucket.wait_time() == pytest.approx(0.5)
    clock.time = 0.499
    assert not bucket.try_take()
    clock.time = 0.5
    assert bucket.try_take()
    clock.time = 100
    assert bucket.available() == 3
    assert bucket.wait_time(4) == math.inf


def test_token_bucket_long_run_bound() -> None:
    clock = _Clock()
    bucket = TokenBucket(capacity=5, refill_per_second=10, now=clock.now)
    granted = 0
    for step in range(1, 1430):
        clock.time = step * 0.007
        granted += bucket.try_take()
    assert 95 <= granted <= 5 + 10 * 10.01


def test_clock_going_backwards_creates_no_tokens() -> None:
    clock = _Clock(1.0)
    bucket = TokenBucket(capacity=1, refill_per_second=1, now=clock.now)
    assert bucket.try_take()
    clock.time = 0.5
    assert not bucket.try_take()


def test_sliding_window() -> None:
    clock = _Clock()
    limiter = SlidingWindowLimiter(limit=2, window=1.0, now=clock.now)
    assert limiter.try_acquire("a")
    clock.time = 0.4
    assert limiter.try_acquire("a")
    assert not limiter.try_acquire("a")
    assert limiter.try_acquire("b")
    assert limiter.remaining("a") == 0
    assert limiter.retry_after("a") == pytest.approx(0.6)
    clock.time = 1.0
    assert limiter.try_acquire("a")


def test_sliding_window_brute_force() -> None:
    clock = _Clock()
    limiter = SlidingWindowLimiter(limit=3, window=0.1, now=clock.now)
    accepted: list[float] = []
    for i in range(2000):
        clock.time += ((i * 7919) % 23) / 1000
        if limiter.try_acquire():
            accepted.append(clock.time)
    for at in accepted:
        assert sum(1 for t in accepted if at - 0.1 < t <= at) <= 3


def test_prune_and_reset() -> None:
    clock = _Clock()
    limiter = SlidingWindowLimiter(limit=1, window=0.01, now=clock.now)
    limiter.try_acquire("x")
    limiter.try_acquire("y")
    clock.time = 0.02
    assert limiter.prune() == 2
    limiter.try_acquire("x")
    limiter.reset("x")
    assert limiter.try_acquire("x")
    with pytest.raises(ValueError):
        SlidingWindowLimiter(limit=0, window=1)
