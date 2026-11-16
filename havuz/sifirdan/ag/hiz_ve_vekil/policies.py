"""Dayanıklılık politikaları: jeton kovası (hız sınırı), devre kesici, yeniden deneme bütçesi.

Jeton kovası:   kova `capacity` jeton alır, saniyede `rate` jeton dolar; her istek 1 jeton harcar.
                Kısa bir patlamaya (capacity kadar) izin verir, uzun vadede hızı `rate`'e sınırlar.
Devre kesici:   KAPALI ──(üst üste N hata)──▶ AÇIK ──(reset_timeout geçti)──▶ YARI-AÇIK ──(tek
deneme)
                   ▲                                                              │ başarılı →
                   KAPALI
                   └──────────────────────────────────────────────────────────────┘ hatalı → AÇIK
                Çöken arka uca istek yağdırmayı keser, toparlanma şansı verir.
Yeniden deneme bütçesi: denemeler, son `window` saniyedeki isteklerin en çok `ratio` kadarı (+ küçük
taban).
                Böylece arka uçlar zorlanırken yeniden denemeler yükü katlayıp "fırtına" yaratmaz.
Saat (`clock`) her sınıfa dışarıdan verilir; testler gerçek beklemeden çalışır.
Genişletme: yeni bir politika (ör. eşzamanlılık sınırı) için aynı kalıpta küçük bir sınıf + birim
test.
"""

from __future__ import annotations

import time
from collections import OrderedDict, deque
from collections.abc import Callable

Clock = Callable[[], float]


class TokenBucket:
    def __init__(self, rate: float, capacity: float, clock: Clock = time.monotonic) -> None:
        if rate <= 0 or capacity < 1:
            raise ValueError("rate > 0 ve capacity ≥ 1 olmalı.")
        self.rate, self.capacity, self.clock = rate, capacity, clock
        self.tokens = capacity
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def take(self, amount: float = 1.0) -> bool:
        self._refill()
        if self.tokens >= amount:
            self.tokens -= amount
            return True
        return False

    def retry_after(self, amount: float = 1.0) -> float:
        """Bir sonraki jetonun kaç saniye sonra hazır olacağı (Retry-After başlığı için)."""
        self._refill()
        return max(0.0, (amount - self.tokens) / self.rate)


class RateLimiter:
    """Anahtar (istemci IP) başına jeton kovası. Anahtar sayısı sınırlıdır (bellek tüketme
    saldırısı).
    """

    def __init__(
        self, rate: float, capacity: float, clock: Clock = time.monotonic, max_keys: int = 10_000
    ) -> None:
        self.rate, self.capacity, self.clock, self.max_keys = rate, capacity, clock, max_keys
        self._buckets: OrderedDict[str, TokenBucket] = OrderedDict()

    def __len__(self) -> int:
        return len(self._buckets)

    def allow(self, key: str) -> tuple[bool, float]:
        """(izin var mı, izin yoksa kaç saniye sonra)."""
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = self._buckets[key] = TokenBucket(self.rate, self.capacity, self.clock)
            if len(self._buckets) > self.max_keys:
                self._buckets.popitem(last=False)  # en uzun süredir görülmeyeni unut
        self._buckets.move_to_end(key)
        if bucket.take():
            return True, 0.0
        return False, bucket.retry_after()


class CircuitBreaker:
    CLOSED, OPEN, HALF_OPEN = "kapali", "acik", "yari-acik"

    def __init__(
        self, failure_threshold: int = 5, reset_timeout: float = 10.0, clock: Clock = time.monotonic
    ) -> None:
        self.failure_threshold, self.reset_timeout, self.clock = (
            failure_threshold,
            reset_timeout,
            clock,
        )
        self.state = self.CLOSED
        self.failures = 0
        self.opened_at = 0.0
        self._trial = False

    def available(self) -> bool:
        """İstek gönderilebilir mi? (Yarı-açık durumda aynı anda yalnız TEK deneme.)"""
        if self.state == self.OPEN and self.clock() - self.opened_at >= self.reset_timeout:
            self.state = self.HALF_OPEN
        if self.state == self.HALF_OPEN:
            return not self._trial
        return self.state == self.CLOSED

    def begin(self) -> None:
        if self.state == self.HALF_OPEN:
            self._trial = True

    def success(self) -> None:
        self.state, self.failures, self._trial = self.CLOSED, 0, False

    def failure(self) -> None:
        self.failures += 1
        self._trial = False
        if self.state == self.HALF_OPEN or self.failures >= self.failure_threshold:
            self.state, self.opened_at = self.OPEN, self.clock()


class RetryBudget:
    def __init__(
        self,
        ratio: float = 0.2,
        min_retries: int = 3,
        window: float = 10.0,
        clock: Clock = time.monotonic,
    ) -> None:
        self.ratio, self.min_retries, self.window, self.clock = ratio, min_retries, window, clock
        self._requests: deque[float] = deque()
        self._retries: deque[float] = deque()

    def _prune(self) -> None:
        horizon = self.clock() - self.window
        for events in (self._requests, self._retries):
            while events and events[0] < horizon:
                events.popleft()

    def record_request(self) -> None:
        self._requests.append(self.clock())

    def can_retry(self) -> bool:
        self._prune()
        return len(self._retries) < self.min_retries + self.ratio * len(self._requests)

    def record_retry(self) -> None:
        self._retries.append(self.clock())
