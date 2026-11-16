"""Kuyruk (FIFO): ilk giren ilk çıkar; dairesel tampon üstünde.

Fikir:
    Düz bir dizide baştan çıkarmak O(n)'dir (herkes bir sola kayar). Dairesel tamponda öğeler
    kaydırılmaz; bunun yerine "baş" dizini ilerler ve dizinin sonuna gelince başa sarar
    (`(baş + i) % kapasite`). Tampon dolunca iki katına büyütülür ve öğeler baştan sıraya
    dizilir. Böylece ekleme de çıkarma da amortize O(1) olur.

Karmaşıklık: enqueue/dequeue/peek amortize O(1); yer O(n)
Ne zaman: işleri geliş sırasıyla işlemek (BFS, iş kuyruğu, tampon) gerektiğinde.
Ne zaman değil: iki uçtan da ekleyip çıkaracaksanız `deque.py`; öncelik varsa `binary_heap.py`.
Bağımlılık: yok
Genişletme: sabit boyutlu "üzerine yazan" tampon için büyütme yerine `_head`'i ilerletin.

Örnek:
    >>> q = Queue([1, 2])
    >>> q.enqueue(3)
    >>> q.dequeue(), q.peek(), len(q), list(q)
    (1, 2, 2, [2, 3])
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Generic, TypeVar, cast

T = TypeVar("T")

_MIN_CAPACITY = 8


class Queue(Generic[T]):
    """Dairesel tamponlu kuyruk."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        self._buffer: list[T | None] = [None] * _MIN_CAPACITY
        self._head = 0  # en eski öğenin dizini
        self._size = 0
        for item in items:
            self.enqueue(item)

    def __len__(self) -> int:
        return self._size

    def __iter__(self) -> Iterator[T]:
        capacity = len(self._buffer)
        for offset in range(self._size):
            yield cast(T, self._buffer[(self._head + offset) % capacity])

    def is_empty(self) -> bool:
        return self._size == 0

    def enqueue(self, value: T) -> None:
        """Kuyruğun sonuna ekler."""
        if self._size == len(self._buffer):
            self._grow()
        self._buffer[(self._head + self._size) % len(self._buffer)] = value
        self._size += 1

    def dequeue(self) -> T:
        """En eski öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş kuyruktan öğe çıkarılamaz")
        value = cast(T, self._buffer[self._head])
        self._buffer[self._head] = None
        self._head = (self._head + 1) % len(self._buffer)
        self._size -= 1
        return value

    def peek(self) -> T:
        """En eski öğeyi çıkarmadan döndürür."""
        if self._size == 0:
            raise IndexError("boş kuyruğun başı yok")
        return cast(T, self._buffer[self._head])

    def _grow(self) -> None:
        ordered: list[T | None] = list(self)
        self._buffer = ordered + [None] * len(ordered)
        self._head = 0
