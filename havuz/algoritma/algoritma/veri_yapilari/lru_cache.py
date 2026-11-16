"""LRU önbellek: dolunca en uzun süredir kullanılmayan kaydı atan, O(1) işlemli önbellek.

Fikir:
    İki yapı birlikte çalışır: anahtar → düğüm sözlüğü (O(1) bulma) ve kullanım sırasını tutan
    çift bağlı liste (O(1) yer değiştirme). Bir kayıt okunduğunda ya da yazıldığında listenin en
    başına (en yeni) taşınır; yer gerektiğinde listenin en sonundaki (en eski) kayıt atılır.
    Liste, uç durumları ortadan kaldırmak için tek bir nöbetçi düğümle dairesel kurulmuştur.

Karmaşıklık: get/put O(1); yer O(kapasite)
Ne zaman: yakın zamanda kullanılanın yine kullanılacağı (zamansal yerellik) her önbellekte.
Ne zaman değil: fonksiyon sonucu önbelleği için `functools.lru_cache` hazırdır; erişim sıklığı
    yakınlıktan önemliyse `lfu_cache.py`.
Bağımlılık: yok
Genişletme: süre aşımı (TTL) için düğüme son kullanma zamanı ekleyip `get`'te denetleyin;
    saati parametreyle verin.

Örnek:
    >>> cache = LRUCache[str, int](2)
    >>> cache.put("a", 1)
    >>> cache.put("b", 2)
    >>> cache.get("a")
    1
    >>> cache.put("c", 3)  # en eski "b" atılır
    ('b', 2)
    >>> cache.get("b") is None, list(cache.keys())
    (True, ['c', 'a'])
"""

from __future__ import annotations

from collections.abc import Hashable, Iterator
from typing import Generic, TypeVar, cast

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")


class _Node(Generic[K, V]):
    __slots__ = ("key", "next", "prev", "value")

    def __init__(self, key: K, value: V) -> None:
        self.key = key
        self.value = value
        self.prev: _Node[K, V] = self
        self.next: _Node[K, V] = self


class LRUCache(Generic[K, V]):
    """Sabit kapasiteli LRU önbellek."""

    def __init__(self, capacity: int) -> None:
        if capacity < 0:
            raise ValueError("kapasite negatif olamaz")
        self._capacity = capacity
        self._nodes: dict[K, _Node[K, V]] = {}
        self._sentinel: _Node[K, V] = _Node(cast(K, None), cast(V, None))  # baş = sentinel.next

    def __len__(self) -> int:
        return len(self._nodes)

    def __contains__(self, key: object) -> bool:
        """Var mı? (Kullanım sırasını DEĞİŞTİRMEZ.)"""
        return key in self._nodes

    def _unlink(self, node: _Node[K, V]) -> None:
        node.prev.next = node.next
        node.next.prev = node.prev

    def _push_front(self, node: _Node[K, V]) -> None:
        node.prev, node.next = self._sentinel, self._sentinel.next
        self._sentinel.next.prev = node
        self._sentinel.next = node

    def get(self, key: K) -> V | None:
        """Değeri döndürür ve kaydı en yeni yapar; yoksa None."""
        node = self._nodes.get(key)
        if node is None:
            return None
        self._unlink(node)
        self._push_front(node)
        return node.value

    def put(self, key: K, value: V) -> tuple[K, V] | None:
        """Yazar; yer açmak için atılan (anahtar, değer) varsa onu döndürür."""
        node = self._nodes.get(key)
        if node is not None:
            node.value = value
            self._unlink(node)
            self._push_front(node)
            return None
        if self._capacity == 0:
            return (key, value)  # hiçbir şey saklanamaz: yeni kayıt hemen "atılır"
        evicted: tuple[K, V] | None = None
        if len(self._nodes) == self._capacity:
            oldest = self._sentinel.prev
            self._unlink(oldest)
            del self._nodes[oldest.key]
            evicted = (oldest.key, oldest.value)
        node = _Node(key, value)
        self._nodes[key] = node
        self._push_front(node)
        return evicted

    def keys(self) -> Iterator[K]:
        """Anahtarlar, en yeniden en eskiye."""
        node = self._sentinel.next
        while node is not self._sentinel:
            yield node.key
            node = node.next
