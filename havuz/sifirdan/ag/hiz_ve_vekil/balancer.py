"""Arka uç havuzu ve yük dengeleme stratejileri: sıralı, en az bağlantı, tutarlı karma.

    Sıralı (round robin): 1, 2, 3, 1, 2, 3 … — basit, eşit yük varsayar.
    En az bağlantı:       şu an en az isteği süren arka uç — yavaş isteklerde dengeyi korur.
    Tutarlı karma:        anahtar (ör. istemci IP) → halkada saat yönünde ilk arka uç; bir arka uç
                          düşünce YALNIZ onun anahtarları yer değiştirir (önbellek/oturum
                          yakınlığı).
                          Karma SHA-256'dır (Python'un `hash()`'i süreçten sürece değişir).
Strateji yalnız "uygun" adaylar arasından seçer; uygunluğu (sağlık, devre kesici) vekil belirler.
Genişletme: yeni strateji `choose(adaylar, anahtar) -> Backend | None` yöntemli bir sınıftır;
`make_strategy`'ye ekleyin.
"""

from __future__ import annotations

import bisect
import hashlib
from dataclasses import dataclass, field
from typing import Protocol

from hiz_ve_vekil.policies import CircuitBreaker


@dataclass(eq=False)
class Backend:
    host: str
    port: int
    healthy: bool = True
    active: int = 0  # şu an süren istek sayısı
    breaker: CircuitBreaker = field(default_factory=CircuitBreaker)

    @property
    def name(self) -> str:
        return f"{self.host}:{self.port}"

    def __repr__(self) -> str:
        return (
            f"<Backend {self.name} {'sağlıklı' if self.healthy else 'hasta'} {self.breaker.state}>"
        )


class Strategy(Protocol):
    def choose(self, candidates: list[Backend], key: str) -> Backend | None: ...


class RoundRobin:
    def __init__(self) -> None:
        self._counter = 0

    def choose(self, candidates: list[Backend], key: str) -> Backend | None:
        if not candidates:
            return None
        chosen = candidates[self._counter % len(candidates)]
        self._counter += 1
        return chosen


class LeastConnections:
    def choose(self, candidates: list[Backend], key: str) -> Backend | None:
        return min(candidates, key=lambda b: b.active, default=None)


def _hash(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:8], "big")


class ConsistentHash:
    def __init__(self, backends: list[Backend], replicas: int = 100) -> None:
        self._ring = sorted(
            (_hash(f"{b.name}#{i}"), index)
            for index, b in enumerate(backends)
            for i in range(replicas)
        )
        self._keys = [point for point, _ in self._ring]
        self._backends = backends

    def choose(self, candidates: list[Backend], key: str) -> Backend | None:
        if not candidates:
            return None
        allowed = {id(b) for b in candidates}
        start = bisect.bisect(self._keys, _hash(key))
        for step in range(len(self._ring)):
            backend = self._backends[self._ring[(start + step) % len(self._ring)][1]]
            if id(backend) in allowed:
                return backend
        return None


def make_strategy(name: str, backends: list[Backend]) -> Strategy:
    """Komut satırı adıyla strateji: "sirali", "en-az", "karma" (tutarlı karma arka uç listesini
    ister).
    """
    if name == "karma":
        return ConsistentHash(backends)
    return LeastConnections() if name == "en-az" else RoundRobin()
