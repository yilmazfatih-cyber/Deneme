"""Yığın (stack): son giren ilk çıkar; ayrıca en küçüğü O(1)'de söyleyen MinStack.

Fikir:
    Yığın yalnız tepesinden çalışır: `push` tepeye koyar, `pop` tepeden alır. Dinamik dizinin
    sonu tepe olarak kullanılırsa iki işlem de amortize O(1)'dir.
    MinStack her öğenin yanında "bu öğe ve altındakilerin en küçüğü"nü de saklar. Böylece tepe
    çıkarıldığında yeni en küçük değer yeniden hesaplanmaz, bir alttaki kayıtta hazır durur.
    Özyinelemeyi döngüye çevirirken (DFS, ifade ayrıştırma, geri al) açık yığın kullanılır.

Karmaşıklık: push/pop/peek amortize O(1); MinStack.minimum O(1); yer O(n)
Ne zaman: "en son açılanı önce kapat" düzeni: parantez eşleme, geri al, özyinelemesiz DFS.
Ne zaman değil: ilk giren ilk çıkacaksa kuyruk (`fifo_queue.py`) kullanın.
Bağımlılık: yok
Genişletme: MaxStack için `MinStack` içindeki `min` çağrısını `max` yapmanız yeter.

Örnek:
    >>> s = Stack([1, 2])
    >>> s.push(3)
    >>> s.pop(), s.peek(), len(s)
    (3, 2, 2)
    >>> m = MinStack()
    >>> for x in (5, 2, 7):
    ...     m.push(x)
    >>> m.minimum(), m.pop(), m.pop(), m.minimum()
    (2, 7, 2, 5)
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Generic, TypeVar

T = TypeVar("T")


class Stack(Generic[T]):
    """Dizi tabanlı yığın; dizinin sonu tepedir."""

    def __init__(self, items: Iterable[T] = ()) -> None:
        self._items: list[T] = list(items)

    def __len__(self) -> int:
        return len(self._items)

    def is_empty(self) -> bool:
        return not self._items

    def push(self, value: T) -> None:
        """Tepeye koyar."""
        self._items.append(value)

    def pop(self) -> T:
        """Tepedeki öğeyi çıkarıp döndürür."""
        if not self._items:
            raise IndexError("boş yığından öğe çıkarılamaz")
        return self._items.pop()

    def peek(self) -> T:
        """Tepedeki öğeyi çıkarmadan döndürür."""
        if not self._items:
            raise IndexError("boş yığının tepesi yok")
        return self._items[-1]


class MinStack:
    """Tam sayı/ondalık yığını; o anki en küçük değeri O(1)'de verir."""

    def __init__(self) -> None:
        self._items: list[tuple[float, float]] = []  # (değer, buraya kadarki en küçük)

    def __len__(self) -> int:
        return len(self._items)

    def push(self, value: float) -> None:
        lowest = value if not self._items else min(value, self._items[-1][1])
        self._items.append((value, lowest))

    def pop(self) -> float:
        if not self._items:
            raise IndexError("boş yığından öğe çıkarılamaz")
        return self._items.pop()[0]

    def minimum(self) -> float:
        """Yığındaki en küçük değer."""
        if not self._items:
            raise IndexError("boş yığının en küçüğü yok")
        return self._items[-1][1]
