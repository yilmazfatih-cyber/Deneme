"""Çift bağlı liste: her düğümün hem öncekini hem sonrakini gösterdiği zincir.

Fikir:
    Her düğüm iki bağ taşır. Elinizde bir düğümün kendisi (tutamağı) varsa onu listeden
    çıkarmak yalnız komşularının bağlarını birbirine bağlamaktır: O(1). Uç durumları (boş liste,
    baş, son) ayrı ayrı ele almamak için listenin başına ve sonuna hiç silinmeyen bir "nöbetçi"
    düğüm konur; gerçek düğümlerin her zaman bir öncesi ve bir sonrası vardır.
    LRU önbellek, zamanlayıcı kuyrukları gibi "ortadan O(1) sil" isteyen yapılar bunun üstüne
    kurulur.

Karmaşıklık: iki uçtan ekleme/çıkarma O(1); tutamakla silme/araya ekleme O(1); arama O(n);
    yer O(n)
Ne zaman: ortadaki bir öğeyi tutamağıyla O(1) silmeniz/taşımanız gerekiyorsa.
Ne zaman değil: yalnız iki uçtan çalışıyorsanız `collections.deque` daha hızlı ve az bellek yer.
Bağımlılık: yok
Genişletme: yeni işlem eklerken yalnız `_link_after` ve `unlink` üstüne kurun; bağlarla elle
    oynamayın.

Örnek:
    >>> lst = DoublyLinkedList([1, 2, 3])
    >>> node = lst.push_back(4)
    >>> lst.unlink(node), lst.pop_front(), list(lst), list(lst.reversed())
    (4, 1, [2, 3], [3, 2])
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Generic, TypeVar, cast

T = TypeVar("T")


class ListNode(Generic[T]):
    """Liste düğümü; `push_*` işlemlerinin döndürdüğü tutamak."""

    __slots__ = ("next", "prev", "value")

    def __init__(self, value: T) -> None:
        self.value = value
        self.prev: ListNode[T] = self
        self.next: ListNode[T] = self


class DoublyLinkedList(Generic[T]):
    """Nöbetçi düğümlü, dairesel çift bağlı liste."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        # Nöbetçinin değeri hiç okunmaz; boş listede kendini gösterir.
        self._sentinel: ListNode[T] = ListNode(cast(T, None))
        self._size = 0
        for item in items:
            self.push_back(item)

    def __len__(self) -> int:
        return self._size

    def __iter__(self) -> Iterator[T]:
        node = self._sentinel.next
        while node is not self._sentinel:
            yield node.value
            node = node.next

    def reversed(self) -> Iterator[T]:
        """Sondan başa doğru dolaşır."""
        node = self._sentinel.prev
        while node is not self._sentinel:
            yield node.value
            node = node.prev

    def _link_after(self, anchor: ListNode[T], value: T) -> ListNode[T]:
        node = ListNode(value)
        node.prev, node.next = anchor, anchor.next
        anchor.next.prev = node
        anchor.next = node
        self._size += 1
        return node

    def push_front(self, value: T) -> ListNode[T]:
        """Başa ekler; düğüm tutamağını döndürür."""
        return self._link_after(self._sentinel, value)

    def push_back(self, value: T) -> ListNode[T]:
        """Sona ekler; düğüm tutamağını döndürür."""
        return self._link_after(self._sentinel.prev, value)

    def insert_after(self, node: ListNode[T], value: T) -> ListNode[T]:
        """Verilen düğümün hemen arkasına ekler."""
        return self._link_after(node, value)

    def unlink(self, node: ListNode[T]) -> T:
        """Tutamağı verilen düğümü O(1)'de listeden çıkarır ve değerini döndürür."""
        if node is self._sentinel or node.next is node:
            raise ValueError("bu düğüm listede değil (daha önce çıkarılmış olabilir)")
        node.prev.next = node.next
        node.next.prev = node.prev
        node.prev = node.next = node  # ikinci kez çıkarılırsa yakalansın
        self._size -= 1
        return node.value

    def pop_front(self) -> T:
        """Baştaki öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş listeden öğe çıkarılamaz")
        return self.unlink(self._sentinel.next)

    def pop_back(self) -> T:
        """Sondaki öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş listeden öğe çıkarılamaz")
        return self.unlink(self._sentinel.prev)
