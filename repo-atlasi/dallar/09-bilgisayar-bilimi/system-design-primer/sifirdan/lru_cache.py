"""
LRU önbellek: sözlük + çift yönlü bağlı liste ile O(1) get/put.

Primer'deki karşılığı: "Cache" bölümü ve solutions/object_oriented_design/lru_cache/
(orada gövdeler `pass` ile bırakılmış bir mülakat taslağı var; burada çalışan ve test
edilen hâli). Sözlük "anahtar hangi düğümde?" sorusunu, bağlı liste "en eski kim?"
sorusunu O(1) yanıtlar. Baş/son nöbetçi (sentinel) düğümler sınır durumlarını siler.

Bu sınıf diğer modüllerde de kullanılır: önbellek stratejileri (cache_strategies.py)
ve istemci başına hız sınırlayıcı (rate_limiter.KeyedRateLimiter).
"""

from __future__ import annotations

from collections.abc import Hashable, Iterator
from dataclasses import dataclass, field
from typing import Any, Generic, TypeVar

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")


class _Node:
    __slots__ = ("key", "next", "prev", "value")

    def __init__(self, key: Any = None, value: Any = None) -> None:
        self.key = key
        self.value = value
        self.prev: _Node | None = None
        self.next: _Node | None = None


@dataclass
class CacheStats:
    hits: int = 0
    misses: int = 0
    evictions: int = 0

    @property
    def hit_ratio(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total else 0.0


@dataclass
class LRUCache(Generic[K, V]):
    """
    >>> cache = LRUCache(2)
    >>> cache.put("a", 1); cache.put("b", 2)
    >>> cache.get("a")
    1
    >>> cache.put("c", 3)       # kapasite aşıldı: en eski "b" atılır ve döndürülür
    'b'
    >>> cache.get("b") is None
    True
    >>> list(cache)             # en yeniden en eskiye
    ['c', 'a']
    """

    capacity: int
    stats: CacheStats = field(default_factory=CacheStats)

    def __post_init__(self) -> None:
        if self.capacity < 1:
            raise ValueError("kapasite en az 1 olmalı")
        self._map: dict[K, _Node] = {}
        self._head = _Node()  # en yeni tarafı
        self._tail = _Node()  # en eski tarafı
        self._head.next = self._tail
        self._tail.prev = self._head

    def __len__(self) -> int:
        return len(self._map)

    def __contains__(self, key: object) -> bool:
        # Üyelik sorgusu kullanım sırasını değiştirmez (bilerek).
        return key in self._map

    def __iter__(self) -> Iterator[K]:
        node = self._head.next
        while node is not self._tail:
            assert node is not None
            yield node.key
            node = node.next

    def get(self, key: K, default: V | None = None) -> V | None:
        node = self._map.get(key)
        if node is None:
            self.stats.misses += 1
            return default
        self.stats.hits += 1
        self._move_to_front(node)
        return node.value

    def put(self, key: K, value: V) -> K | None:
        """Ekler ya da günceller; atılan anahtarı (varsa) döndürür."""
        node = self._map.get(key)
        if node is not None:
            node.value = value
            self._move_to_front(node)
            return None
        node = _Node(key, value)
        self._map[key] = node
        self._link_front(node)
        if len(self._map) <= self.capacity:
            return None
        oldest = self._tail.prev
        assert oldest is not None and oldest is not self._head
        self._unlink(oldest)
        del self._map[oldest.key]
        self.stats.evictions += 1
        return oldest.key

    def delete(self, key: K) -> bool:
        node = self._map.pop(key, None)
        if node is None:
            return False
        self._unlink(node)
        return True

    def _unlink(self, node: _Node) -> None:
        assert node.prev is not None and node.next is not None
        node.prev.next = node.next
        node.next.prev = node.prev

    def _link_front(self, node: _Node) -> None:
        first = self._head.next
        assert first is not None
        node.prev, node.next = self._head, first
        first.prev = node
        self._head.next = node

    def _move_to_front(self, node: _Node) -> None:
        self._unlink(node)
        self._link_front(node)
