"""Treap: anahtara göre arama ağacı, rastgele önceliğe göre yığın olan dengeli ağaç (sıralı küme).

Fikir:
    Her düğüme rastgele bir öncelik verilir. Ağaç anahtarlara göre BST, önceliklere göre yığındır
    (ebeveynin önceliği çocuklarınınkinden büyük). Bu iki kural ağacın şeklini tek türlü belirler
    ve şekil, anahtarların rastgele sırayla eklendiği bir BST ile aynıdır: beklenen derinlik
    O(log n). Tüm işlemler iki ilkel üstüne kurulur: `split` (ağacı "< k" ve "≥ k" diye ikiye
    böl) ve `merge` (tüm anahtarları soldakilerden büyük iki ağacı birleştir).
    Her düğüm alt ağaç boyutunu tuttuğu için k. en küçük ve "kaç anahtar k'den küçük" O(log n).

Karmaşıklık: ekleme/silme/arama/kth/rank beklenen O(log n); yer O(n)
Ne zaman: sıralı küme + sıra istatistiği (k. öğe, sıra numarası) gerektiğinde; kısa kod.
Ne zaman değil: en kötü durum güvencesi gerekiyorsa `avl_tree.py`; yalnız üyelik için `set`.
Bağımlılık: yok
Özyineleme: split/merge özyinelemelidir; beklenen derinlik O(log n) (n = 10^6 için ~60).
Genişletme: aralık toplamı gibi bir özet eklemek için `_update` içine bir satır yazın.

Örnek:
    >>> import random
    >>> t = Treap([40, 10, 30, 20], rng=random.Random(1))
    >>> t.kth(0), t.kth(3), t.rank(25), list(t)
    (10, 40, 2, [10, 20, 30, 40])
    >>> t.remove(10), t.kth(0), len(t)
    (True, 20, 3)
"""

from __future__ import annotations

import random
from collections.abc import Iterable, Iterator
from typing import Any, Generic, Protocol, TypeVar, cast


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


K = TypeVar("K", bound=_Comparable)


class _Node(Generic[K]):
    __slots__ = ("key", "left", "priority", "right", "size")

    def __init__(self, key: K, priority: float) -> None:
        self.key = key
        self.priority = priority
        self.left: _Node[K] | None = None
        self.right: _Node[K] | None = None
        self.size = 1


def _size(node: _Node[K] | None) -> int:
    return node.size if node is not None else 0


def _update(node: _Node[K]) -> None:
    node.size = 1 + _size(node.left) + _size(node.right)


def _split(node: _Node[K] | None, key: K) -> tuple[_Node[K] | None, _Node[K] | None]:
    """(anahtarı < key olanlar, ≥ key olanlar)."""
    if node is None:
        return None, None
    if node.key < key:
        node.right, right = _split(node.right, key)
        _update(node)
        return node, right
    left, node.left = _split(node.left, key)
    _update(node)
    return left, node


def _merge(left: _Node[K] | None, right: _Node[K] | None) -> _Node[K] | None:
    """Soldaki tüm anahtarlar sağdakilerden küçük olmalı."""
    if left is None:
        return right
    if right is None:
        return left
    if left.priority > right.priority:
        left.right = _merge(left.right, right)
        _update(left)
        return left
    right.left = _merge(left, right.left)
    _update(right)
    return right


def _erase(node: _Node[K] | None, key: K) -> tuple[_Node[K] | None, bool]:
    if node is None:
        return None, False
    if key < node.key:
        node.left, removed = _erase(node.left, key)
    elif node.key < key:
        node.right, removed = _erase(node.right, key)
    else:
        return _merge(node.left, node.right), True
    _update(node)
    return node, removed


class Treap(Generic[K]):
    """Yinelenen anahtar tutmayan, sıra istatistikli dengeli küme."""

    def __init__(self, keys: Iterable[K] = (), rng: random.Random | None = None) -> None:
        self._rng = rng if rng is not None else random.Random(0)
        self._root: _Node[K] | None = None
        for key in keys:
            self.insert(key)

    def __len__(self) -> int:
        return _size(self._root)

    def __contains__(self, key: object) -> bool:
        target = cast(K, key)
        node = self._root
        while node is not None:
            if target < node.key:
                node = node.left
            elif node.key < target:
                node = node.right
            else:
                return True
        return False

    def insert(self, key: K) -> bool:
        """Anahtarı ekler; zaten varsa False döndürür."""
        if key in self:
            return False
        left, right = _split(self._root, key)
        self._root = _merge(_merge(left, _Node(key, self._rng.random())), right)
        return True

    def remove(self, key: K) -> bool:
        """Anahtarı siler; yoksa False döndürür."""
        self._root, removed = _erase(self._root, key)
        return removed

    def kth(self, index: int) -> K:
        """Sıralı düzende `index`. anahtar (0'dan başlar)."""
        if not 0 <= index < len(self):
            raise IndexError(f"sıra sınır dışında: {index} (boyut {len(self)})")
        node = self._root
        while node is not None:
            left_size = _size(node.left)
            if index < left_size:
                node = node.left
            elif index == left_size:
                return node.key
            else:
                index -= left_size + 1
                node = node.right
        raise AssertionError("boyut kayıtları bozuk")  # buraya ulaşılmaz

    def rank(self, key: K) -> int:
        """`key`'den küçük anahtar sayısı (key kümede olmasa da çalışır)."""
        count = 0
        node = self._root
        while node is not None:
            if node.key < key:
                count += _size(node.left) + 1
                node = node.right
            else:
                node = node.left
        return count

    def __iter__(self) -> Iterator[K]:
        stack: list[_Node[K]] = []
        node = self._root
        while stack or node is not None:
            while node is not None:
                stack.append(node)
                node = node.left
            node = stack.pop()
            yield node.key
            node = node.right
