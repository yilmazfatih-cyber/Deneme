"""Bellek tablosu (memtable): son yazmaların sıralı, bellek içi kopyası.

Nokta okuma için bir `dict`, aralık taraması için `bisect` ile sıralı tutulan bir anahtar listesi.
Silme, değeri `None` olan bir girdi (silme işareti) olarak saklanır; çünkü daha eski bir SSTable'da
aynı anahtarın değeri olabilir ve silmenin onu "gölgelemesi" gerekir.

Genişletme: büyük bellek tabloları için listeyi bir atlamalı listeyle (skip list) değiştirin; arayüz
(`put`, `get`, `items`, `size_bytes`) aynı kalmalıdır.
"""

from __future__ import annotations

import bisect

# Girdi başına yaklaşık ek yük (bayt); yalnız boşaltma eşiğini hesaplamak için.
_ENTRY_OVERHEAD = 16


class MemTable:
    """Sıralı bellek tablosu. Değer `None` ise girdi bir silme işaretidir."""

    def __init__(self) -> None:
        self._data: dict[bytes, bytes | None] = {}
        self._keys: list[bytes] = []
        self.size_bytes = 0

    def __len__(self) -> int:
        return len(self._data)

    def put(self, key: bytes, value: bytes | None) -> None:
        if key in self._data:
            old = self._data[key]
            self.size_bytes -= len(old) if old is not None else 0
        else:
            bisect.insort(self._keys, key)
            self.size_bytes += len(key) + _ENTRY_OVERHEAD
        self._data[key] = value
        self.size_bytes += len(value) if value is not None else 0

    def get(self, key: bytes) -> tuple[bool, bytes | None]:
        """(bulundu_mu, değer) döndürür; silme işareti (True, None) olarak döner."""
        if key in self._data:
            return True, self._data[key]
        return False, None

    def items(
        self, start: bytes = b"", end: bytes | None = None
    ) -> list[tuple[bytes, bytes | None]]:
        """[start, end) aralığındaki girdilerin kopyası (silme işaretleri dahil), sıralı."""
        lo = bisect.bisect_left(self._keys, start)
        hi = len(self._keys) if end is None else bisect.bisect_left(self._keys, end)
        return [(key, self._data[key]) for key in self._keys[lo:hi]]
