"""Tembel (ilk kullanımda) ve iş parçacığı güvenli model yükleyici.

Ağır modeller (GLiNER, sentence-transformers, Whisper...) platform açılırken değil, ilk çağrıda yüklenir.
Yükleme başarısız olursa sonuç önbelleğe alınmaz; bir sonraki çağrı yeniden dener (ör. kurulum sonradan bitti).
"""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Generic, TypeVar

T = TypeVar("T")


class LazyModel(Generic[T]):
    def __init__(self, loader: Callable[[], T], name: str = "model") -> None:
        self._loader = loader
        self._name = name
        self._lock = threading.Lock()
        self._value: T | None = None
        self._loaded = False

    @property
    def loaded(self) -> bool:
        return self._loaded

    def get(self) -> T:
        if self._loaded:
            return self._value  # type: ignore[return-value]
        with self._lock:
            if not self._loaded:  # çift kontrol: aynı anda iki istek tek yükleme yapar
                self._value = self._loader()
                self._loaded = True
        return self._value  # type: ignore[return-value]

    def reset(self) -> None:
        with self._lock:
            self._value = None
            self._loaded = False

    def __repr__(self) -> str:  # pragma: no cover
        return f"LazyModel({self._name}, loaded={self._loaded})"


class LazyRegistry:
    """Anahtar başına bir LazyModel (ör. model yolu → yüklenmiş model)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, LazyModel] = {}

    def get(self, key: str, loader: Callable[[], T]) -> T:
        with self._lock:
            lm = self._items.get(key)
            if lm is None:
                lm = LazyModel(loader, name=key)
                self._items[key] = lm
        return lm.get()

    def clear(self) -> None:
        with self._lock:
            self._items.clear()
