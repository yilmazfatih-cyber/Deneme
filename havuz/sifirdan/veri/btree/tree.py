"""B+ ağacı: arama, ekleme (bölünme), silme (ödünç alma / birleşme) ve aralık sorgusu.

Kurallar (doğrulayıcı `invariants.py` hepsini denetler):
- Değerler yalnız yapraklardadır; yapraklar `next_leaf` ile soldan sağa zincirlidir.
- İç düğümde ayırıcı k_i için: sol alt ağaçtaki anahtarlar < k_i <= sağ alt ağaçtaki anahtarlar.
- Her yaprak aynı derinliktedir. Kök dışındaki her düğüm en az `capacity/4` bayt doludur.
- Bir girdi en çok `capacity/4` bayttır; böylece bölünme ve ödünç alma her zaman çeyrek doluluğu
  korur (gerekçe README'de).

Genişletme: taşma sayfaları (büyük değerler) için `put`taki boyut sınırını kaldırıp değeri ayrı
sayfa zincirine yazın; yaprakta yalnız ilk sayfa numarasını tutun.
"""

from __future__ import annotations

import bisect
import io
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO

from .node import NODE_HEADER, Node, decode, encode, internal_entry_size, leaf_entry_size
from .pager import Pager

Split = tuple[bytes, int]  # (ayırıcı anahtar, yeni sağ düğümün sayfası)


class BPlusTree:
    """Sayfalı dosya üstünde B+ ağacı. Anahtar ve değerler `bytes`tır."""

    def __init__(self, pager: Pager) -> None:
        self._pager = pager
        self.capacity = pager.page_size - NODE_HEADER
        self.min_fill = self.capacity // 4
        self.max_entry = self.capacity // 4

    @classmethod
    def open(cls, path: str | Path, page_size: int = 4096, cache_pages: int = 64) -> BPlusTree:
        """Dosyayı açar; yoksa boş bir ağaç oluşturur."""
        target = Path(path)
        if target.exists() and target.stat().st_size > 0:
            file = target.open("r+b")
            try:
                pager = Pager(file, page_size, cache_pages)
                pager.load_header()
            except BaseException:
                file.close()  # başlık bozuksa dosya tanıtıcısı açık kalmasın
                raise
            return cls(pager)
        return cls._create(Pager(target.open("w+b"), page_size, cache_pages))

    @classmethod
    def in_memory(cls, page_size: int = 4096, cache_pages: int = 64) -> BPlusTree:
        """Bellekteki bir dosya (`io.BytesIO`) üstünde ağaç: testler ve denemeler için."""
        file: BinaryIO = io.BytesIO()
        return cls._create(Pager(file, page_size, cache_pages))

    @classmethod
    def _create(cls, pager: Pager) -> BPlusTree:
        tree = cls(pager)
        root = tree._new_node(is_leaf=True)
        tree._store(root)
        pager.root = root.page_id
        pager.flush()
        return tree

    # ── Yardımcılar ─────────────────────────────────────────────────────────────────────────────

    @property
    def pager(self) -> Pager:
        return self._pager

    def __len__(self) -> int:
        return self._pager.key_count

    def load(self, page_id: int) -> Node:
        return decode(page_id, self._pager.read(page_id))

    def _store(self, node: Node) -> None:
        self._pager.write(node.page_id, encode(node, self._pager.page_size))

    def _new_node(self, *, is_leaf: bool) -> Node:
        return Node(self._pager.allocate(), is_leaf)

    def flush(self) -> None:
        self._pager.flush()

    def close(self) -> None:
        self._pager.close()

    # ── Arama ───────────────────────────────────────────────────────────────────────────────────

    def _find_leaf(self, key: bytes) -> Node:
        node = self.load(self._pager.root)
        while not node.is_leaf:
            node = self.load(node.children[bisect.bisect_right(node.keys, key)])
        return node

    def get(self, key: bytes) -> bytes | None:
        leaf = self._find_leaf(key)
        i = bisect.bisect_left(leaf.keys, key)
        if i < len(leaf.keys) and leaf.keys[i] == key:
            return leaf.values[i]
        return None

    def range(self, start: bytes = b"", end: bytes | None = None) -> Iterator[tuple[bytes, bytes]]:
        """[start, end) aralığındaki çiftler; yaprak zinciri izlenir, üst düğümlere dönülmez."""
        leaf = self._find_leaf(start)
        i = bisect.bisect_left(leaf.keys, start)
        while True:
            for key, value in zip(leaf.keys[i:], leaf.values[i:], strict=True):
                if end is not None and key >= end:
                    return
                yield key, value
            if not leaf.next_leaf:
                return
            leaf, i = self.load(leaf.next_leaf), 0

    # ── Ekleme ──────────────────────────────────────────────────────────────────────────────────

    def put(self, key: bytes, value: bytes) -> None:
        """Ekler ya da var olan değeri değiştirir."""
        if (
            leaf_entry_size(key, value) > self.max_entry
            or internal_entry_size(key) > self.max_entry
        ):
            limit = self.max_entry - 4
            raise ValueError(
                f"Anahtar+değer en çok {limit} bayt olabilir (sayfa {self._pager.page_size}). "
                "Daha büyük sayfa boyuyla açın ya da değeri bölün."
            )
        self._fix_root(self._insert(self._pager.root, key, value))

    def _fix_root(self, split: Split | None) -> None:
        """Kök bölündüyse ağacı bir kat uzatır; iç kök tek çocuğa indiyse bir kat kısaltır."""
        if split is not None:
            root = self._new_node(is_leaf=False)
            root.keys = [split[0]]
            root.children = [self._pager.root, split[1]]
            self._store(root)
            self._pager.root = root.page_id
            return
        root = self.load(self._pager.root)
        if not root.is_leaf and not root.keys:
            self._pager.root = root.children[0]
            self._pager.free(root.page_id)

    def _insert(self, page_id: int, key: bytes, value: bytes) -> Split | None:
        node = self.load(page_id)
        if node.is_leaf:
            i = bisect.bisect_left(node.keys, key)
            if i < len(node.keys) and node.keys[i] == key:
                node.values[i] = value
            else:
                node.keys.insert(i, key)
                node.values.insert(i, value)
                self._pager.key_count += 1
            return self._store_or_split(node)
        i = bisect.bisect_right(node.keys, key)
        split = self._insert(node.children[i], key, value)
        if not self._settle_child(node, i, split):
            return None
        return self._store_or_split(node)

    def _settle_child(self, node: Node, i: int, split: Split | None) -> bool:
        """i. çocuk değişti: bölündüyse ayırıcıyı ekle, azaldıysa dengele. Düğüm değiştiyse True.

        Eklemede de azalma olabilir: var olan değer daha kısa bir değerle değiştirilince yaprak
        çeyrek doluluğun altına inebilir (bu hatayı özellik testi yakaladı).
        """
        if split is not None:
            node.keys.insert(i, split[0])
            node.children.insert(i + 1, split[1])
            return True
        return self._rebalance_child(node, i)

    def _store_or_split(self, node: Node) -> Split | None:
        if node.entries_size() <= self.capacity:
            self._store(node)
            return None
        return self._split(node)

    def _split(self, node: Node) -> Split:
        """Taşan düğümü bayt ortasından ikiye böler; ayırıcıyı ve sağ düğümü döndürür."""
        right = self._new_node(is_leaf=node.is_leaf)
        if node.is_leaf:
            sizes = [leaf_entry_size(k, v) for k, v in zip(node.keys, node.values, strict=True)]
            m = _first_index_reaching(sizes, sum(sizes) / 2) + 1  # sola en az yarısı
            right.keys, node.keys = node.keys[m:], node.keys[:m]
            right.values, node.values = node.values[m:], node.values[:m]
            right.next_leaf, node.next_leaf = node.next_leaf, right.page_id
            separator = right.keys[0]
        else:
            sizes = [internal_entry_size(k) for k in node.keys]
            m = _first_index_reaching(sizes, sum(sizes) / 2)  # ortayı aşan anahtar yukarı çıkar
            separator = node.keys[m]
            right.keys, node.keys = node.keys[m + 1 :], node.keys[:m]
            right.children, node.children = node.children[m + 1 :], node.children[: m + 1]
        self._store(node)
        self._store(right)
        return separator, right.page_id

    # ── Silme ───────────────────────────────────────────────────────────────────────────────────

    def delete(self, key: bytes) -> bool:
        """Anahtarı siler; vardıysa True döndürür."""
        found, split = self._delete(self._pager.root, key)
        self._fix_root(split)  # ayırıcı büyüdüyse kök taşmış, birleşme olduysa boşalmış olabilir
        return found

    def _delete(self, page_id: int, key: bytes) -> tuple[bool, Split | None]:
        node = self.load(page_id)
        if node.is_leaf:
            i = bisect.bisect_left(node.keys, key)
            if i == len(node.keys) or node.keys[i] != key:
                return False, None
            del node.keys[i]
            del node.values[i]
            self._pager.key_count -= 1
            self._store(node)
            return True, None
        i = bisect.bisect_right(node.keys, key)
        found, split = self._delete(node.children[i], key)
        if not found or not self._settle_child(node, i, split):
            return found, None
        return found, self._store_or_split(node)

    def _rebalance_child(self, parent: Node, i: int) -> bool:
        """Çeyrekten az dolu çocuğu kardeşiyle birleştirir ya da kardeşinden ödünç alır."""
        child = self.load(parent.children[i])
        if child.entries_size() >= self.min_fill:
            return False
        if i > 0:
            j, left, right = i - 1, self.load(parent.children[i - 1]), child
        else:
            j, left, right = 0, child, self.load(parent.children[1])
        separator = parent.keys[j]
        extra = 0 if left.is_leaf else internal_entry_size(separator)
        if left.entries_size() + right.entries_size() + extra <= self.capacity:
            self._merge(left, right, separator)
            del parent.keys[j]
            del parent.children[j + 1]
        else:
            parent.keys[j] = self._redistribute(left, right, separator)
        return True

    def _merge(self, left: Node, right: Node, separator: bytes) -> None:
        if left.is_leaf:
            left.keys += right.keys
            left.values += right.values
            left.next_leaf = right.next_leaf
        else:
            left.keys += [separator, *right.keys]
            left.children += right.children
        self._store(left)
        self._pager.free(right.page_id)

    def _redistribute(self, left: Node, right: Node, separator: bytes) -> bytes:
        """Dolu kardeşten eksik olana girdi taşır; yeni ayırıcıyı döndürür."""
        if left.is_leaf:
            while left.entries_size() < self.min_fill:
                left.keys.append(right.keys.pop(0))
                left.values.append(right.values.pop(0))
            while right.entries_size() < self.min_fill:
                right.keys.insert(0, left.keys.pop())
                right.values.insert(0, left.values.pop())
            separator = right.keys[0]
        else:
            while left.entries_size() < self.min_fill:  # sola döndür
                left.keys.append(separator)
                left.children.append(right.children.pop(0))
                separator = right.keys.pop(0)
            while right.entries_size() < self.min_fill:  # sağa döndür
                right.keys.insert(0, separator)
                right.children.insert(0, left.children.pop())
                separator = left.keys.pop()
        self._store(left)
        self._store(right)
        return separator


def _first_index_reaching(sizes: list[int], target: float) -> int:
    """Birikimli toplamı `target`ı aşan ilk girdinin sırası (en az 1, en çok len-2)."""
    total = 0
    for index, size in enumerate(sizes):
        total += size
        if total > target:
            return max(1, min(index, len(sizes) - 2))
    return len(sizes) - 2
