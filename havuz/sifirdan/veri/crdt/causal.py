"""Nedensel teslim katmanı: işlem tabanlı CRDT'ler için "her işlem tam bir kez, nedenleri
kendisinden önce" teslim eder — ağ ne kadar karıştırırsa karıştırsın (sıra bozma, yineleme,
gecikme).

Her mesaj (kaynak, sıra_no, bağımlılıklar, işlem) taşır; bağımlılıklar = kaynağın gönderdiği anda
gördüğü sürüm vektörü. Alıcı bir mesajı ancak (1) kaynağın bir önceki mesajını teslim ettiyse ve
(2) bağımlılıkların hepsini görmüşse uygular; değilse tamponda bekletir. Görülmüş mesaj atılır.

Genişletme: kalıcı kopya için `delivered` vektörünü ve tamponu diske yazın; uzun süre kopuk kalan
kopyalar için işlem günlüğü yerine durum aktarımına (merge) geçen bir "yakalama" yolu ekleyin.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, Protocol, TypeVar

Op = tuple[object, ...]


class OpCRDT(Protocol):
    def apply(self, op: Op) -> None: ...


T = TypeVar("T", bound=OpCRDT)


@dataclass(frozen=True)
class Message:
    origin: str
    seq: int
    deps: tuple[tuple[str, int], ...]
    op: Op


class Replica(Generic[T]):
    def __init__(self, name: str, crdt: T) -> None:
        self.name = name
        self.crdt = crdt
        self.delivered: dict[str, int] = {}  # sürüm vektörü: kaynak → teslim edilen son sıra_no
        self.buffer: list[Message] = []
        self.applied = 0  # uzaktan uygulanan işlem sayısı (gözlem için)

    def record(self, op: Op) -> Message:
        """Yerelde ZATEN uygulanmış işlemi yayımlanacak bir mesaja çevirir."""
        deps = tuple(sorted((r, n) for r, n in self.delivered.items() if r != self.name))
        seq = self.delivered.get(self.name, 0) + 1
        self.delivered[self.name] = seq
        return Message(self.name, seq, deps, op)

    def receive(self, message: Message) -> None:
        if message.origin == self.name or message.seq <= self.delivered.get(message.origin, 0):
            return  # kendi mesajım ya da zaten teslim edildi (yineleme)
        if message not in self.buffer:
            self.buffer.append(message)
        self._drain()

    def _ready(self, message: Message) -> bool:
        if self.delivered.get(message.origin, 0) != message.seq - 1:
            return False
        return all(self.delivered.get(r, 0) >= n for r, n in message.deps)

    def _drain(self) -> None:
        progressed = True
        while progressed:
            progressed = False
            for message in list(self.buffer):
                if self._ready(message):
                    self.crdt.apply(message.op)
                    self.delivered[message.origin] = message.seq
                    self.buffer.remove(message)
                    self.applied += 1
                    progressed = True
