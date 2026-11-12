"""
Hız sınırlayıcılar (rate limiters): token kovası, sabit pencere, kayan pencere günlüğü,
kayan pencere sayacı ve istemci başına sınırlayıcı.

Primer'de ayrı bir bölüm değildir: "Additional system design interview questions"
tablosunda "Design an API rate limiter" (Stripe blog bağlantısı) olarak geçer; yakın konu
"Asynchronism > Back pressure" (kuyruk dolunca 503 ve üstel geri çekilme). Mülakatlarda
sık çıkan bir yapı taşıdır. Saat dışarıdan verilir (`clock`): testlerde sahte saat kullanır,
`time.sleep` beklemeden deterministik sonuç alırız.

| Algoritma              | Bellek (istemci başına) | Patlama (burst)        | Kesinlik          |
| ---------------------- | ----------------------- | ---------------------- | ----------------- |
| Token kovası           | O(1)                    | kapasite kadar izinli  | kesin             |
| Sabit pencere          | O(1)                    | sınırda 2 katına çıkar | kaba              |
| Kayan pencere günlüğü  | O(limit)                | yok                    | kesin             |
| Kayan pencere sayacı   | O(1)                    | küçük                  | yaklaşık          |
"""

from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Callable, Hashable
from typing import Protocol

from lru_cache import LRUCache

Clock = Callable[[], float]


class RateLimiter(Protocol):
    def allow(self, cost: int = 1) -> bool: ...


class TokenBucket:
    """
    Kovada en fazla `capacity` token olur; saniyede `refill_rate` token dolar. Her istek
    `cost` token harcar. Boş kova = ret. Kısa patlamalara izin verir, ortalamayı sınırlar.

    >>> now = [0.0]
    >>> bucket = TokenBucket(capacity=2, refill_rate=1.0, clock=lambda: now[0])
    >>> [bucket.allow() for _ in range(3)]
    [True, True, False]
    >>> now[0] = 1.0                   # bir saniye geçti: bir token doldu
    >>> bucket.allow(), bucket.allow()
    (True, False)
    """

    def __init__(self, capacity: float, refill_rate: float, clock: Clock = time.monotonic) -> None:
        if capacity <= 0 or refill_rate <= 0:
            raise ValueError("kapasite ve dolum hızı pozitif olmalı")
        self.capacity = capacity
        self.refill_rate = refill_rate
        self._clock = clock
        self._tokens = float(capacity)
        self._last = clock()

    @property
    def tokens(self) -> float:
        self._refill()
        return self._tokens

    def _refill(self) -> None:
        # Arka planda zamanlayıcı yok: dolumu her çağrıda geçen süreden "tembelce" hesaplarız.
        now = self._clock()
        self._tokens = min(self.capacity, self._tokens + (now - self._last) * self.refill_rate)
        self._last = now

    def allow(self, cost: int = 1) -> bool:
        self._refill()
        if self._tokens >= cost:
            self._tokens -= cost
            return True
        return False

    def retry_after(self, cost: int = 1) -> float:
        """Bu kadar saniye sonra `cost` token birikir (HTTP 429 Retry-After başlığı için)."""
        self._refill()
        return max(0.0, (cost - self._tokens) / self.refill_rate)


class FixedWindowCounter:
    """
    Zamanı sabit pencerelere böler ve her pencerede sayaç tutar. Basit ama kusurlu: pencere
    sınırının iki yanında 2 * limit isteğe izin verebilir (testte gösteriliyor).
    """

    def __init__(self, limit: int, window: float, clock: Clock = time.monotonic) -> None:
        self.limit, self.window, self._clock = limit, window, clock
        self._window_id = -1
        self._count = 0

    def allow(self, cost: int = 1) -> bool:
        window_id = math.floor(self._clock() / self.window)
        if window_id != self._window_id:
            self._window_id, self._count = window_id, 0
        if self._count + cost <= self.limit:
            self._count += cost
            return True
        return False


class SlidingWindowLog:
    """
    Son `window` saniyedeki kabul edilmiş isteklerin zaman damgalarını tutar. Kesin sonuç verir,
    ama istemci başına `limit` kadar zaman damgası saklar.

    >>> now = [0.0]
    >>> log = SlidingWindowLog(limit=2, window=10.0, clock=lambda: now[0])
    >>> log.allow(), log.allow(), log.allow()
    (True, True, False)
    >>> now[0] = 10.0                  # ilk iki istek pencereden çıktı
    >>> log.allow()
    True
    """

    def __init__(self, limit: int, window: float, clock: Clock = time.monotonic) -> None:
        self.limit, self.window, self._clock = limit, window, clock
        self._stamps: deque[float] = deque()

    def allow(self, cost: int = 1) -> bool:
        now = self._clock()
        while self._stamps and self._stamps[0] <= now - self.window:
            self._stamps.popleft()
        if len(self._stamps) + cost <= self.limit:
            self._stamps.extend([now] * cost)
            return True
        return False


class SlidingWindowCounter:
    """
    Sabit pencerenin O(1) belleğini kayan pencereye yaklaştırır: önceki pencerenin sayacı,
    kayan pencereyle örtüşen oranı kadar ağırlıklandırılır:
        tahmin = önceki * (1 - geçen_kısım) + şimdiki
    """

    def __init__(self, limit: int, window: float, clock: Clock = time.monotonic) -> None:
        self.limit, self.window, self._clock = limit, window, clock
        self._window_id = 0
        self._current = 0
        self._previous = 0

    def estimate(self) -> float:
        now = self._clock()
        self._advance(now)
        elapsed = (now / self.window) - self._window_id
        return self._previous * (1 - elapsed) + self._current

    def _advance(self, now: float) -> None:
        window_id = math.floor(now / self.window)
        if window_id == self._window_id:
            return
        # Bir pencere ilerlediysek şimdiki önceki olur; daha fazlaysa ikisi de sıfırlanır.
        self._previous = self._current if window_id == self._window_id + 1 else 0
        self._current = 0
        self._window_id = window_id

    def allow(self, cost: int = 1) -> bool:
        if self.estimate() + cost <= self.limit:
            self._current += cost
            return True
        return False


class KeyedRateLimiter:
    """
    İstemci (IP, API anahtarı) başına ayrı sınırlayıcı. Sınırlayıcılar bir LRU önbellekte
    tutulur: milyonlarca farklı istemci belleği şişiremez, uzun süredir sessiz olan atılır.

    >>> now = [0.0]
    >>> limiter = KeyedRateLimiter(lambda: TokenBucket(1, 0.1, clock=lambda: now[0]), max_clients=100)
    >>> limiter.allow("10.0.0.1"), limiter.allow("10.0.0.1"), limiter.allow("10.0.0.2")
    (True, False, True)
    """

    def __init__(self, factory: Callable[[], RateLimiter], max_clients: int = 10_000) -> None:
        self._factory = factory
        self._limiters: LRUCache[Hashable, RateLimiter] = LRUCache(max_clients)

    def allow(self, client: Hashable, cost: int = 1) -> bool:
        limiter = self._limiters.get(client)
        if limiter is None:
            limiter = self._factory()
            self._limiters.put(client, limiter)
        return limiter.allow(cost)

    def __len__(self) -> int:
        return len(self._limiters)
