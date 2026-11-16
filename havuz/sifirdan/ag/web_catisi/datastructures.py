"""Küçük veri yapıları: `MultiDict` (aynı adla birden çok değer: "?etiket=a&etiket=b").

Genişletme: sık kullanılan bir dönüşüm (ör. `get_int`) gerekiyorsa buraya ekleyin ve test yazın.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator


class MultiDict:
    def __init__(self, items: Iterable[tuple[str, str]] = ()) -> None:
        self._data: dict[str, list[str]] = {}
        for key, value in items:
            self.add(key, value)

    def add(self, key: str, value: str) -> None:
        self._data.setdefault(key, []).append(value)

    def get(self, key: str, default: str | None = None) -> str | None:
        """İlk değer (yoksa `default`)."""
        values = self._data.get(key)
        return values[0] if values else default

    def get_all(self, key: str) -> list[str]:
        return list(self._data.get(key, []))

    def get_int(self, key: str, default: int | None = None) -> int | None:
        value = self.get(key)
        if value is None or not (value.isascii() and value.isdigit() and len(value) <= 18):
            return default
        return int(value)

    def __contains__(self, key: object) -> bool:
        return key in self._data

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def items(self) -> list[tuple[str, str]]:
        return [(k, v) for k, values in self._data.items() for v in values]

    def to_dict(self) -> dict[str, str]:
        """Her addan ilk değer."""
        return {k: values[0] for k, values in self._data.items()}

    def __repr__(self) -> str:
        return f"MultiDict({self.items()!r})"
