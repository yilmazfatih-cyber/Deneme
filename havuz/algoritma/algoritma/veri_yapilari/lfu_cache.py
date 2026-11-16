"""LFU önbellek: dolunca en AZ kullanılan kaydı atan önbellek; eşitlikte en eskiyi atar, O(1).

Fikir:
    Her kaydın kullanım sayısı (sıklık) tutulur. Sıklık → o sıklıktaki anahtarlar (eklenme/son
    kullanım sırasıyla) eşlemi ve o anki en küçük sıklık (`min_freq`) birlikte tutulur. Bir kayıt
    kullanılınca kendi sıklık kovasından bir üstüne taşınır; eski kova boşaldıysa ve en küçük
    oysa `min_freq` bir artar. Yer gerektiğinde `min_freq` kovasının en eskisi atılır. Yeni
    kayıt sıklık 1 ile girer, dolayısıyla `min_freq` 1 olur. Her adım sabit sayıda sözlük işlemidir.

Karmaşıklık: get/put O(1); yer O(kapasite)
Ne zaman: bazı kayıtların sürekli, bazılarının bir kez kullanıldığı (popülerlik kalıcı) iş yükleri.
Ne zaman değil: popülerlik zamanla değişiyorsa eski sıklıklar kayıtları gereksiz yere tutar;
    LRU (`lru_cache.py`) ya da yaşlandırmalı LFU daha iyidir.
Bağımlılık: yok
Genişletme: yaşlandırma için belirli aralıklarla tüm sıklıkları yarıya indiren bir işlem ekleyin
    (kovaları yeniden kurmak gerekir).

Örnek:
    >>> cache = LFUCache[str, int](2)
    >>> cache.put("a", 1)
    >>> cache.put("b", 2)
    >>> cache.get("a")
    1
    >>> cache.put("c", 3)  # "b" bir kez kullanıldı, "a" iki kez: "b" atılır
    ('b', 2)
    >>> cache.get("b") is None, cache.frequency("a"), cache.frequency("c")
    (True, 2, 1)
"""

from __future__ import annotations

from collections import OrderedDict
from collections.abc import Hashable
from typing import Generic, TypeVar

K = TypeVar("K", bound=Hashable)
V = TypeVar("V")


class LFUCache(Generic[K, V]):
    """Sabit kapasiteli LFU önbellek (eşitlikte LRU)."""

    def __init__(self, capacity: int) -> None:
        if capacity < 0:
            raise ValueError("kapasite negatif olamaz")
        self._capacity = capacity
        self._values: dict[K, V] = {}
        self._freq: dict[K, int] = {}
        self._buckets: dict[int, OrderedDict[K, None]] = {}  # sıklık → anahtarlar (eskiden yeniye)
        self._min_freq = 0

    def __len__(self) -> int:
        return len(self._values)

    def __contains__(self, key: object) -> bool:
        return key in self._values

    def frequency(self, key: K) -> int:
        """Kaydın kullanım sayısı (yoksa 0)."""
        return self._freq.get(key, 0)

    def _touch(self, key: K) -> None:
        freq = self._freq[key]
        bucket = self._buckets[freq]
        del bucket[key]
        if not bucket:
            del self._buckets[freq]
            if self._min_freq == freq:
                self._min_freq = freq + 1
        self._freq[key] = freq + 1
        self._buckets.setdefault(freq + 1, OrderedDict())[key] = None

    def get(self, key: K) -> V | None:
        """Değeri döndürür ve sıklığını artırır; yoksa None."""
        if key not in self._values:
            return None
        self._touch(key)
        return self._values[key]

    def put(self, key: K, value: V) -> tuple[K, V] | None:
        """Yazar (yazma da bir kullanımdır); yer açmak için atılan kayıt varsa döndürür."""
        if key in self._values:
            self._values[key] = value
            self._touch(key)
            return None
        if self._capacity == 0:
            return (key, value)
        evicted: tuple[K, V] | None = None
        if len(self._values) == self._capacity:
            bucket = self._buckets[self._min_freq]
            old_key, _ = bucket.popitem(last=False)  # en az kullanılanların en eskisi
            if not bucket:
                del self._buckets[self._min_freq]
            evicted = (old_key, self._values.pop(old_key))
            del self._freq[old_key]
        self._values[key] = value
        self._freq[key] = 1
        self._buckets.setdefault(1, OrderedDict())[key] = None
        self._min_freq = 1
        return evicted
