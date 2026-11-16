"""Açık adreslemeli hash tablosu: çakışmada sıradaki boş yuvaya bak (doğrusal sondalama).

Fikir:
    Anahtarın hash değeri bir yuva numarasına indirgenir. Yuva doluysa sırayla sonraki yuvalara
    bakılır; arama da aynı yolu izler ve ilk BOŞ yuvada durur. Silinen yuva BOŞ yapılamaz, çünkü
    arkasındaki anahtarlara giden yol kopar; bunun yerine "mezar taşı" (SİLİNDİ) bırakılır.
    Dolu + mezar taşı oranı 1/2'yi geçince tablo yeniden kurulur: canlı öğe çoksa kapasite iki
    katına çıkar, değilse aynı boyutta kalıp yalnız mezar taşları temizlenir.
    Kapasite 2'nin kuvvetidir; böylece `hash % kapasite` yerine hızlı `hash & (kapasite - 1)`
    yeter.

Karmaşıklık: ekleme/arama/silme ortalama O(1), en kötü O(n); yeniden boyutlama amortize O(1);
    yer O(n)
Ne zaman: `dict`'in nasıl çalıştığını anlamak ya da önbellek dostu bir tabloyu başka dile
    taşımak için.
Ne zaman değil: gerçek Python kodunda `dict` kullanın. Sıralı gezinme gerekiyorsa dengeli
    ağaç seçin.
Bağımlılık: yok
Genişletme: sondalama düzenini değiştirmek için yalnız `_find` içindeki adım satırını düzenleyin.

Örnek:
    >>> t = OpenAddressingHashTable[str, int]()
    >>> t["elma"] = 3
    >>> t["armut"] = 5
    >>> del t["elma"]
    >>> t["armut"], "elma" in t, len(t), t.get("elma", 0)
    (5, False, 1, 0)
"""

from __future__ import annotations

from collections.abc import Hashable, Iterator
from typing import Generic, TypeVar, cast

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")

_EMPTY, _USED, _DELETED = 0, 1, 2
_MIN_CAPACITY = 8


class OpenAddressingHashTable(Generic[K, V]):
    """Doğrusal sondalamalı, mezar taşlı hash tablosu."""

    def __init__(self) -> None:
        self._capacity = _MIN_CAPACITY
        self._state = [_EMPTY] * self._capacity
        self._keys: list[K | None] = [None] * self._capacity
        self._values: list[V | None] = [None] * self._capacity
        self._size = 0  # canlı öğe sayısı
        self._filled = 0  # canlı + mezar taşı

    def __len__(self) -> int:
        return self._size

    @property
    def capacity(self) -> int:
        return self._capacity

    def _find(self, key: K) -> tuple[bool, int]:
        """(bulundu mu, yuva). Bulunamadıysa yuva, anahtarın yazılabileceği ilk uygun yerdir."""
        mask = self._capacity - 1
        index = hash(key) & mask
        first_free = -1
        while self._state[index] != _EMPTY:  # doluluk <= 1/2 olduğundan döngü mutlaka biter
            if self._state[index] == _USED and self._keys[index] == key:
                return True, index
            if self._state[index] == _DELETED and first_free < 0:
                first_free = index
            index = (index + 1) & mask
        return False, (first_free if first_free >= 0 else index)

    def __contains__(self, key: object) -> bool:
        return self._find(cast(K, key))[0]

    def __getitem__(self, key: K) -> V:
        found, index = self._find(key)
        if not found:
            raise KeyError(key)
        return cast(V, self._values[index])

    def get(self, key: K, default: V) -> V:
        found, index = self._find(key)
        return cast(V, self._values[index]) if found else default

    def __setitem__(self, key: K, value: V) -> None:
        found, index = self._find(key)
        if found:
            self._values[index] = value
            return
        if self._state[index] == _EMPTY:
            self._filled += 1
        self._state[index] = _USED
        self._keys[index] = key
        self._values[index] = value
        self._size += 1
        if self._filled * 2 > self._capacity:
            self._rebuild()

    def __delitem__(self, key: K) -> None:
        found, index = self._find(key)
        if not found:
            raise KeyError(key)
        self._state[index] = _DELETED
        self._keys[index] = None
        self._values[index] = None
        self._size -= 1

    def items(self) -> Iterator[tuple[K, V]]:
        """Tüm (anahtar, değer) çiftleri; sıra yuva sırasıdır (anlamlı bir sıra değildir)."""
        for index in range(self._capacity):
            if self._state[index] == _USED:
                yield cast(K, self._keys[index]), cast(V, self._values[index])

    def _rebuild(self) -> None:
        pairs = list(self.items())
        capacity = self._capacity
        if self._size * 4 > capacity:  # canlı öğe çok: büyüt; değilse yalnız mezar taşlarını at
            capacity *= 2
        self._capacity = capacity
        self._state = [_EMPTY] * capacity
        self._keys = [None] * capacity
        self._values = [None] * capacity
        self._size = 0
        self._filled = 0
        for key, value in pairs:
            self[key] = value
