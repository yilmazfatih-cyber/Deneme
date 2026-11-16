"""İkili arama ağacı (BST): solda küçükler, sağda büyükler; dengelenmeyen temel sürüm.

Fikir:
    Her düğümün sol alt ağacındaki anahtarlar ondan küçük, sağdakiler büyüktür. Arama kökten
    başlar ve her adımda bir yöne iner; maliyet ağacın yüksekliği kadardır. Silmede üç durum
    vardır: yaprak (doğrudan sil), tek çocuk (çocuğu yukarı bağla), iki çocuk (anahtarı sağ alt
    ağacın en küçüğüyle (ardıl) değiştir, sonra ardılı sil; ardılın sol çocuğu yoktur).
    Dengelenmediği için sıralı eklemede ağaç bir zincire döner (yükseklik n). Bu yüzden bütün
    işlemler özyinelemesiz yazıldı: derin ağaçta Python yığın sınırı aşılmaz.

Karmaşıklık: ekleme/arama/silme O(h) — rastgele girdide O(log n), en kötü O(n); yer O(n)
Ne zaman: BST mantığını öğrenmek; girdinin rastgele olduğu biliniyorsa basit sıralı küme.
Ne zaman değil: girdi sıralı gelebiliyorsa dengeli ağaç kullanın (`avl_tree.py`, `treap.py`).
Bağımlılık: yok
Genişletme: anahtar-değer gerekiyorsa düğüme `value` alanı ekleyin (`avl_tree.py`'deki gibi).

Örnek:
    >>> t = BinarySearchTree([50, 30, 70, 60])
    >>> t.remove(50), 50 in t, list(t)
    (True, False, [30, 60, 70])
    >>> t.floor(65), t.ceiling(65), t.minimum(), t.height()
    (60, 70, 30, 1)
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from typing import Any, Generic, Protocol, TypeVar, cast


class _Comparable(Protocol):
    def __lt__(self, other: Any, /) -> bool: ...


K = TypeVar("K", bound=_Comparable)


class _Node(Generic[K]):
    __slots__ = ("key", "left", "right")

    def __init__(self, key: K) -> None:
        self.key = key
        self.left: _Node[K] | None = None
        self.right: _Node[K] | None = None


class BinarySearchTree(Generic[K]):
    """Yinelenen anahtar tutmayan (küme) ikili arama ağacı."""

    def __init__(self, keys: Iterable[K] = ()) -> None:
        self._root: _Node[K] | None = None
        self._size = 0
        for key in keys:
            self.insert(key)

    def __len__(self) -> int:
        return self._size

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
        """Anahtarı ekler; zaten varsa hiçbir şey yapmaz ve False döndürür."""
        parent: _Node[K] | None = None
        node = self._root
        while node is not None:
            if key < node.key:
                parent, node = node, node.left
            elif node.key < key:
                parent, node = node, node.right
            else:
                return False
        fresh = _Node(key)
        if parent is None:
            self._root = fresh
        elif key < parent.key:
            parent.left = fresh
        else:
            parent.right = fresh
        self._size += 1
        return True

    def remove(self, key: K) -> bool:
        """Anahtarı siler; bulunamadıysa False döndürür."""
        parent: _Node[K] | None = None
        node = self._root
        while node is not None and (key < node.key or node.key < key):
            parent = node
            node = node.left if key < node.key else node.right
        if node is None:
            return False
        if node.left is not None and node.right is not None:
            # İki çocuk: ardılın (sağ alt ağacın en küçüğü) anahtarını buraya taşı, ardılı sil.
            successor_parent, successor = node, node.right
            while successor.left is not None:
                successor_parent, successor = successor, successor.left
            node.key = successor.key
            parent, node = successor_parent, successor
        child = node.left if node.left is not None else node.right
        if parent is None:
            self._root = child
        elif parent.left is node:
            parent.left = child
        else:
            parent.right = child
        self._size -= 1
        return True

    def minimum(self) -> K:
        """En küçük anahtar."""
        node = self._root
        if node is None:
            raise ValueError("boş ağacın en küçüğü yok")
        while node.left is not None:
            node = node.left
        return node.key

    def maximum(self) -> K:
        """En büyük anahtar."""
        node = self._root
        if node is None:
            raise ValueError("boş ağacın en büyüğü yok")
        while node.right is not None:
            node = node.right
        return node.key

    def floor(self, key: K) -> K | None:
        """`key`'e eşit ya da ondan küçük en büyük anahtar (yoksa None)."""
        best: K | None = None
        node = self._root
        while node is not None:
            if key < node.key:
                node = node.left
            else:
                best, node = node.key, node.right
        return best

    def ceiling(self, key: K) -> K | None:
        """`key`'e eşit ya da ondan büyük en küçük anahtar (yoksa None)."""
        best: K | None = None
        node = self._root
        while node is not None:
            if node.key < key:
                node = node.right
            else:
                best, node = node.key, node.left
        return best

    def __iter__(self) -> Iterator[K]:
        """Anahtarları küçükten büyüğe verir (açık yığınla iç sıra gezinmesi)."""
        stack: list[_Node[K]] = []
        node = self._root
        while stack or node is not None:
            while node is not None:
                stack.append(node)
                node = node.left
            node = stack.pop()
            yield node.key
            node = node.right

    def height(self) -> int:
        """Kökten en derin yaprağa kenar sayısı (boş ağaç: -1)."""
        level: list[_Node[K]] = [self._root] if self._root is not None else []
        height = -1
        while level:
            height += 1
            level = [c for n in level for c in (n.left, n.right) if c is not None]
        return height
