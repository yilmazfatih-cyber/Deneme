"""Zincirlemeli hash tablosu: aynı yuvaya düşen anahtarlar küçük bir listede tutulur.

Fikir:
    Anahtarın hash değeri bir "kova" numarasına indirgenir; her kova, oraya düşen (anahtar, değer)
    çiftlerinin listesidir. Arama yalnız ilgili kovayı tarar. Öğe sayısı kova sayısını geçince
    (yük oranı > 1) kova sayısı iki katına çıkarılıp her öğe yeniden dağıtılır; böylece kovalar
    kısa kalır. Yük oranı 1/4'ün altına inince tablo yarıya küçülür.
    Açık adreslemeye göre silmesi basittir (mezar taşı gerekmez) ama işaretçi izlediğinden
    önbellek dostu değildir.

Karmaşıklık: ekleme/arama/silme ortalama O(1), en kötü O(n); yeniden boyutlama amortize O(1); yer O(n)
Ne zaman: silmenin çok olduğu, yük oranının 1'i aşabildiği tablolar; hash tablosu öğretimi.
Ne zaman değil: gerçek Python kodunda `dict` kullanın.
Bağımlılık: yok
Genişletme: kovayı liste yerine dengeli ağaç yaparsanız en kötü durum O(log n)'e iner.

Örnek:
    >>> t = ChainingHashTable[str, int]()
    >>> t["elma"] = 3
    >>> t["elma"] += 1
    >>> t["elma"], "kiraz" in t, sorted(t.items())
    (4, False, [('elma', 4)])
"""

from __future__ import annotations

from collections.abc import Hashable, Iterator
from typing import Generic, TypeVar

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")

_MIN_BUCKETS = 8


class ChainingHashTable(Generic[K, V]):
    """Kovaları Python listesi olan zincirlemeli hash tablosu."""

    def __init__(self) -> None:
        self._buckets: list[list[tuple[K, V]]] = [[] for _ in range(_MIN_BUCKETS)]
        self._size = 0

    def __len__(self) -> int:
        return self._size

    @property
    def bucket_count(self) -> int:
        return len(self._buckets)

    def _bucket(self, key: object) -> list[tuple[K, V]]:
        return self._buckets[hash(key) % len(self._buckets)]

    def __contains__(self, key: object) -> bool:
        return any(existing == key for existing, _ in self._bucket(key))

    def __getitem__(self, key: K) -> V:
        for existing, value in self._bucket(key):
            if existing == key:
                return value
        raise KeyError(key)

    def get(self, key: K, default: V) -> V:
        for existing, value in self._bucket(key):
            if existing == key:
                return value
        return default

    def __setitem__(self, key: K, value: V) -> None:
        bucket = self._bucket(key)
        for position, (existing, _) in enumerate(bucket):
            if existing == key:
                bucket[position] = (key, value)
                return
        bucket.append((key, value))
        self._size += 1
        if self._size > len(self._buckets):
            self._resize(len(self._buckets) * 2)

    def __delitem__(self, key: K) -> None:
        bucket = self._bucket(key)
        for position, (existing, _) in enumerate(bucket):
            if existing == key:
                bucket[position] = bucket[-1]  # sıra önemsiz: sonuncuyu buraya taşı, O(1) sil
                bucket.pop()
                self._size -= 1
                if len(self._buckets) > _MIN_BUCKETS and self._size * 4 < len(self._buckets):
                    self._resize(len(self._buckets) // 2)
                return
        raise KeyError(key)

    def items(self) -> Iterator[tuple[K, V]]:
        """Tüm (anahtar, değer) çiftleri; sıra anlamlı değildir."""
        for bucket in self._buckets:
            yield from bucket

    def _resize(self, bucket_count: int) -> None:
        pairs = list(self.items())
        self._buckets = [[] for _ in range(bucket_count)]
        for key, value in pairs:
            self._bucket(key).append((key, value))
