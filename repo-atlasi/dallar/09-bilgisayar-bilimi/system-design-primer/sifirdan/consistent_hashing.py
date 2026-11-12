"""
Tutarlı hash (consistent hashing) halkası, sanal düğümlerle.

Sorun: Anahtarları N sunucuya `hash(anahtar) % N` ile dağıtırsan, N değiştiği anda
(sunucu eklenir/çıkar) anahtarların neredeyse tamamı başka sunucuya taşınır; önbellekte
bu, toplu ıskalama ve veritabanına yığılma demektir.

Çözüm: Hem sunucuları hem anahtarları aynı çembere (0 .. 2^64-1) yerleştir. Anahtar,
saat yönünde karşılaştığı ilk sunucuya aittir. Sunucu eklendiğinde yalnızca yeni
sunucu ile ondan önceki komşusu arasındaki yay taşınır: ortalama K/N anahtar.

Sanal düğümler: Her sunucu çembere `vnodes` kez (farklı etiketlerle) konur. Tek nokta
kullanılırsa yaylar çok eşitsiz olur; yüzlerce sanal düğüm yükü dengeler ve bir sunucu
düştüğünde yükü tek komşuya değil hepsine dağıtır. Ağırlık (weight), güçlü sunucuya
orantılı olarak daha çok sanal düğüm vermektir.

Primer'deki karşılığı: "Database > Sharding" bölümü tutarlı hash'i yalnızca bir dış bağlantı
olarak anar; "Under development" listesinde de "Consistent hashing" başlığı var, yani
primer konuyu derinlemesine işlemez. Bu modül o boşluğu doldurur.

Karmaşıklık (M = toplam sanal düğüm = N * vnodes): get_node O(log M) ikili arama;
add_node O(vnodes * M), çünkü her nokta sıralı listeye araya eklenir. Gerçek sistemler
bunun için dengeli ağaç ya da toplu sıralama kullanır; mülakatta bunu söylemek yeter.
"""

from __future__ import annotations

import bisect
import hashlib
from collections import Counter
from collections.abc import Callable, Iterable


def md5_hash64(text: str) -> int:
    """
    Metni 64 bitlik tam sayıya çevirir. MD5 burada güvenlik için değil, düzgün dağılım
    için; `usedforsecurity=False` bunu açıkça söyler.

    >>> md5_hash64("sunucu-a") == md5_hash64("sunucu-a")
    True
    >>> 0 <= md5_hash64("x") < 2**64
    True
    """
    digest = hashlib.md5(text.encode("utf-8"), usedforsecurity=False).digest()
    return int.from_bytes(digest[:8], "big")


class ConsistentHashRing:
    """
    >>> ring = ConsistentHashRing(["a", "b", "c"], vnodes=50)
    >>> ring.get_node("kullanici:42") in {"a", "b", "c"}
    True
    >>> len(ring.get_nodes("kullanici:42", 2))   # çoğaltma için 2 farklı sunucu
    2
    """

    def __init__(
        self,
        nodes: Iterable[str] = (),
        vnodes: int = 100,
        hash_fn: Callable[[str], int] = md5_hash64,
    ) -> None:
        if vnodes < 1:
            raise ValueError("vnodes en az 1 olmalı")
        self.vnodes = vnodes
        self._hash = hash_fn
        self._points: list[int] = []  # sıralı çember konumları
        self._owners: list[str] = []  # _points ile aynı sırada, konumun sahibi
        self._weights: dict[str, int] = {}
        for node in nodes:
            self.add_node(node)

    @property
    def nodes(self) -> list[str]:
        return sorted(self._weights)

    def add_node(self, node: str, weight: int = 1) -> None:
        if node in self._weights:
            raise ValueError(f"sunucu zaten halkada: {node}")
        if weight < 1:
            raise ValueError("ağırlık en az 1 olmalı")
        self._weights[node] = weight
        for replica in range(self.vnodes * weight):
            point = self._hash(f"{node}#{replica}")
            index = bisect.bisect_left(self._points, point)
            self._points.insert(index, point)
            self._owners.insert(index, node)

    def remove_node(self, node: str) -> None:
        if node not in self._weights:
            raise KeyError(node)
        del self._weights[node]
        kept = [(p, o) for p, o in zip(self._points, self._owners, strict=True) if o != node]
        self._points = [p for p, _ in kept]
        self._owners = [o for _, o in kept]

    def get_node(self, key: str) -> str:
        if not self._points:
            raise LookupError("halkada sunucu yok")
        # Saat yönünde ilk konum; sona gelince başa sar (çember).
        index = bisect.bisect_right(self._points, self._hash(key)) % len(self._points)
        return self._owners[index]

    def get_nodes(self, key: str, count: int) -> list[str]:
        """Çoğaltma (replication) için saat yönünde ilk `count` FARKLI sunucu."""
        if count > len(self._weights):
            raise ValueError("istenen kopya sayısı sunucu sayısından fazla")
        start = bisect.bisect_right(self._points, self._hash(key))
        chosen: list[str] = []
        for step in range(len(self._points)):
            owner = self._owners[(start + step) % len(self._points)]
            if owner not in chosen:
                chosen.append(owner)
                if len(chosen) == count:
                    break
        return chosen

    def distribution(self, keys: Iterable[str]) -> Counter[str]:
        """Her sunucuya düşen anahtar sayısı (dengeyi ölçmek için)."""
        return Counter(self.get_node(key) for key in keys)


def modulo_assign(key: str, nodes: list[str], hash_fn: Callable[[str], int] = md5_hash64) -> str:
    """Karşılaştırma için saf yöntem: hash(anahtar) % N."""
    return nodes[hash_fn(key) % len(nodes)]


def moved_fraction(before: dict[str, str], after: dict[str, str]) -> float:
    """
    İki atama arasında sunucusu değişen anahtarların oranı.

    >>> moved_fraction({"k1": "a", "k2": "b"}, {"k1": "a", "k2": "c"})
    0.5
    """
    if before.keys() != after.keys():
        raise ValueError("aynı anahtar kümesi bekleniyordu")
    if not before:
        return 0.0
    return sum(before[key] != after[key] for key in before) / len(before)
