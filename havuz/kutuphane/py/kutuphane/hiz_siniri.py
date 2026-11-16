"""hiz_siniri — istek hızını sınırlar: jeton kovası (TokenBucket; patlamaya izin verir, ortalamayı sınırlar) ve
kayan pencere (SlidingWindowLimiter; "son 60 sn'de en çok 10 istek", anahtar başına). Saat dışarıdan verilir.
Süreler SANİYEDİR (TypeScript eşinde milisaniye). İş parçacığı güvenlidir (kilitli).

Kullanım:
    kova = TokenBucket(capacity=10, refill_per_second=2)        # 10'luk patlama, saniyede 2 ortalama
    if not kova.try_take(): return yanit(429, retry_after=kova.wait_time())
    pencere = SlidingWindowLimiter(limit=5, window=60)
    if not pencere.try_acquire(f"giris:{ip}"): return yanit(429)   # IP başına dakikada 5 giriş denemesi

Sınırlar: Bellek içidir; tek süreçte çalışır. Birden çok süreç/sunucu varsa sayaç paylaşılmaz (Redis gibi ortak
bir depo gerekir; gunicorn'un her işçisi ayrı sayar!). Kayan pencere her istek için bir zaman damgası tutar:
bellek = anahtar × limit. Uzun süre gelmeyen anahtarları `prune()` ile temizleyin. Varsayılan saat
`time.monotonic` (geri gitmez).

Genişletme: Yeni algoritma aynı yapıda bir sınıf olarak eklenir: `now` parametresi alır, kilit kullanır,
`try_acquire`/`retry_after` sunar; testi sahte saatle yazılır.
"""

from __future__ import annotations

import math
import threading
import time
from collections import deque
from collections.abc import Callable

__all__ = ["SlidingWindowLimiter", "TokenBucket"]


class TokenBucket:
    """Jeton kovası: `capacity` patlama, `refill_per_second` ortalama hız."""

    def __init__(
        self,
        *,
        capacity: float,
        refill_per_second: float,
        initial_tokens: float | None = None,
        now: Callable[[], float] = time.monotonic,
    ) -> None:
        if capacity <= 0 or refill_per_second <= 0:
            raise ValueError("capacity ve refill_per_second sıfırdan büyük olmalı.")
        self.capacity = capacity
        self.refill_per_second = refill_per_second
        self._now = now
        self._tokens = min(capacity if initial_tokens is None else initial_tokens, capacity)
        self._last = now()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        current = self._now()
        elapsed = max(0.0, current - self._last)
        self._tokens = min(self.capacity, self._tokens + elapsed * self.refill_per_second)
        self._last = max(self._last, current)

    def available(self) -> float:
        """Şu an kullanılabilir jeton (kesirli olabilir)."""
        with self._lock:
            self._refill()
            return self._tokens

    def try_take(self, count: float = 1) -> bool:
        """`count` jeton varsa alır ve True döner; yoksa hiçbir şey almaz, False döner."""
        with self._lock:
            self._refill()
            if count > self._tokens:
                return False
            self._tokens -= count
            return True

    def wait_time(self, count: float = 1) -> float:
        """`count` jetonun birikmesine kalan süre (sn); hemen alınabiliyorsa 0, kapasiteden büyükse inf."""
        if count > self.capacity:
            return math.inf
        with self._lock:
            self._refill()
            return 0.0 if count <= self._tokens else (count - self._tokens) / self.refill_per_second


class SlidingWindowLimiter:
    """Kayan pencere: her anahtar için son `window` saniyede en çok `limit` istek."""

    def __init__(
        self, *, limit: int, window: float, now: Callable[[], float] = time.monotonic
    ) -> None:
        if limit < 1 or window <= 0:
            raise ValueError("limit 1 veya daha büyük, window sıfırdan büyük olmalı.")
        self.limit = limit
        self.window = window
        self._now = now
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _recent(self, key: str, current: float) -> deque[float]:
        hits = self._hits.get(key)
        if hits is None:
            return deque()
        while hits and hits[0] <= current - self.window:
            hits.popleft()
        if not hits:
            del self._hits[key]
        return hits

    def try_acquire(self, key: str = "default") -> bool:
        """İzin varsa isteği kaydeder ve True döner."""
        with self._lock:
            current = self._now()
            hits = self._recent(key, current)
            if len(hits) >= self.limit:
                return False
            hits.append(current)
            self._hits[key] = hits
            return True

    def remaining(self, key: str = "default") -> int:
        """Penceredeki kalan hak."""
        with self._lock:
            return self.limit - len(self._recent(key, self._now()))

    def retry_after(self, key: str = "default") -> float:
        """Bir sonraki isteğe izin verilene kadar kalan süre (sn); şimdi izin varsa 0."""
        with self._lock:
            current = self._now()
            hits = self._recent(key, current)
            if len(hits) < self.limit:
                return 0.0
            return max(0.0, hits[len(hits) - self.limit] + self.window - current)

    def reset(self, key: str | None = None) -> None:
        """Bir anahtarın (ya da hepsinin) sayaçlarını siler."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)

    def prune(self) -> int:
        """Penceresi dolmuş anahtarları bellekten atar; kaç anahtar silindiğini döner."""
        with self._lock:
            before = len(self._hits)
            current = self._now()
            for key in list(self._hits):
                self._recent(key, current)
            return before - len(self._hits)
