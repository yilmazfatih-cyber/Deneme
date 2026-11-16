"""Belirlenimci benzetim: sanal saat + sanal ağ (gecikme, kayıp, yineleme, bölünme) + çökme/yeniden
başlama, ve her olaydan sonra koşan güvenlik denetimleri.

Olay kuyruğu (zaman, sıra_no) ile sıralıdır; bütün rastgelelik tek bir tohumdan gelir → aynı tohum,
aynı geçmiş. Gerçek `sleep` yoktur; 10 saniyelik bir senaryo milisaniyeler sürer.

Denetlenen güvenlik özellikleri (bozulursa `SafetyViolationError`):
1. Seçim güvenliği: bir dönemde en çok bir lider.
2. Durum makinesi güvenliği: aynı dizinde herkes aynı girdiyi uygular.
3. Taahhüt kaybolmaz: taahhüt edilmiş her girdi, sonraki her liderin günlüğünde aynı dizinde vardır.
4. Günlük eşleşmesi: iki günlükte aynı dizin ve dönemdeki girdiler, öncekilerle birlikte aynıdır.

Genişletme: disk gecikmesi ya da "fsync yalan söyledi" hatası için `Storage` kopyasını çökme anında
geri sararak (kayıp yazma) yeni bir hata türü ekleyin; güvenlik bozulmalı ve denetim yakalamalıdır.
"""

from __future__ import annotations

import heapq
import random
from collections.abc import Callable
from dataclasses import dataclass

from .kv import KVStateMachine
from .messages import Entry, Message, Storage
from .node import DEFAULT_TIMING, LEADER, RaftNode, Timing


class SafetyViolationError(AssertionError):
    """Raft güvenlik özelliklerinden biri bozuldu (bu bir hatadır)."""


@dataclass(frozen=True)
class Network:
    min_delay: int = 5
    max_delay: int = 40
    drop: float = 0.0  # ileti kaybolma olasılığı
    duplicate: float = 0.0  # ileti iki kez gelme olasılığı


DEFAULT_NETWORK = Network()


class Cluster:
    def __init__(
        self,
        size: int,
        seed: int,
        network: Network = DEFAULT_NETWORK,
        timing: Timing = DEFAULT_TIMING,
    ):
        self.rng = random.Random(seed)
        self.network = network
        self.timing = timing
        self.ids = list(range(size))
        self.now = 0
        self._queue: list[tuple[int, int, Callable[[], None]]] = []
        self._seq = 0
        self.storage = {i: Storage() for i in self.ids}
        self.machines: dict[int, KVStateMachine] = {}
        self.nodes: dict[int, RaftNode] = {}
        self.alive: set[int] = set()
        self.groups: list[set[int]] | None = None  # bölünme: yalnız aynı gruptakiler konuşur
        self.leaders_by_term: dict[int, int] = {}
        self.committed: dict[
            int, Entry
        ] = {}  # dizin → taahhüt edilmiş girdi (herhangi bir düğümde)
        self._deliveries = 0
        for i in self.ids:
            self.restart(i)

    # ── Olay kuyruğu ────────────────────────────────────────────────────────────────────────────

    def _schedule(self, delay: int, action: Callable[[], None]) -> None:
        self._seq += 1
        heapq.heappush(self._queue, (self.now + delay, self._seq, action))

    def run(self, duration: int) -> None:
        end = self.now + duration
        while self._queue and self._queue[0][0] <= end:
            when, _, action = heapq.heappop(self._queue)
            self.now = when
            action()
        self.now = end
        self.check_logs()

    def _ticker(self, node_id: int, node: RaftNode) -> Callable[[], None]:
        def tick() -> None:
            if self.nodes.get(node_id) is node and node_id in self.alive:  # çökmüşse zincir biter
                node.tick(self.now)
                self._schedule(10, tick)

        return tick

    # ── Ağ ──────────────────────────────────────────────────────────────────────────────────────

    def _connected(self, a: int, b: int) -> bool:
        return self.groups is None or any(a in g and b in g for g in self.groups)

    def _send(self, src: int, dst: int, message: Message) -> None:
        if not self._connected(src, dst) or self.rng.random() < self.network.drop:
            return
        copies = 2 if self.rng.random() < self.network.duplicate else 1
        for _ in range(copies):
            delay = self.rng.randint(self.network.min_delay, self.network.max_delay)
            self._schedule(delay, lambda: self._deliver(src, dst, message))

    def _deliver(self, src: int, dst: int, message: Message) -> None:
        if dst in self.alive and self._connected(src, dst):
            self.nodes[dst].receive(src, message, self.now)
            self._deliveries += 1
            if self._deliveries % 20 == 0:  # günlük eşleşmesi pahalı: aralıklı denetlenir
                self.check_logs()

    def partition(self, *groups: set[int]) -> None:
        self.groups = [set(g) for g in groups]

    def heal(self) -> None:
        self.groups = None

    # ── Düğüm yaşam döngüsü ─────────────────────────────────────────────────────────────────────

    def crash(self, node_id: int) -> None:
        self.alive.discard(node_id)  # uçucu durum gider; Storage (disk) kalır

    def restart(self, node_id: int) -> None:
        machine = KVStateMachine()
        self.machines[node_id] = machine
        node = RaftNode(
            node_id,
            self.ids,
            self.storage[node_id],
            lambda dst, message: self._send(node_id, dst, message),
            random.Random(self.rng.random()),
            self.now,
            self.timing,
            on_apply=lambda index, entry: self._on_apply(node_id, machine, index, entry),
            on_role=lambda role, term: self._on_role(node_id, role, term),
        )
        self.nodes[node_id] = node
        if node_id not in self.alive:
            self.alive.add(node_id)
            self._schedule(10, self._ticker(node_id, node))

    # ── Güvenlik denetimleri ────────────────────────────────────────────────────────────────────

    def _on_role(self, node_id: int, role: str, term: int) -> None:
        if role != LEADER:
            return
        previous = self.leaders_by_term.setdefault(term, node_id)
        if previous != node_id:
            raise SafetyViolationError(f"{term}. dönemde iki lider: {previous} ve {node_id}")
        log = self.storage[node_id].log
        for index, entry in self.committed.items():
            if index > len(log) or log[index - 1] != entry:
                raise SafetyViolationError(
                    f"Yeni lider {node_id} taahhüt edilmiş {index}. girdiyi taşımıyor"
                )

    def _on_apply(self, node_id: int, machine: KVStateMachine, index: int, entry: Entry) -> None:
        known = self.committed.setdefault(index, entry)
        if known != entry:
            raise SafetyViolationError(
                f"{index}. dizinde farklı girdiler uygulandı ({known} / {entry})"
            )
        machine.apply(index, entry)

    def check_logs(self) -> None:
        logs = [self.storage[i].log for i in self.ids]
        for first in range(len(logs)):
            for second in range(first + 1, len(logs)):
                a, b = logs[first], logs[second]
                common = min(len(a), len(b))
                for index in range(common - 1, -1, -1):  # en son ortak dönemli dizinden geri
                    if a[index].term == b[index].term:
                        if a[: index + 1] != b[: index + 1]:
                            raise SafetyViolationError(
                                f"Günlük eşleşmesi bozuk: {first}/{second}, {index + 1}"
                            )
                        break

    # ── İstemci tarafı ──────────────────────────────────────────────────────────────────────────

    def leader(self) -> int | None:
        """Kendini lider sanan, en büyük dönemli canlı düğüm."""
        leaders = [i for i in self.alive if self.nodes[i].role == LEADER]
        return max(leaders, key=lambda i: self.nodes[i].term, default=None)

    def submit(self, command: object) -> bool:
        leader = self.leader()
        return leader is not None and self.nodes[leader].propose(command) is not None
