"""Tutarlı karma: anahtarları sunuculara dağıtır; sunucu eklenip çıkınca az anahtar taşınır.

Fikir:
    `hash(anahtar) % sunucu_sayısı` yöntemi sunucu sayısı değişince NEREDEYSE TÜM anahtarları
    başka sunucuya taşır. Tutarlı karmada karma uzayı bir halkadır; her sunucu halkaya birçok
    "sanal düğüm" olarak (ad#0, ad#1, …'nın karmaları) yerleştirilir. Anahtar, halkada saat
    yönünde karşılaştığı ilk sanal düğümün sunucusuna gider (ikili arama). Bir sunucu çıkınca
    yalnız ONUN anahtarları komşulara geçer; yeni sunucu yalnız kendi aralığındaki anahtarları
    alır (ortalama K/N anahtar). Sanal düğümler yükü dengeler.
    Karma, blake2b'dir (Python'un `hash()`'i süreçten sürece değiştiği için kullanılmaz).

Karmaşıklık: arama O(log(N·V)); sunucu ekleme/çıkarma O(N·V) (sıralı liste yeniden kurulur);
    yer O(N·V) (N sunucu, V sanal düğüm)
Ne zaman: dağıtık önbellek (memcached), parçalı veritabanı, yük dengeleyici — sunucular değişirken
    anahtar taşımayı en aza indirmek gerektiğinde.
Ne zaman değil: sunucu kümesi hiç değişmiyorsa basit `% N` yeter; ağırlıklı/kısıtlı yerleşim için
    "rendezvous hashing" daha basit olabilir.
Bağımlılık: yok
Genişletme: sunucu ağırlığı için güçlü sunucuya daha çok sanal düğüm verin (`replicas` sunucu
    başına).

Örnek:
    >>> ring = ConsistentHashRing(["s1", "s2", "s3"], replicas=50)
    >>> before = {key: ring.node_for(key) for key in map(str, range(1000))}
    >>> ring.remove_node("s2")
    >>> moved = [k for k, node in before.items() if ring.node_for(k) != node]
    >>> all(before[k] == "s2" for k in moved)  # yalnız çıkan sunucunun anahtarları taşındı
    True
"""

from __future__ import annotations

import bisect
import hashlib
from collections.abc import Iterable


def _hash(text: str) -> int:
    return int.from_bytes(hashlib.blake2b(text.encode("utf-8"), digest_size=8).digest(), "big")


class ConsistentHashRing:
    """Sanal düğümlü tutarlı karma halkası."""

    def __init__(self, nodes: Iterable[str] = (), replicas: int = 100) -> None:
        if replicas < 1:
            raise ValueError("sanal düğüm sayısı en az 1 olmalı")
        self._replicas = replicas
        self._points: list[int] = []  # sıralı karma noktaları
        self._owner: dict[int, str] = {}  # nokta → sunucu
        self._nodes: set[str] = set()
        for node in nodes:
            self.add_node(node)

    @property
    def nodes(self) -> list[str]:
        return sorted(self._nodes)

    def add_node(self, node: str) -> None:
        """Sunucuyu halkaya ekler (zaten varsa hiçbir şey yapmaz)."""
        if node in self._nodes:
            return
        self._nodes.add(node)
        for replica in range(self._replicas):
            point = _hash(f"{node}#{replica}")
            if point in self._owner:  # 64 bitte çakışma çok olası değil; olursa ilk sahip kalır
                continue
            self._owner[point] = node
            bisect.insort(self._points, point)

    def remove_node(self, node: str) -> None:
        """Sunucuyu halkadan çıkarır; yalnız onun anahtarları başka sunuculara geçer."""
        if node not in self._nodes:
            raise KeyError(node)
        self._nodes.remove(node)
        self._points = [p for p in self._points if self._owner[p] != node]
        self._owner = {p: n for p, n in self._owner.items() if n != node}

    def node_for(self, key: str) -> str:
        """Anahtarın sunucusu: halkada saat yönünde ilk sanal düğüm."""
        if not self._points:
            raise LookupError("halkada sunucu yok")
        index = bisect.bisect_left(self._points, _hash(key))
        if index == len(self._points):
            index = 0  # halkanın sonundan başa sar
        return self._owner[self._points[index]]
