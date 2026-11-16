"""Merkle ağacı: çok sayıda veri parçasını tek bir kök özetiyle bağlar; parça başına kısa kanıt.

Fikir:
    Her yaprak, bir veri parçasının SHA-256 özetidir; her iç düğüm, iki çocuğunun özetlerinin
    birleşiminin özetidir; kök tüm veriyi temsil eder. Herhangi bir parçadaki tek bit değişikliği
    kökü değiştirir. Bir parçanın ağaçta olduğunu kanıtlamak için yalnız yoldaki KARDEŞ
    özetler (log n tane) yeter: doğrulayıcı yapraktan köke yeniden hesaplar ve kökle karşılaştırır.
    Güvenlik ayrıntıları: yaprak ve iç düğüm özetlerine farklı ön ek konur (0x00 / 0x01) — aksi
    hâlde bir iç düğüm yaprak gibi gösterilebilir (ikinci ön görüntü saldırısı). Tek kalan düğüm
    KOPYALANMAZ, olduğu gibi bir üst düzeye taşınır (kopyalama, farklı listelerin aynı köke
    sahip olmasına yol açar; Bitcoin'deki CVE-2012-2459 hatası).

Karmaşıklık: kurulum O(n) özet; kanıt O(log n) boy; doğrulama O(log n) özet; yer O(n)
Ne zaman: dosya/blok bütünlüğü (Git, BitTorrent, blokzincir, sertifika şeffaflık günlükleri),
    iki kopya arasında farklı parçaları hızlı bulmak.
Ne zaman değil: tek bir dosyanın bütünlüğü için düz bir SHA-256 yeter.
Bağımlılık: yok
Genişletme: farklı parçaları bulmak için iki ağacı kökten aşağı karşılaştırın; yalnız farklı
    özetli dallara inin.

Örnek:
    >>> tree = MerkleTree([b"a", b"b", b"c"])
    >>> proof = tree.proof(2)
    >>> verify_proof(b"c", proof, tree.root), verify_proof(b"x", proof, tree.root), len(proof)
    (True, False, 1)
"""

from __future__ import annotations

import hashlib
from collections.abc import Sequence

Proof = list[tuple[bytes, str]]  # (kardeş özet, kardeşin yanı: "left" ya da "right")


def leaf_hash(data: bytes) -> bytes:
    """Yaprak özeti: SHA-256(0x00 ‖ veri)."""
    return hashlib.sha256(b"\x00" + data).digest()


def node_hash(left: bytes, right: bytes) -> bytes:
    """İç düğüm özeti: SHA-256(0x01 ‖ sol ‖ sağ)."""
    return hashlib.sha256(b"\x01" + left + right).digest()


class MerkleTree:
    """Değişmeyen bir parça listesi için Merkle ağacı."""

    def __init__(self, leaves: Sequence[bytes]) -> None:
        if not leaves:
            raise ValueError("en az bir yaprak gerekir")
        self._levels: list[list[bytes]] = [[leaf_hash(d) for d in leaves]]
        while len(self._levels[-1]) > 1:
            below = self._levels[-1]
            above = [node_hash(below[i], below[i + 1]) for i in range(0, len(below) - 1, 2)]
            if len(below) % 2:
                above.append(below[-1])  # tek kalan düğüm kopyalanmadan yukarı taşınır
            self._levels.append(above)

    @property
    def root(self) -> bytes:
        return self._levels[-1][0]

    def __len__(self) -> int:
        return len(self._levels[0])

    def proof(self, index: int) -> Proof:
        """`index`. yaprağın köke giden yolundaki kardeş özetler (alttan üste)."""
        if not 0 <= index < len(self):
            raise IndexError(f"yaprak dizini sınır dışında: {index}")
        path: Proof = []
        for level in self._levels[:-1]:
            sibling = index ^ 1
            if sibling < len(level):  # tek kalan düğümün kardeşi yok: bu düzeyde kanıt eklenmez
                path.append((level[sibling], "left" if sibling < index else "right"))
            index //= 2
        return path


def verify_proof(data: bytes, proof: Proof, root: bytes) -> bool:
    """Verinin, kökü `root` olan ağaçta bulunduğunu kanıtla doğrular."""
    current = leaf_hash(data)
    for sibling, side in proof:
        if side == "left":
            current = node_hash(sibling, current)
        elif side == "right":
            current = node_hash(current, sibling)
        else:
            return False
    return current == root
