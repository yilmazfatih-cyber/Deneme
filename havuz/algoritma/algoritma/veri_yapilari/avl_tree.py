"""AVL ağacı: her düğümde iki alt ağacın yükseklik farkı en çok 1 olan dengeli arama ağacı (eşlem).

Fikir:
    Düz BST sıralı girdide zincire döner. AVL her ekleme/silmeden sonra, değişen yol boyunca
    "denge çarpanını" (sol yükseklik − sağ yükseklik) denetler. Fark 2 olursa döndürme yapılır:
    sol-sol durumunda tek sağa döndürme, sol-sağ durumunda önce sol çocukta sola sonra düğümde
    sağa döndürme (sağ taraf için simetriği). Döndürme sıralamayı bozmaz, yalnız şekli değiştirir.
    Sonuç: yükseklik her zaman ≤ 1.44·log2(n+2), yani her işlem O(log n).

Karmaşıklık: ekleme/arama/silme O(log n) (en kötü durumda da); sıralı gezinme O(n); yer O(n)
Ne zaman: sıralı eşlem (sözlük) gerektiğinde: aralık sorgusu, en yakın küçük/büyük anahtar.
Ne zaman değil: yalnız anahtar → değer gerekiyorsa `dict` (O(1)); k. öğe sorgusu için `treap.py`.
Bağımlılık: yok
Özyineleme: ekleme/silme özyinelemelidir ama derinlik O(log n) olduğundan yığın taşmaz.
Genişletme: alt ağaç boyutu (`size`) alanı eklenirse k. öğe sorgusu yazılabilir (`treap.py`).

Örnek:
    >>> t = AVLTree[int, str]()
    >>> for k in range(1, 8):
    ...     t[k] = str(k)
    >>> t.height(), t[5], 9 in t
    (3, '5', False)
    >>> del t[4]
    >>> [k for k, _ in t.items()], t.is_valid()
    ([1, 2, 3, 5, 6, 7], True)
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Generic, Protocol, TypeVar, cast


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


K = TypeVar("K", bound=_Comparable)
V = TypeVar("V")


class _Node(Generic[K, V]):
    __slots__ = ("height", "key", "left", "right", "value")

    def __init__(self, key: K, value: V) -> None:
        self.key = key
        self.value = value
        self.left: _Node[K, V] | None = None
        self.right: _Node[K, V] | None = None
        self.height = 1  # bu düğümdeki alt ağacın düğüm cinsinden yüksekliği


def _h(node: _Node[K, V] | None) -> int:
    return node.height if node is not None else 0


def _update(node: _Node[K, V]) -> None:
    node.height = 1 + max(_h(node.left), _h(node.right))


def _rotate_right(top: _Node[K, V]) -> _Node[K, V]:
    pivot = cast(_Node[K, V], top.left)
    top.left = pivot.right
    pivot.right = top
    _update(top)
    _update(pivot)
    return pivot


def _rotate_left(top: _Node[K, V]) -> _Node[K, V]:
    pivot = cast(_Node[K, V], top.right)
    top.right = pivot.left
    pivot.left = top
    _update(top)
    _update(pivot)
    return pivot


def _rebalance(node: _Node[K, V]) -> _Node[K, V]:
    _update(node)
    balance = _h(node.left) - _h(node.right)
    if balance > 1:  # sol ağır
        left = cast(_Node[K, V], node.left)
        if _h(left.left) < _h(left.right):  # sol-sağ durumu: önce sola döndür
            node.left = _rotate_left(left)
        return _rotate_right(node)
    if balance < -1:  # sağ ağır
        right = cast(_Node[K, V], node.right)
        if _h(right.right) < _h(right.left):  # sağ-sol durumu
            node.right = _rotate_right(right)
        return _rotate_left(node)
    return node


class AVLTree(Generic[K, V]):
    """Anahtarları sıralı tutan AVL eşlemi (`dict` benzeri arayüz)."""

    def __init__(self) -> None:
        self._root: _Node[K, V] | None = None
        self._size = 0

    def __len__(self) -> int:
        return self._size

    def _find(self, key: K) -> _Node[K, V] | None:
        node = self._root
        while node is not None:
            if key < node.key:
                node = node.left
            elif node.key < key:
                node = node.right
            else:
                return node
        return None

    def __contains__(self, key: object) -> bool:
        return self._find(cast(K, key)) is not None

    def __getitem__(self, key: K) -> V:
        node = self._find(key)
        if node is None:
            raise KeyError(key)
        return node.value

    def get(self, key: K, default: V) -> V:
        node = self._find(key)
        return default if node is None else node.value

    def __setitem__(self, key: K, value: V) -> None:
        self._root = self._insert(self._root, key, value)

    def _insert(self, node: _Node[K, V] | None, key: K, value: V) -> _Node[K, V]:
        if node is None:
            self._size += 1
            return _Node(key, value)
        if key < node.key:
            node.left = self._insert(node.left, key, value)
        elif node.key < key:
            node.right = self._insert(node.right, key, value)
        else:
            node.value = value
            return node
        return _rebalance(node)

    def __delitem__(self, key: K) -> None:
        self._root = self._remove(self._root, key)
        self._size -= 1

    def _remove(self, node: _Node[K, V] | None, key: K) -> _Node[K, V] | None:
        if node is None:
            raise KeyError(key)
        if key < node.key:
            node.left = self._remove(node.left, key)
        elif node.key < key:
            node.right = self._remove(node.right, key)
        else:
            if node.left is None:
                return node.right
            if node.right is None:
                return node.left
            successor = node.right
            while successor.left is not None:
                successor = successor.left
            node.key, node.value = successor.key, successor.value
            node.right = self._remove(node.right, successor.key)
        return _rebalance(node)

    def items(self) -> Iterator[tuple[K, V]]:
        """(anahtar, değer) çiftlerini anahtar sırasıyla verir."""
        stack: list[_Node[K, V]] = []
        node = self._root
        while stack or node is not None:
            while node is not None:
                stack.append(node)
                node = node.left
            node = stack.pop()
            yield node.key, node.value
            node = node.right

    def height(self) -> int:
        """Ağacın düğüm cinsinden yüksekliği (boş ağaç 0)."""
        return _h(self._root)

    def is_valid(self) -> bool:
        """Sıralama, yükseklik kaydı ve denge kuralını baştan denetler (testler için, O(n))."""
        keys = [k for k, _ in self.items()]
        if any(not keys[i] < keys[i + 1] for i in range(len(keys) - 1)) or len(keys) != self._size:
            return False
        stack: list[_Node[K, V]] = [self._root] if self._root is not None else []
        while stack:
            node = stack.pop()
            if node.height != 1 + max(_h(node.left), _h(node.right)):
                return False
            if abs(_h(node.left) - _h(node.right)) > 1:
                return False
            stack.extend(c for c in (node.left, node.right) if c is not None)
        return True
