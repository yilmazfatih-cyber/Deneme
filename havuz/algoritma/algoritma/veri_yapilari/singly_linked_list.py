"""Tek bağlı liste: her düğümün yalnız bir sonrakini gösterdiği zincir.

Fikir:
    Öğeler bellekte yan yana durmaz; her düğüm değerini ve bir sonraki düğümün adresini tutar.
    Başa ekleme/çıkarma yalnız bir bağı değiştirir (O(1)); dizideki gibi kaydırma gerekmez.
    Kuyruk (tail) işaretçisi tutulduğu için sona ekleme de O(1)'dir. Bedeli: k. öğeye gitmek
    için baştan k adım yürümek gerekir ve sondan çıkarmak O(n)'dir (önceki düğüm bilinmez).
    Ters çevirme, üç işaretçiyle (önceki, şimdiki, sonraki) tek geçişte yerinde yapılır.

Karmaşıklık: başa/sona ekleme O(1); baştan çıkarma O(1); arama/silme/ters çevirme O(n); yer O(n)
Ne zaman: yalnız baştan ekleyip çıkarıyorsanız ya da bağlı yapı mantığını öğretiyorsanız.
Ne zaman değil: rastgele erişim gerekiyorsa (`list`); iki uçtan işlem gerekiyorsa (`deque`).
Bağımlılık: yok
Genişletme: sondan O(1) çıkarma gerekiyorsa `doubly_linked_list.py` dosyasına geçin.

Örnek:
    >>> lst = SinglyLinkedList([1, 2, 3])
    >>> lst.push_front(0)
    >>> lst.reverse()
    >>> list(lst), lst.pop_front()
    ([3, 2, 1, 0], 3)
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Generic, TypeVar

T = TypeVar("T")


class _Node(Generic[T]):
    __slots__ = ("next", "value")

    def __init__(self, value: T, next_node: _Node[T] | None = None) -> None:
        self.value = value
        self.next = next_node


class SinglyLinkedList(Generic[T]):
    """Baş ve kuyruk işaretçili tek bağlı liste."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        self._head: _Node[T] | None = None
        self._tail: _Node[T] | None = None
        self._size = 0
        for item in items:
            self.push_back(item)

    def __len__(self) -> int:
        return self._size

    def __iter__(self) -> Iterator[T]:
        node = self._head
        while node is not None:
            yield node.value
            node = node.next

    def __contains__(self, value: object) -> bool:
        return any(item == value for item in self)

    def push_front(self, value: T) -> None:
        """Başa ekler."""
        self._head = _Node(value, self._head)
        if self._tail is None:
            self._tail = self._head
        self._size += 1

    def push_back(self, value: T) -> None:
        """Sona ekler (kuyruk işaretçisi sayesinde O(1))."""
        node = _Node(value)
        if self._tail is None:
            self._head = node
        else:
            self._tail.next = node
        self._tail = node
        self._size += 1

    def pop_front(self) -> T:
        """Baştaki öğeyi çıkarıp döndürür."""
        if self._head is None:
            raise IndexError("boş listeden öğe çıkarılamaz")
        node = self._head
        self._head = node.next
        if self._head is None:
            self._tail = None
        self._size -= 1
        return node.value

    def remove(self, value: T) -> bool:
        """Değere eşit ilk düğümü siler; sildiyse True döndürür."""
        previous: _Node[T] | None = None
        node = self._head
        while node is not None and node.value != value:
            previous, node = node, node.next
        if node is None:
            return False
        if previous is None:
            self._head = node.next
        else:
            previous.next = node.next
        if node is self._tail:
            self._tail = previous
        self._size -= 1
        return True

    def reverse(self) -> None:
        """Listeyi yerinde ters çevirir (ek bellek O(1))."""
        previous: _Node[T] | None = None
        node = self._head
        self._tail = self._head
        while node is not None:
            following = node.next
            node.next = previous
            previous, node = node, following
        self._head = previous
