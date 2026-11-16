"""Dinamik dizi: sonuna eklemesi amortize O(1) olan, kendiliğinden büyüyen dizi.

Fikir:
    Sabit kapasiteli bir blok tutulur. Blok dolunca iki katı büyüklükte yeni blok açılır ve
    öğeler taşınır. Taşıma pahalıdır (O(n)) ama seyrek olur: n eklemede toplam taşıma
    n + n/2 + n/4 + … < 2n olduğundan ekleme başına ortalama (amortize) maliyet sabittir.
    Doluluk dörtte bire düşünce blok yarıya iner; eşikler farklı seçilir ki "bir ekle bir sil"
    salınımı her adımda taşıma yaptırmasın.

Karmaşıklık: erişim O(1); sona ekleme/çıkarma amortize O(1); araya ekleme/silme O(n); yer O(n)
Ne zaman: `list`'in içeride nasıl çalıştığını anlamak ya da aynı yapıyı başka dile taşımak için.
Ne zaman değil: gerçek Python kodunda doğrudan `list` kullanın (C ile yazılmıştır, çok daha hızlı).
Bağımlılık: yok
Genişletme: büyüme katsayısı `_GROWTH`, en küçük kapasite `_MIN_CAPACITY` sabitindedir.

Örnek:
    >>> a = DynamicArray([3, 1])
    >>> a.append(2)
    >>> a[0], len(a), a.pop(), list(a)
    (3, 3, 2, [3, 1])
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Generic, TypeVar, cast

T = TypeVar("T")

_MIN_CAPACITY = 4
_GROWTH = 2


class DynamicArray(Generic[T]):
    """Kendiliğinden büyüyüp küçülen dizi. Negatif dizinler `list` gibi sondan sayar."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        self._capacity = _MIN_CAPACITY
        self._size = 0
        self._data: list[T | None] = [None] * self._capacity
        for item in items:
            self.append(item)

    def __len__(self) -> int:
        return self._size

    @property
    def capacity(self) -> int:
        """Ayrılmış yuva sayısı (her zaman `len(self)`'ten büyük ya da eşit)."""
        return self._capacity

    def _locate(self, index: int) -> int:
        if index < 0:
            index += self._size
        if not 0 <= index < self._size:
            raise IndexError(f"dizin sınır dışında: {index} (uzunluk {self._size})")
        return index

    def __getitem__(self, index: int) -> T:
        return cast(T, self._data[self._locate(index)])

    def __setitem__(self, index: int, value: T) -> None:
        self._data[self._locate(index)] = value

    def __iter__(self) -> Iterator[T]:
        for i in range(self._size):
            yield cast(T, self._data[i])

    def append(self, value: T) -> None:
        """Sona ekler; blok doluysa önce iki katına büyütür."""
        if self._size == self._capacity:
            self._resize(self._capacity * _GROWTH)
        self._data[self._size] = value
        self._size += 1

    def pop(self) -> T:
        """Son öğeyi çıkarıp döndürür."""
        if self._size == 0:
            raise IndexError("boş diziden öğe çıkarılamaz")
        self._size -= 1
        value = cast(T, self._data[self._size])
        self._data[self._size] = None  # başvuruyu bırak (bellek sızmasın)
        self._shrink_if_sparse()
        return value

    def insert(self, index: int, value: T) -> None:
        """`index` konumuna ekler; sonraki öğeleri bir sağa kaydırır (O(n))."""
        if index < 0:
            index = max(0, index + self._size)
        index = min(index, self._size)
        if self._size == self._capacity:
            self._resize(self._capacity * _GROWTH)
        for i in range(self._size, index, -1):
            self._data[i] = self._data[i - 1]
        self._data[index] = value
        self._size += 1

    def remove_at(self, index: int) -> T:
        """`index` konumundaki öğeyi çıkarır; sonrakileri bir sola kaydırır (O(n))."""
        index = self._locate(index)
        value = cast(T, self._data[index])
        for i in range(index, self._size - 1):
            self._data[i] = self._data[i + 1]
        self._size -= 1
        self._data[self._size] = None
        self._shrink_if_sparse()
        return value

    def _shrink_if_sparse(self) -> None:
        if self._capacity > _MIN_CAPACITY and self._size * 4 <= self._capacity:
            self._resize(max(_MIN_CAPACITY, self._capacity // _GROWTH))

    def _resize(self, capacity: int) -> None:
        fresh: list[T | None] = [None] * capacity
        for i in range(self._size):
            fresh[i] = self._data[i]
        self._data = fresh
        self._capacity = capacity
