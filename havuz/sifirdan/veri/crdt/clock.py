"""Lamport saati: kopyalar arası toplam sıra veren mantıksal zaman damgası.

Damga = (sayaç, kopya_adı). Yerel her işlemde sayaç = görülen en büyük + 1; eşitlikte kopya adı
karar verir. Böylece "son yazan kazanır" her kopyada AYNI kazananı seçer (duvar saatine güvenmeden).

Genişletme: duvar saatine yakın damga isteniyorsa karma mantıksal saat (HLC) yazın: (fiziksel_ms,
sayaç, kopya); saat enjekte edilsin ki testler belirlenimci kalsın.
"""

from __future__ import annotations

Timestamp = tuple[int, str]
Json = None | bool | int | float | str


def as_timestamp(value: object) -> Timestamp:
    """Ağdan gelen işlemdeki damgayı doğrular (liste de olabilir: JSON'dan gelince)."""
    if (
        isinstance(value, tuple | list)
        and len(value) == 2
        and isinstance(value[0], int)
        and isinstance(value[1], str)
    ):
        return (value[0], value[1])
    raise ValueError(f"Geçersiz damga: {value!r} (beklenen: (sayaç, kopya))")


def as_json(value: object) -> Json:
    if value is None or isinstance(value, bool | int | float | str):
        return value
    raise ValueError(f"Değer JSON ilkel türü olmalı (None, bool, int, float, str): {value!r}")


class LamportClock:
    def __init__(self, replica: str) -> None:
        self.replica = replica
        self.counter = 0

    def tick(self) -> Timestamp:
        """Yeni bir yerel olay için damga."""
        self.counter += 1
        return (self.counter, self.replica)

    def observe(self, timestamp: Timestamp) -> None:
        """Uzaktan gelen damgayı gör: sonraki yerel damga ondan büyük olsun."""
        self.counter = max(self.counter, timestamp[0])
