"""Dizinli öncelik kuyruğu: öğenin önceliğini sonradan değiştirebilen (anahtar azaltma) min-heap.

Fikir:
    Düz ikili yığında bir öğenin yığındaki yeri bilinmez; önceliği değişince onu bulmak O(n) sürer.
    Burada yığının yanında "öğe → yığındaki konumu" sözlüğü tutulur ve her yer değiştirmede
    güncellenir. Böylece önceliği değişen öğenin konumu O(1)'de bulunur, yukarı ya da aşağı
    kaydırılarak yığın kuralı O(log n)'de onarılır.
    Dijkstra ve Prim'in ders kitabı sürümleri bu "anahtar azaltma" işlemine dayanır.

Karmaşıklık: push/pop/update/remove O(log n); contains/priority_of/peek O(1); yer O(n)
Ne zaman: kuyruktaki öğelerin önceliği değişiyorsa (Dijkstra, Prim, A*, zamanlayıcı iptali).
Ne zaman değil: öncelik hiç değişmiyorsa `heapq` yeter; Python'da "tembel silme" (eskiyi yok say)
    çoğu kez daha basittir.
Bağımlılık: yok
Genişletme: en büyük öncelik için öncelikleri eksiyle çarpıp verin.

Örnek:
    >>> pq = IndexedPriorityQueue[str]()
    >>> pq.push("a", 5)
    >>> pq.push("b", 3)
    >>> pq.update("a", 1)
    >>> pq.pop(), pq.peek(), "a" in pq
    (('a', 1), ('b', 3), False)
"""

from __future__ import annotations

from collections.abc import Hashable
from typing import Generic, TypeVar

T = TypeVar("T", bound=Hashable)


class IndexedPriorityQueue(Generic[T]):
    """Öğeleri benzersiz (hash'lenebilir) olan, önceliği güncellenebilen min-heap."""

    def __init__(self) -> None:
        self._heap: list[T] = []
        self._position: dict[T, int] = {}
        self._priority: dict[T, float] = {}

    def __len__(self) -> int:
        return len(self._heap)

    def __contains__(self, item: object) -> bool:
        return item in self._position

    def priority_of(self, item: T) -> float:
        """Öğenin şu anki önceliği."""
        return self._priority[item]

    def peek(self) -> tuple[T, float]:
        """En küçük öncelikli (öğe, öncelik) çiftini çıkarmadan döndürür."""
        if not self._heap:
            raise IndexError("boş kuyruğun en küçüğü yok")
        return self._heap[0], self._priority[self._heap[0]]

    def push(self, item: T, priority: float) -> None:
        """Yeni öğe ekler. Öğe zaten varsa hata verir; onun için `update` kullanın."""
        if item in self._position:
            raise ValueError(f"öğe zaten kuyrukta: {item!r} (önceliği değiştirmek için update)")
        self._heap.append(item)
        self._position[item] = len(self._heap) - 1
        self._priority[item] = priority
        self._sift_up(len(self._heap) - 1)

    def update(self, item: T, priority: float) -> None:
        """Öğenin önceliğini değiştirir (azaltma da artırma da olur)."""
        old = self._priority[item]
        self._priority[item] = priority
        if priority < old:
            self._sift_up(self._position[item])
        else:
            self._sift_down(self._position[item])

    def pop(self) -> tuple[T, float]:
        """En küçük öncelikli (öğe, öncelik) çiftini çıkarıp döndürür."""
        if not self._heap:
            raise IndexError("boş kuyruktan öğe çıkarılamaz")
        item = self._heap[0]
        return item, self.remove(item)

    def remove(self, item: T) -> float:
        """Öğeyi kuyruktan çıkarır; önceliğini döndürür."""
        index = self._position[item]
        last = len(self._heap) - 1
        self._swap(index, last)
        self._heap.pop()
        del self._position[item]
        priority = self._priority.pop(item)
        if index < last:  # araya gelen öğe hem yukarı hem aşağı gitmek isteyebilir
            self._sift_up(index)
            self._sift_down(index)
        return priority

    def _less(self, i: int, j: int) -> bool:
        return self._priority[self._heap[i]] < self._priority[self._heap[j]]

    def _swap(self, i: int, j: int) -> None:
        self._heap[i], self._heap[j] = self._heap[j], self._heap[i]
        self._position[self._heap[i]] = i
        self._position[self._heap[j]] = j

    def _sift_up(self, index: int) -> None:
        while index > 0:
            parent = (index - 1) // 2
            if not self._less(index, parent):
                break
            self._swap(index, parent)
            index = parent

    def _sift_down(self, index: int) -> None:
        size = len(self._heap)
        while True:
            smallest = index
            for child in (2 * index + 1, 2 * index + 2):
                if child < size and self._less(child, smallest):
                    smallest = child
            if smallest == index:
                return
            self._swap(index, smallest)
            index = smallest
