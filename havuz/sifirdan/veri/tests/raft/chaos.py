"""Kaos sürücüsü: rastgele çökme / yeniden başlama / bölünme / iyileşme + kayıplı, yineleyen ağ +
istemciler.

Her istemcinin aynı anda tek bekleyen isteği vardır (sıra no artar); yanıt yoksa aynı isteği yeniden
gönderir. Kaostan sonra ağ iyileşir, herkes ayağa kalkar ve sistemin toparlanması beklenir.

Genişletme: yeni bir hata türü (ör. saat sapması, tek yönlü bölünme) → `_chaos_step`'e bir olasılık
dalı.
"""

from __future__ import annotations

import random
from dataclasses import dataclass

from raft import Cluster, Network, Timing
from raft.node import DEFAULT_TIMING

CLIENTS = ["c0", "c1", "c2"]


class Clients:
    def __init__(self, cluster: Cluster, rng: random.Random) -> None:
        self.cluster = cluster
        self.rng = rng
        self.seq = dict.fromkeys(CLIENTS, 0)  # gönderilen son sıra no
        self.expected: dict[str, str] = {}  # her şey taahhüt edilince beklenen veri

    def _done(self, client: str, seq: int) -> bool:
        return any(machine.done(client, seq) for machine in self.cluster.machines.values())

    def step(self, allow_new: bool) -> None:
        for client in CLIENTS:
            seq = self.seq[client]
            if seq and not self._done(client, seq):
                key, value = self._command(client, seq)
                self.cluster.submit(("set", key, value, client, seq))  # yeniden dene
            elif allow_new and self.rng.random() < 0.6:
                self.seq[client] = seq + 1
                key, value = self._command(client, seq + 1)
                self.expected[key] = value
                self.cluster.submit(("set", key, value, client, seq + 1))

    @staticmethod
    def _command(client: str, seq: int) -> tuple[str, str]:
        return f"{client}-anahtar{seq % 3}", f"değer-{seq}"

    def all_done(self) -> bool:
        return all(self._done(client, seq) for client, seq in self.seq.items() if seq)


MILD_NETWORK = Network(min_delay=2, max_delay=60, drop=0.05, duplicate=0.05)


@dataclass(frozen=True)
class Chaos:
    """Kaos şiddeti. `gentle`: 5 düğüm, ılımlı hatalar, sonunda TAM toparlanma beklenir.
    `harsh`: 3 düğüm, sık yeniden başlatma ve seçim fırtınası (kısa zaman aşımı, uzun gecikme);
    yalnız güvenlik denetlenir (bu ayarda canlılık yavaştır)."""

    size: int = 5
    steps: int = 80
    step_ms: int = 50
    crash: float = 0.05
    restart: float = 0.07
    partition: float = 0.03
    heal: float = 0.05
    reboot: float = 0.0  # çök + hemen kalk: yalnız diskteki durum kalır
    network: Network = MILD_NETWORK
    timing: Timing = DEFAULT_TIMING


GENTLE = Chaos()
HARSH = Chaos(
    size=3,
    steps=600,
    step_ms=10,
    crash=0.02,
    restart=0.1,
    partition=0.05,
    heal=0.08,
    reboot=0.3,
    network=Network(min_delay=1, max_delay=50, drop=0.2, duplicate=0.1),
    timing=Timing(election_min=40, election_max=80, heartbeat=15),
)


def _chaos_step(cluster: Cluster, rng: random.Random, chaos: Chaos) -> None:
    roll = rng.random()
    alive, dead = sorted(cluster.alive), sorted(set(cluster.ids) - cluster.alive)
    edges = [chaos.crash, chaos.restart, chaos.partition, chaos.heal, chaos.reboot]
    bounds = [sum(edges[: i + 1]) for i in range(len(edges))]
    if roll < bounds[0] and alive:
        cluster.crash(rng.choice(alive))
    elif bounds[0] <= roll < bounds[1] and dead:
        cluster.restart(rng.choice(dead))
    elif bounds[1] <= roll < bounds[2]:
        shuffled = list(cluster.ids)
        rng.shuffle(shuffled)
        cut = rng.randint(1, len(shuffled) - 1)
        cluster.partition(set(shuffled[:cut]), set(shuffled[cut:]))
    elif bounds[2] <= roll < bounds[3]:
        cluster.heal()
    elif bounds[3] <= roll < bounds[4] and alive:
        victim = rng.choice(alive)
        cluster.crash(victim)
        cluster.restart(victim)


def chaos_run(seed: int, chaos: Chaos = GENTLE, recover: bool = True) -> tuple[Cluster, Clients]:
    cluster = Cluster(chaos.size, seed, chaos.network, chaos.timing)
    rng = random.Random(seed * 7919 + 1)
    clients = Clients(cluster, rng)
    for _ in range(chaos.steps):
        _chaos_step(cluster, rng, chaos)
        clients.step(allow_new=True)
        cluster.run(chaos.step_ms)
    if not recover:
        return cluster, clients
    cluster.heal()
    for node_id in sorted(set(cluster.ids) - cluster.alive):
        cluster.restart(node_id)
    for _ in range(200):  # toparlanma: en çok 10 sn sanal zaman
        clients.step(allow_new=False)
        cluster.run(50)
        if clients.all_done() and _converged(cluster):
            break
    return cluster, clients


def _converged(cluster: Cluster) -> bool:
    datas = [cluster.machines[i].data for i in cluster.ids]
    return all(data == datas[0] for data in datas)
