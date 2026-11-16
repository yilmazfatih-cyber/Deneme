"""Parçalama (sharding) ve yeniden dengeleme benzetimi: düğümler katılır/ayrılır, veri taşınır,
hiçbir anahtar kaybolmaz.

`ShardedStore`, anahtarları halkaya göre düğümlere dağıtır (isteğe bağlı `replicas` kopya). Üyelik
değişince `plan()` taşıma listesini (anahtar, nereden, nereye) çıkarır; `apply()` uygular. Ayrılan
düğümün verisi, ayrılmadan ÖNCE yeni sahiplerine kopyalanır (önce kopyala, sonra sil) → değişim
boyunca her anahtar en az bir yerde vardır.

Genişletme: taşımayı adım adım yapıp araya okuma/yazma koyan bir benzetim (taşınırken gelen yazma
iki sahibe de gitmeli) ve taşıma bant genişliği sınırı.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .ring import HashRing


@dataclass
class Move:
    key: str
    source: str
    target: str


@dataclass
class ShardedStore:
    ring: HashRing
    replicas: int = 1
    shards: dict[str, dict[str, str]] = field(default_factory=dict)  # düğüm → {anahtar: değer}

    def __post_init__(self) -> None:
        for node in self.ring.weights:
            self.shards.setdefault(node, {})

    def placement(self, key: str) -> list[str]:
        return self.ring.owners(key, min(self.replicas, len(self.ring)))

    def put(self, key: str, value: str) -> None:
        for node in self.placement(key):
            self.shards[node][key] = value

    def get(self, key: str) -> str | None:
        for node in self.placement(key):
            if key in self.shards[node]:
                return self.shards[node][key]
        return None

    def all_keys(self) -> set[str]:
        return {key for shard in self.shards.values() for key in shard}

    def plan(self) -> list[Move]:
        """Şimdiki halkaya göre olması gereken yer ile verinin durduğu yer arasındaki taşımalar."""
        moves: list[Move] = []
        for key in sorted(self.all_keys()):
            holders = sorted(node for node, shard in self.shards.items() if key in shard)
            for target in self.placement(key):
                if target not in holders:  # bütün kopyalar aynıdır: ilk tutucudan kopyala
                    moves.append(Move(key, holders[0], target))
        return moves

    def apply(self) -> int:
        """Taşımaları uygular, artık sahibi olmayan kopyaları siler; taşınan kopya sayısını
        döndürür."""
        moves = self.plan()
        for move in moves:  # önce kopyala
            self.shards.setdefault(move.target, {})[move.key] = self.shards[move.source][move.key]
        for node, shard in self.shards.items():  # sonra sil
            for key in [k for k in shard if node not in self.placement(k)]:
                del shard[key]
        for node in [n for n in self.shards if n not in self.ring.weights and not self.shards[n]]:
            del self.shards[node]
        return len(moves)

    def join(self, node: str, weight: float = 1.0) -> int:
        self.ring.add(node, weight)
        self.shards.setdefault(node, {})
        return self.apply()

    def leave(self, node: str) -> int:
        """Düğüm halkadan çıkar; verisi önce yeni sahiplerine kopyalanır, sonra düğüm boşaltılır."""
        if len(self.ring) == 1 and node in self.ring.weights:
            raise ValueError("Son düğüm ayrılamaz: veri kaybolurdu. Önce yeni düğüm ekleyin.")
        self.ring.remove(node)
        return self.apply()
