"""Çift uçlu kuyruk (deque): iki uçtan da O(1) ekleme/çıkarma, dizinle O(1) erişim.

Fikir:
    Kuyruktaki dairesel tampon fikrinin iki yönlü hâli: "baş" dizini hem ileri hem geri
    kayabilir. Başa eklemek için baş bir geri alınır (`(baş - 1) % kapasite`), sona eklemek için
    `baş + boyut` yuvası kullanılır. i. öğe her zaman `(baş + i) % kapasite` yuvasındadır; bu
    yüzden ortadaki öğeye de O(1)'de erişilir. Tampon dolunca iki katına büyütülür.

Karmaşıklık: iki uçtan ekleme/çıkarma amortize O(1); dizinle erişim O(1); yer O(n)
Ne zaman: kayan pencere, tekdüze kuyruk, 0-1 BFS gibi iki ucu da kullanan algoritmalarda.
Ne zaman değil: gerçek kodda `collections.deque` kullanın; bu dosya mantığı göstermek içindir.
Bağımlılık: yok
Genişletme: sabit boyutlu halka tampon istiyorsanız `_grow` yerine en eskiyi düşürün.

Örnek:
    >>> d = Deque([2, 3])
    >>> d.push_front(1)
    >>> d.push_back(4)
    >>> d.pop_front(), d.pop_back(), d[0], list(d)
    (1, 4, 2, [2, 3])
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Generic, TypeVar, cast

T = TypeVar("T")

_MIN_CAPACITY = 8


class Deque(Generic[T]):
    """Dairesel tamponlu çift uçlu kuyruk."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        self._buffer: list[T | None] = [None] * _MIN_CAPACITY
        self._head = 0
        self._size = 0
        for item in items:
            self.push_back(item)

    def __len__(self) -> int:
        return self._size

    def _slot(self, index: int) -> int:
        if index < 0:
            index += self._size
        if not 0 <= index < self._size:
            raise IndexError(f"dizin sınır dışında: {index} (uzunluk {self._size})")
        return (self._head + index) % len(self._buffer)

    def __getitem__(self, index: int) -> T:
        return cast(T, self._buffer[self._slot(index)])

    def __iter__(self) -> Iterator[T]:
        capacity = len(self._buffer)
        for offset in range(self._size):
            yield cast(T, self._buffer[(self._head + offset) % capacity])

    def push_back(self, value: T) -> None:
        """Sona ekler."""
        if self._size == len(self._buffer):
            self._grow()
        self._buffer[(self._head + self._size) % len(self._buffer)] = value
        self._size += 1

    def push_front(self, value: T) -> None:
        """Başa ekler."""
        if self._size == len(self._buffer):
            self._grow()
        self._head = (self._head - 1) % len(self._buffer)
        self._buffer[self._head] = value
        self._size += 1

    def pop_front(self) -> T:
        """Baştaki öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş kuyruktan öğe çıkarılamaz")
        value = cast(T, self._buffer[self._head])
        self._buffer[self._head] = None
        self._head = (self._head + 1) % len(self._buffer)
        self._size -= 1
        return value

    def pop_back(self) -> T:
        """Sondaki öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş kuyruktan öğe çıkarılamaz")
        slot = (self._head + self._size - 1) % len(self._buffer)
        value = cast(T, self._buffer[slot])
        self._buffer[slot] = None
        self._size -= 1
        return value

    def _grow(self) -> None:
        ordered: list[T | None] = list(self)
        self._buffer = ordered + [None] * len(ordered)
        self._head = 0
