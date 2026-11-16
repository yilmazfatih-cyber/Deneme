"""onbellek — boyut sınırlı (LRU: en uzun süre kullanılmayan atılır) ve süreli (TTL) bellek içi önbellek.
Süreler SANİYEDİR (TypeScript eşinde milisaniye). İş parçacığı güvenlidir (kilitli).

Kullanım:
    cache: LruCache[str, Kullanici] = LruCache(max_size=500, ttl=60)
    cache.set("42", kullanici)
    cache.get("42")                                    # süresi dolduysa None
    k = cache.get_or_set("42", lambda: db.kullanici("42"))
    cache.set("gecici", deger, ttl=5)                  # anahtar başına süre

Sınırlar: Tek süreç belleğidir; süreçler arasında paylaşılmaz. Boyut ÖĞE sayısıdır (bayt değil). Süresi dolan öğeler
okunurken ya da `purge_expired()` çağrılınca silinir. `get_or_set` aynı anahtar için eşzamanlı yüklemeleri teke
İNDİRMEZ (yükleme kilit dışında yapılır ki önbellek kilitlenmesin); bu TypeScript eşindeki `getOrSetAsync`'ten farktır.
`None` değer saklanabilir ama `get` ile "yok"tan ayırmak için `has` kullanın.

Genişletme: Atılma bildirimi için `on_evict` verin (neden: "size" | "expired" | "deleted" | "cleared"). Yeni özellik
eklerken saat `now` ile verilmeye devam etmeli ki test sahte saatle yazılsın.
"""

from __future__ import annotations

import math
import threading
import time
from collections import OrderedDict
from collections.abc import Callable
from typing import Generic, Literal, TypeVar

__all__ = ["EvictReason", "LruCache"]

K = TypeVar("K")
V = TypeVar("V")
EvictReason = Literal["size", "expired", "deleted", "cleared"]


class LruCache(Generic[K, V]):
    """LRU + TTL önbellek."""

    def __init__(
        self,
        *,
        max_size: int,
        ttl: float | None = None,
        now: Callable[[], float] = time.monotonic,
        on_evict: Callable[[K, V, EvictReason], None] | None = None,
    ) -> None:
        if isinstance(max_size, bool) or not isinstance(max_size, int) or max_size < 1:
            raise ValueError("max_size 1 veya daha büyük bir tam sayı olmalı.")
        self._max_size = max_size
        self._ttl = ttl
        self._now = now
        self._on_evict = on_evict
        self._data: OrderedDict[K, tuple[V, float]] = OrderedDict()
        self._lock = threading.RLock()

    def _live(self, key: K) -> tuple[V, float] | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        if entry[1] <= self._now():
            del self._data[key]
            if self._on_evict:
                self._on_evict(key, entry[0], "expired")
            return None
        return entry

    def get(self, key: K, default: V | None = None) -> V | None:
        """Değeri verir ve "son kullanılan" yapar; yoksa ya da süresi dolduysa `default`."""
        with self._lock:
            entry = self._live(key)
            if entry is None:
                return default
            self._data.move_to_end(key)
            return entry[0]

    def peek(self, key: K, default: V | None = None) -> V | None:
        """Değeri verir ama kullanım sırasını değiştirmez."""
        with self._lock:
            entry = self._live(key)
            return default if entry is None else entry[0]

    def has(self, key: K) -> bool:
        with self._lock:
            return self._live(key) is not None

    def __contains__(self, key: object) -> bool:
        return self.has(key)  # type: ignore[arg-type]

    def set(self, key: K, value: V, *, ttl: float | None = None) -> None:
        with self._lock:
            life = ttl if ttl is not None else self._ttl
            expires = math.inf if life is None else self._now() + life
            self._data.pop(key, None)
            self._data[key] = (value, expires)
            while len(self._data) > self._max_size:
                old_key, (old_value, _) = self._data.popitem(last=False)
                if self._on_evict:
                    self._on_evict(old_key, old_value, "size")

    def delete(self, key: K) -> bool:
        with self._lock:
            entry = self._data.pop(key, None)
            if entry is None:
                return False
            if self._on_evict:
                self._on_evict(key, entry[0], "deleted")
            return True

    def clear(self) -> None:
        with self._lock:
            items = list(self._data.items())
            self._data.clear()
        if self._on_evict:
            for key, (value, _) in items:
                self._on_evict(key, value, "cleared")

    def purge_expired(self) -> int:
        """Süresi dolanları siler; kaç öğe silindiğini döner."""
        with self._lock:
            return sum(1 for key in list(self._data) if self._live(key) is None)

    def __len__(self) -> int:
        """Canlı öğe sayısı (önce süresi dolanlar temizlenir)."""
        with self._lock:
            self.purge_expired()
            return len(self._data)

    def keys(self) -> list[K]:
        """Canlı anahtarlar; en eski kullanılandan en yeniye."""
        with self._lock:
            self.purge_expired()
            return list(self._data)

    def get_or_set(self, key: K, factory: Callable[[], V], *, ttl: float | None = None) -> V:
        """Varsa döndürür; yoksa `factory` ile üretip yazar (hata fırlarsa hiçbir şey yazılmaz)."""
        with self._lock:
            entry = self._live(key)
            if entry is not None:
                self._data.move_to_end(key)
                return entry[0]
        value = factory()
        self.set(key, value, ttl=ttl)
        return value
