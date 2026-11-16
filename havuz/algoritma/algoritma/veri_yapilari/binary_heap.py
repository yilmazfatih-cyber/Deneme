"""İkili yığın (min-heap): en küçük öğeyi O(1)'de gösteren, O(log n)'de çıkaran öncelik kuyruğu.

Fikir:
    Tam ikili ağaç bir dizide saklanır: i. düğümün çocukları 2i+1 ve 2i+2, ebeveyni (i-1)//2'dir.
    Yığın kuralı: her düğümün anahtarı çocuklarınınkinden küçük ya da eşittir; bu yüzden en küçük
    öğe hep 0. sıradadır. Ekleme: sona koy, ebeveyninden küçük oldukça yukarı kaydır. Çıkarma:
    kökü al, son öğeyi köke koy, küçük çocuğuyla yer değiştirerek aşağı kaydır.
    Hazır bir diziden kurarken (heapify) sondan başa aşağı kaydırmak toplamda O(n) sürer.

Karmaşıklık: push/pop O(log n); peek O(1); diziden kurma O(n); yer O(n)
Ne zaman: sürekli "şu anki en küçük/en büyük" gerekiyorsa (Dijkstra, olay benzetimi, en iyi k öğe).
Ne zaman değil: öğenin önceliği sonradan değişecekse `indexed_priority_queue.py`; gerçek kodda
    düz sayılar için `heapq` daha hızlıdır.
Bağımlılık: yok
Genişletme: en büyük yığın için `key=lambda x: -x` verin; eşitlikte sıra güvencesi yoktur.

Örnek:
    >>> h = BinaryHeap([5, 1, 4])
    >>> h.push(2)
    >>> h.pop(), h.peek(), len(h)
    (1, 2, 3)
    >>> words = BinaryHeap(["armut", "nar", "elma"], key=len)
    >>> words.pop()
    'nar'
"""

from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any, Generic, TypeVar

T = TypeVar("T")


class BinaryHeap(Generic[T]):
    """Anahtar fonksiyonlu min-heap. Karşılaştırma yalnız `key(öğe)` değerleri arasında yapılır."""

    def __init__(self, items: Iterable[T] = (), key: Callable[[T], Any] = lambda item: item):
        self._key = key
        self._items: list[T] = list(items)
        self._keys: list[Any] = [key(item) for item in self._items]
        for index in reversed(range(len(self._items) // 2)):  # Floyd: O(n) kurulum
            self._sift_down(index)

    def __len__(self) -> int:
        return len(self._items)

    def peek(self) -> T:
        """En küçük öğeyi çıkarmadan döndürür."""
        if not self._items:
            raise IndexError("boş yığının en küçüğü yok")
        return self._items[0]

    def push(self, item: T) -> None:
        """Öğeyi ekler."""
        self._items.append(item)
        self._keys.append(self._key(item))
        self._sift_up(len(self._items) - 1)

    def pop(self) -> T:
        """En küçük öğeyi çıkarıp döndürür."""
        if not self._items:
            raise IndexError("boş yığından öğe çıkarılamaz")
        top = self._items[0]
        last_item, last_key = self._items.pop(), self._keys.pop()
        if self._items:
            self._items[0], self._keys[0] = last_item, last_key
            self._sift_down(0)
        return top

    def _swap(self, i: int, j: int) -> None:
        self._items[i], self._items[j] = self._items[j], self._items[i]
        self._keys[i], self._keys[j] = self._keys[j], self._keys[i]

    def _sift_up(self, index: int) -> None:
        while index > 0:
            parent = (index - 1) // 2
            if not self._keys[index] < self._keys[parent]:
                break
            self._swap(index, parent)
            index = parent

    def _sift_down(self, index: int) -> None:
        size = len(self._items)
        while True:
            smallest = index
            for child in (2 * index + 1, 2 * index + 2):
                if child < size and self._keys[child] < self._keys[smallest]:
                    smallest = child
            if smallest == index:
                return
            self._swap(index, smallest)
            index = smallest
