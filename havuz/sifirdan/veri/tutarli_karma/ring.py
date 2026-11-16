"""Tutarlı karma halkası (consistent hashing): sanal düğümler ve ağırlıklar.

Her düğüm halkaya `vnodes · ağırlık` kez, farklı noktalara konur (nokta = karma("düğüm#i")).
Anahtarın sahibi, anahtarın karmasından SAAT YÖNÜNDE ilk noktanın düğümüdür. Düğüm eklenince yalnız
yeni düğümün noktalarının hemen önündeki anahtarlar ona geçer (≈ 1/(N+1)); düğüm çıkınca yalnız
onun anahtarları komşulara dağılır. `hash % N` ise N değişince anahtarların neredeyse hepsini
taşır.

Karma: blake2b'nin ilk 8 baytı (her makinede, her çalıştırmada aynı; Python'un `hash()`'i değil — o
süreç başına rastgeledir).

Genişletme: "sınırlı yük" (consistent hashing with bounded loads) için `owner`'da düğüm doluysa saat
yönünde bir sonrakine geçen bir kapasite sınırı ekleyin.
"""

from __future__ import annotations

import bisect
import hashlib


def stable_hash(text: str) -> int:
    """64 bitlik kararlı karma."""
    return int.from_bytes(hashlib.blake2b(text.encode(), digest_size=8).digest(), "big")


class HashRing:
    def __init__(
        self, nodes: dict[str, float] | list[str] | None = None, vnodes: int = 160
    ) -> None:
        if vnodes < 1:
            raise ValueError("vnodes en az 1 olmalı")
        self.vnodes = vnodes
        self.weights: dict[str, float] = {}
        self._points: list[int] = []  # sıralı halka noktaları
        self._owners: list[str] = []  # aynı sırada noktaların düğümü
        items = nodes.items() if isinstance(nodes, dict) else ((n, 1.0) for n in nodes or [])
        for node, weight in items:
            self.add(node, weight)

    def __len__(self) -> int:
        return len(self.weights)

    def _point_count(self, weight: float) -> int:
        return max(1, round(self.vnodes * weight))

    def add(self, node: str, weight: float = 1.0) -> None:
        if node in self.weights:
            raise ValueError(f"'{node}' zaten halkada")
        if weight <= 0:
            raise ValueError("ağırlık pozitif olmalı")
        self.weights[node] = weight
        for i in range(self._point_count(weight)):
            point = stable_hash(f"{node}#{i}")
            position = bisect.bisect_left(self._points, point)
            # Çakışma (iki düğümün aynı noktası) son derece olası değil; olursa ada göre
            # belirlenimci.
            while position < len(self._points) and self._points[position] == point:
                if self._owners[position] > node:
                    break
                position += 1
            self._points.insert(position, point)
            self._owners.insert(position, node)

    def remove(self, node: str) -> None:
        if node not in self.weights:
            raise ValueError(f"'{node}' halkada yok")
        del self.weights[node]
        kept = [(p, o) for p, o in zip(self._points, self._owners, strict=True) if o != node]
        self._points = [p for p, _ in kept]
        self._owners = [o for _, o in kept]

    def owner(self, key: str) -> str:
        """Anahtarın sahibi: karmasından saat yönünde ilk nokta (sondan sonra başa döner)."""
        if not self._points:
            raise LookupError("Halka boş: önce düğüm ekleyin.")
        position = bisect.bisect_right(self._points, stable_hash(key)) % len(self._points)
        return self._owners[position]

    def owners(self, key: str, count: int) -> list[str]:
        """Kopyalama için saat yönünde ilk `count` FARKLI düğüm (sıra önemli: ilki birincil)."""
        if count > len(self.weights):
            raise ValueError(f"{count} kopya istendi ama {len(self.weights)} düğüm var")
        start = bisect.bisect_right(self._points, stable_hash(key))
        chosen: list[str] = []
        for step in range(len(self._points)):
            node = self._owners[(start + step) % len(self._points)]
            if node not in chosen:
                chosen.append(node)
                if len(chosen) == count:
                    break
        return chosen
