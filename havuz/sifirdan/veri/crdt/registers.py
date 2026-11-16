"""Son yazan kazanır: LWW-Register (tek değer) ve LWW-Map (anahtar başına LWW, silme işaretli).

Her yazma bir Lamport damgası taşır; birleşimde damgası büyük olan kalır. Damgalar toplam sıralı
olduğu için her kopya aynı kazananı seçer. Eşzamanlı iki yazmadan biri KAYBOLUR (tasarım gereği).
Silme, damgalı bir "silindi" işaretidir; daha eski bir yazma silinmiş anahtarı diriltemez.

Genişletme: kaybolan yazmayı istemiyorsanız MV-Register (eşzamanlı değerlerin hepsini tutup
kullanıcıya seçtiren) yazın: değer yerine {damga: değer} kümesi ve sürüm vektörü.
"""

from __future__ import annotations

from .clock import Json, LamportClock, Timestamp, as_json, as_timestamp

Op = tuple[object, ...]
_ZERO: Timestamp = (0, "")


class LWWRegister:
    def __init__(self, replica: str) -> None:
        self.clock = LamportClock(replica)
        self.current: Json = None
        self.timestamp: Timestamp = _ZERO

    def set(self, value: Json) -> Op:
        op: Op = ("set", value, self.clock.tick())
        self.apply(op)
        return op

    def apply(self, op: Op) -> None:
        _, value, timestamp = op
        self._offer(as_json(value), as_timestamp(timestamp))

    def _offer(self, value: Json, timestamp: Timestamp) -> None:
        self.clock.observe(timestamp)
        if timestamp > self.timestamp:
            self.current, self.timestamp = value, timestamp

    def merge(self, other: LWWRegister) -> None:
        self._offer(other.current, other.timestamp)

    def value(self) -> Json:
        return self.current

    def state(self) -> object:
        return (self.timestamp, self.current)


class LWWMap:
    def __init__(self, replica: str) -> None:
        self.clock = LamportClock(replica)
        self.entries: dict[
            str, tuple[Timestamp, bool, Json]
        ] = {}  # anahtar → (damga, canlı, değer)

    def set(self, key: str, value: Json) -> Op:
        op: Op = ("set", key, value, self.clock.tick())
        self.apply(op)
        return op

    def delete(self, key: str) -> Op:
        op: Op = ("del", key, None, self.clock.tick())
        self.apply(op)
        return op

    def apply(self, op: Op) -> None:
        kind, key, value, timestamp = op
        if not isinstance(key, str):
            raise ValueError(f"LWWMap anahtarı metin olmalı: {key!r}")
        self._offer(key, (as_timestamp(timestamp), kind == "set", as_json(value)))

    def _offer(self, key: str, entry: tuple[Timestamp, bool, Json]) -> None:
        self.clock.observe(entry[0])
        current = self.entries.get(key)
        if current is None or entry[0] > current[0]:
            self.entries[key] = entry

    def merge(self, other: LWWMap) -> None:
        for key, entry in other.entries.items():
            self._offer(key, entry)

    def value(self) -> dict[str, Json]:
        return {key: value for key, (_, alive, value) in self.entries.items() if alive}

    def get(self, key: str) -> Json:
        return self.value().get(key)

    def state(self) -> object:
        return sorted(self.entries.items())
