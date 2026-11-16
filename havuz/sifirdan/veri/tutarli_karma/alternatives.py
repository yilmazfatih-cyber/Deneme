"""Halkaya iki seçenek: rendezvous (en yüksek rastgele ağırlık, HRW) ve jump consistent hash.

- Rendezvous: her (anahtar, düğüm) çifti için karma; en büyüğü kazanır. Sanal düğüm gerekmez,
  dağılım kendiliğinden düzgündür; maliyeti anahtar başına O(N) karma.
- Jump hash (Lamping & Veach, 2014): yalnız 0..N-1 numaralı kovalar için; bellek kullanmaz, O(log
  N); ama yalnız SONDAN kova eklenip çıkarılabilir (ortadan düğüm silmek için uygun değil).
- `modulo`: karşılaştırma için saf `hash % N` (N değişince neredeyse her şeyi taşır).

Genişletme: ağırlıklı rendezvous için puanı `-ağırlık / ln(u)` yapın (u ∈ (0,1) karmadan).
"""

from __future__ import annotations

from .ring import stable_hash


def rendezvous_owner(key: str, nodes: list[str]) -> str:
    if not nodes:
        raise LookupError("Düğüm listesi boş.")
    return max(nodes, key=lambda node: (stable_hash(f"{node}|{key}"), node))


def jump_hash(key: int, buckets: int) -> int:
    """Lamping & Veach'in algoritması: 64 bit doğrusal eşlenik üreteçle kova atlatma."""
    if buckets <= 0:
        raise ValueError("kova sayısı pozitif olmalı")
    key &= 0xFFFFFFFFFFFFFFFF
    current, following = -1, 0
    while following < buckets:
        current = following
        key = (key * 2862933555777941757 + 1) & 0xFFFFFFFFFFFFFFFF
        following = int((current + 1) * ((1 << 31) / ((key >> 33) + 1)))
    return current


def modulo_owner(key: str, nodes: list[str]) -> str:
    return nodes[stable_hash(key) % len(nodes)]
