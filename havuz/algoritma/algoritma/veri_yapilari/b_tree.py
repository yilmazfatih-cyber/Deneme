"""B-ağacı: her düğümde çok anahtar tutan, tüm yaprakları aynı derinlikte olan dengeli ağaç.

Fikir:
    En küçük derece t ≥ 2 için kök dışındaki her düğümde t−1 … 2t−1 anahtar bulunur; i anahtarlı
    iç düğümün i+1 çocuğu vardır. Düğüm geniş olduğundan ağaç çok sığdır (log_t n); diskte her
    düğüm bir sayfaya denk gelir, bu yüzden veritabanları ve dosya sistemleri bunu kullanır.
    Ekleme (CLRS): inerken yoldaki DOLU çocuk önceden ikiye bölünür, ortanca anahtar yukarı çıkar;
    böylece yaprağa ulaşıldığında hep yer vardır. Silme: inerken yoldaki her çocuğun en az t
    anahtarı olması sağlanır (kardeşten ödünç al ya da kardeşle birleştir); geri dönmek gerekmez.

Karmaşıklık: arama/ekleme/silme O(t · log_t n) karşılaştırma, O(log_t n) düğüm erişimi; yer O(n)
Ne zaman: veri diskte/sayfalı bellekte ise; düğüm erişimi karşılaştırmadan çok pahalıysa.
Ne zaman değil: tamamen bellekte küçük veri için `avl_tree.py`/`treap.py` daha basittir.
Bağımlılık: yok
Genişletme: anahtar-değer için `keys` yanına paralel bir `values` listesi ekleyin.

Örnek:
    >>> t = BTree(min_degree=2, keys=[10, 20, 5, 6, 12, 30, 7, 17])
    >>> list(t), 6 in t, t.height(), t.is_valid()
    ([5, 6, 7, 10, 12, 17, 20, 30], True, 1, True)
    >>> t.remove(6), t.remove(99), list(t), t.is_valid()
    (True, False, [5, 7, 10, 12, 17, 20, 30], True)
"""

from __future__ import annotations

from bisect import bisect_left, insort
from collections.abc import Iterable, Iterator
from typing import Any, Generic, Protocol, TypeVar, cast


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


K = TypeVar("K", bound=_Comparable)


class _Node(Generic[K]):
    __slots__ = ("children", "keys")

    def __init__(self) -> None:
        self.keys: list[K] = []
        self.children: list[_Node[K]] = []  # boşsa yapraktır

    @property
    def leaf(self) -> bool:
        return not self.children


class BTree(Generic[K]):
    """Yinelenen anahtar tutmayan B-ağacı (küme)."""

    def __init__(self, min_degree: int = 3, keys: Iterable[K] = ()) -> None:
        if min_degree < 2:
            raise ValueError("en küçük derece (min_degree) en az 2 olmalı")
        self._t = min_degree
        self._root: _Node[K] = _Node()
        self._size = 0
        for key in keys:
            self.insert(key)

    def __len__(self) -> int:
        return self._size

    def __contains__(self, key: object) -> bool:
        target = cast(K, key)
        node = self._root
        while True:
            i = bisect_left(node.keys, target)
            if i < len(node.keys) and not target < node.keys[i]:
                return True
            if node.leaf:
                return False
            node = node.children[i]

    def insert(self, key: K) -> bool:
        """Anahtarı ekler; zaten varsa False döndürür."""
        if key in self:
            return False
        t = self._t
        if len(self._root.keys) == 2 * t - 1:  # kök dolu: ağaç yukarı doğru bir kat büyür
            old_root = self._root
            self._root = _Node()
            self._root.children.append(old_root)
            self._split_child(self._root, 0)
        node = self._root
        while not node.leaf:
            i = bisect_left(node.keys, key)
            if len(node.children[i].keys) == 2 * t - 1:
                self._split_child(node, i)
                if node.keys[i] < key:
                    i += 1
            node = node.children[i]
        insort(node.keys, key)
        self._size += 1
        return True

    def _split_child(self, parent: _Node[K], index: int) -> None:
        """Dolu çocuğu ikiye böler; ortanca anahtar ebeveyne çıkar."""
        t = self._t
        full = parent.children[index]
        right: _Node[K] = _Node()
        right.keys = full.keys[t:]
        right.children = full.children[t:]
        parent.keys.insert(index, full.keys[t - 1])
        parent.children.insert(index + 1, right)
        full.keys = full.keys[: t - 1]
        full.children = full.children[:t]

    def remove(self, key: K) -> bool:
        """Anahtarı siler; yoksa False döndürür."""
        if key not in self:
            return False
        self._delete(key)
        self._size -= 1
        while not self._root.keys and not self._root.leaf:  # kök boşaldıysa ağaç bir kat alçalır
            self._root = self._root.children[0]
        return True

    def _delete(self, key: K) -> None:
        t = self._t
        node = self._root
        while True:
            i = bisect_left(node.keys, key)
            if i < len(node.keys) and not key < node.keys[i]:  # anahtar bu düğümde
                if node.leaf:
                    node.keys.pop(i)
                    return
                left, right = node.children[i], node.children[i + 1]
                if len(left.keys) >= t:  # öncülle değiştir, öncülü sil
                    key = self._max_key(left)
                    node.keys[i] = key
                    node = left
                elif len(right.keys) >= t:  # ardılla değiştir, ardılı sil
                    key = self._min_key(right)
                    node.keys[i] = key
                    node = right
                else:  # iki çocuk da ince: birleştir, anahtar birleşik çocuğa iner
                    self._merge_children(node, i)
                    node = left
                continue
            child = node.children[i]  # anahtar varsa bu alt ağaçtadır
            if len(child.keys) == t - 1:
                child = self._fatten(node, i)
            node = child

    def _fatten(self, parent: _Node[K], i: int) -> _Node[K]:
        """i. çocuğa en az t anahtar kazandırır (ödünç/birleştirme); ineceği düğümü döndürür."""
        t = self._t
        child = parent.children[i]
        if i > 0 and len(parent.children[i - 1].keys) >= t:  # soldan ödünç
            donor = parent.children[i - 1]
            child.keys.insert(0, parent.keys[i - 1])
            parent.keys[i - 1] = donor.keys.pop()
            if not donor.leaf:
                child.children.insert(0, donor.children.pop())
            return child
        if i + 1 < len(parent.children) and len(parent.children[i + 1].keys) >= t:  # sağdan
            donor = parent.children[i + 1]
            child.keys.append(parent.keys[i])
            parent.keys[i] = donor.keys.pop(0)
            if not donor.leaf:
                child.children.append(donor.children.pop(0))
            return child
        if i + 1 < len(parent.children):
            self._merge_children(parent, i)
            return child
        self._merge_children(parent, i - 1)
        return parent.children[i - 1]

    def _merge_children(self, parent: _Node[K], i: int) -> None:
        """i. çocuk + i. anahtar + (i+1). çocuk → tek düğüm (i. çocuğun yerinde)."""
        left, right = parent.children[i], parent.children[i + 1]
        left.keys.append(parent.keys.pop(i))
        left.keys.extend(right.keys)
        left.children.extend(right.children)
        parent.children.pop(i + 1)

    @staticmethod
    def _max_key(node: _Node[K]) -> K:
        while not node.leaf:
            node = node.children[-1]
        return node.keys[-1]

    @staticmethod
    def _min_key(node: _Node[K]) -> K:
        while not node.leaf:
            node = node.children[0]
        return node.keys[0]

    def __iter__(self) -> Iterator[K]:
        """Anahtarları sıralı verir (açık yığınla)."""
        stack: list[tuple[_Node[K], int]] = [(self._root, 0)]
        while stack:
            node, i = stack.pop()
            if node.leaf:
                yield from node.keys
                continue
            if i > 0:  # i. çocuğa inmeden önce (i−1). anahtar
                yield node.keys[i - 1]
            if i + 1 < len(node.children):
                stack.append((node, i + 1))
            stack.append((node.children[i], 0))

    def height(self) -> int:
        """Kökten yaprağa kenar sayısı (tek düğümlü ağaç: 0)."""
        height, node = 0, self._root
        while not node.leaf:
            node, height = node.children[0], height + 1
        return height

    def is_valid(self) -> bool:
        """Doluluk sınırları, sıralama ve eşit yaprak derinliği kurallarını denetler (O(n))."""
        t = self._t
        leaf_depths: set[int] = set()
        stack: list[tuple[_Node[K], int]] = [(self._root, 0)]
        while stack:
            node, depth = stack.pop()
            low = t - 1 if node is not self._root else min(1, self._size)
            if not low <= len(node.keys) <= 2 * t - 1:
                return False
            if node.leaf:
                leaf_depths.add(depth)
            elif len(node.children) != len(node.keys) + 1:
                return False
            stack.extend((child, depth + 1) for child in node.children)
        keys = list(self)
        ordered = all(keys[i] < keys[i + 1] for i in range(len(keys) - 1))
        return len(leaf_depths) <= 1 and ordered and len(keys) == self._size
