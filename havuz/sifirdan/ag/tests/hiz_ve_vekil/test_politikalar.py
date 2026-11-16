"""Politikalar ve dengeleyiciler: sahte saatle jeton kovası, devre kesici, bütçe; tutarlı karma
özelliği.
"""

from __future__ import annotations

from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from hiz_ve_vekil import (
    Backend,
    CircuitBreaker,
    ConsistentHash,
    LeastConnections,
    RateLimiter,
    RetryBudget,
    RoundRobin,
    TokenBucket,
    strip_hop_by_hop,
)
from http_sunucu import Headers


class Clock:
    def __init__(self) -> None:
        self.now = 100.0

    def __call__(self) -> float:
        return self.now


def test_jeton_kovasi_patlama_ve_dolma() -> None:
    clock = Clock()
    bucket = TokenBucket(rate=2, capacity=3, clock=clock)
    assert [bucket.take() for _ in range(4)] == [True, True, True, False]  # 3'lük patlama
    assert bucket.retry_after() == pytest.approx(0.5)
    clock.now += 0.5
    assert bucket.take() and not bucket.take()
    clock.now += 100
    assert sum(bucket.take() for _ in range(10)) == 3  # kapasiteden fazla birikmez
    with pytest.raises(ValueError, match="rate"):
        TokenBucket(rate=0, capacity=1)


def test_istemci_basina_sinir_ve_bellek_siniri() -> None:
    clock = Clock()
    limiter = RateLimiter(rate=1, capacity=1, clock=clock, max_keys=3)
    assert limiter.allow("1.1.1.1") == (True, 0.0)
    allowed, wait = limiter.allow("1.1.1.1")
    assert not allowed and wait == pytest.approx(1.0)
    assert limiter.allow("2.2.2.2")[0]  # başka istemci etkilenmez
    for index in range(10):
        limiter.allow(f"10.0.0.{index}")
    assert len(limiter) == 3  # sahte IP seli belleği doldurmaz


def test_devre_kesici_durumlari() -> None:
    clock = Clock()
    breaker = CircuitBreaker(failure_threshold=3, reset_timeout=10, clock=clock)
    for _ in range(2):
        breaker.failure()
    assert breaker.available() and breaker.state == "kapali"
    breaker.failure()
    assert breaker.state == "acik" and not breaker.available()
    clock.now += 10
    assert breaker.available() and breaker.state == "yari-acik"
    breaker.begin()
    assert not breaker.available()  # yarı-açıkta aynı anda tek deneme
    breaker.failure()
    assert breaker.state == "acik"  # deneme başarısız: yeniden açık
    clock.now += 10
    assert breaker.available()
    breaker.begin()
    breaker.success()
    assert breaker.state == "kapali" and breaker.failures == 0


def test_yeniden_deneme_butcesi() -> None:
    clock = Clock()
    budget = RetryBudget(ratio=0.1, min_retries=1, window=10, clock=clock)
    for _ in range(20):
        budget.record_request()
    allowed = 0
    while budget.can_retry():
        budget.record_retry()
        allowed += 1
    assert allowed == 3  # 1 + 0.1 × 20
    clock.now += 11
    assert budget.can_retry()  # pencere kaydı


def test_sirali_ve_en_az_baglanti() -> None:
    backends = [Backend("a", 1), Backend("b", 2), Backend("c", 3)]
    rr = RoundRobin()
    assert [rr.choose(backends, "") for _ in range(4)] == [*backends, backends[0]]
    backends[0].active, backends[1].active, backends[2].active = 5, 1, 3
    assert LeastConnections().choose(backends, "") is backends[1]
    assert RoundRobin().choose([], "") is None


@given(st.lists(st.text(min_size=1, max_size=12), min_size=50, max_size=200, unique=True))
def test_tutarli_karma_yalniz_dusenin_anahtarlari_tasinir(keys: list[str]) -> None:
    backends = [Backend(f"10.0.0.{i}", 80) for i in range(4)]
    ring = ConsistentHash(backends)
    before = {key: ring.choose(backends, key) for key in keys}
    survivors = backends[1:]
    after = {key: ring.choose(survivors, key) for key in keys}
    for key in keys:
        if before[key] is not backends[0]:
            assert after[key] is before[key]  # düşmeyen arka ucun anahtarları yerinde
        assert after[key] in survivors


def test_tutarli_karma_dengesi() -> None:
    backends = [Backend(f"10.0.0.{i}", 80) for i in range(4)]
    ring = ConsistentHash(backends)
    # type: ignore[union-attr]
    counts = Counter(ring.choose(backends, f"istemci-{i}").name for i in range(4000))
    assert min(counts.values()) > 600  # kabaca dengeli (ideal 1000)


def test_hop_by_hop_basliklar_atilir() -> None:
    headers = Headers(
        [
            ("Connection", "keep-alive, X-Gizli-Yetki"),
            ("Keep-Alive", "timeout=5"),
            ("X-Gizli-Yetki", "yonetici"),
            ("TE", "trailers"),
            ("Transfer-Encoding", "chunked"),
            ("Accept", "text/html"),
        ]
    )
    assert strip_hop_by_hop(headers).items() == [("Accept", "text/html")]
