"""Atlama listesi: katmanlı bağlı listelerle beklenen O(log n) arama yapan sıralı küme.

Fikir:
    En alt katman tüm anahtarları sıralı tutan bağlı listedir. Her düğüm yazı-tura ile bir üst
    katmana da "terfi eder" (olasılık 1/2); böylece her üst katmanda yaklaşık yarı kadar düğüm
    kalır ve üst katmanlar ekspres yol gibi çalışır. Arama en üst katmandan başlar: sonraki anahtar
    hedeften küçük oldukça ilerler, değilse bir kat aşağı iner. Beklenen adım sayısı O(log n).
    Ağaçlardaki döndürmeler yoktur; bu yüzden eşzamanlı (kilitsiz) sürümleri yazmak kolaydır
    (Redis'in sıralı kümeleri, LevelDB'nin bellek tablosu bunu kullanır).

Karmaşıklık: ekleme/silme/arama beklenen O(log n), en kötü O(n); yer beklenen O(n)
Ne zaman: dengeli ağaç kodu istemeden sıralı küme; eşzamanlı yapılara temel.
Ne zaman değil: en kötü durum güvencesi gerekiyorsa `avl_tree.py`.
Bağımlılık: yok
Genişletme: k. öğe sorgusu için her bağa "atladığı düğüm sayısı" (genişlik) alanı ekleyin.

Örnek:
    >>> import random
    >>> s = SkipList(rng=random.Random(3))
    >>> for k in [30, 10, 20]:
    ...     _ = s.insert(k)
    >>> list(s), 20 in s, s.remove(20), 20 in s
    ([10, 20, 30], True, True, False)
"""

from __future__ import annotations

import random
from collections.abc import Iterable, Iterator
from typing import Any, Generic, Protocol, TypeVar, cast


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


K = TypeVar("K", bound=_Comparable)

_MAX_LEVEL = 32  # 2^32 öğeye kadar beklenen davranış korunur


class _Node(Generic[K]):
    __slots__ = ("forward", "key")

    def __init__(self, key: K, level: int) -> None:
        self.key = key
        self.forward: list[_Node[K] | None] = [None] * level


class SkipList(Generic[K]):
    """Yinelenen anahtar tutmayan atlama listesi."""

    def __init__(self, keys: Iterable[K] = (), rng: random.Random | None = None) -> None:
        self._rng = rng if rng is not None else random.Random(0)
        self._head: _Node[K] = _Node(cast(K, None), _MAX_LEVEL)  # anahtarı hiç okunmaz
        self._level = 1  # kullanımdaki katman sayısı
        self._size = 0
        for key in keys:
            self.insert(key)

    def __len__(self) -> int:
        return self._size

    def _random_level(self) -> int:
        level = 1
        while level < _MAX_LEVEL and self._rng.random() < 0.5:
            level += 1
        return level

    def _predecessors(self, key: K) -> list[_Node[K]]:
        """Her katmanda anahtarı key'den küçük olan son düğüm."""
        update: list[_Node[K]] = [self._head] * _MAX_LEVEL
        node = self._head
        for level in reversed(range(self._level)):
            nxt = node.forward[level]
            while nxt is not None and nxt.key < key:
                node, nxt = nxt, nxt.forward[level]
            update[level] = node
        return update

    def __contains__(self, key: object) -> bool:
        target = cast(K, key)
        candidate = self._predecessors(target)[0].forward[0]
        return candidate is not None and not target < candidate.key

    def insert(self, key: K) -> bool:
        """Anahtarı ekler; zaten varsa False döndürür."""
        update = self._predecessors(key)
        candidate = update[0].forward[0]
        if candidate is not None and not key < candidate.key:
            return False
        level = self._random_level()
        self._level = max(self._level, level)
        node = _Node(key, level)
        for i in range(level):
            node.forward[i] = update[i].forward[i]
            update[i].forward[i] = node
        self._size += 1
        return True

    def remove(self, key: K) -> bool:
        """Anahtarı siler; yoksa False döndürür."""
        update = self._predecessors(key)
        node = update[0].forward[0]
        if node is None or key < node.key:
            return False
        for i in range(len(node.forward)):
            update[i].forward[i] = node.forward[i]
        while self._level > 1 and self._head.forward[self._level - 1] is None:
            self._level -= 1
        self._size -= 1
        return True

    def __iter__(self) -> Iterator[K]:
        node = self._head.forward[0]
        while node is not None:
            yield node.key
            node = node.forward[0]
