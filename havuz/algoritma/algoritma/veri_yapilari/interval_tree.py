"""Aralık ağacı: "şu aralıkla çakışan tüm aralıklar hangileri?" sorusunu hızlı yanıtlar.

Fikir:
    Aralıklar başlangıçlarına göre dengeli bir arama ağacında (burada treap) tutulur. Her düğüm
    ayrıca kendi alt ağacındaki en büyük bitiş noktasını (`max_end`) saklar. Sorgu [lo, hi] için:
      * bir alt ağacın `max_end` değeri lo'dan küçükse oradaki hiçbir aralık çakışamaz → atla;
      * düğümün başlangıcı hi'den büyükse sağ alt ağaçtakilerin başlangıcı da büyüktür → sağı atla.
    Bu iki budama sayesinde yalnız yanıta katkı veren yollar gezilir.
    Aralıklar KAPALIDIR: [başlangıç, bitiş]; [1, 3] ile [3, 5] çakışır. Aynı aralık birden çok
    kez eklenebilir (çoklu küme).

Karmaşıklık: ekleme/silme beklenen O(log n); çakışma sorgusu beklenen O(log n + k)
    (k = yanıt sayısı); yer O(n)
Ne zaman: takvim çakışması, genom aralıkları, "bu anda hangi oturumlar açık" gibi sorgular.
Ne zaman değil: aralıklar değişmiyor ve tek seferlik sorgu varsa sıralayıp süpürmek daha basit.
Bağımlılık: yok
Özyineleme: split/merge özyinelemelidir; beklenen derinlik O(log n). Sorgu özyinelemesizdir.
Genişletme: aralığa yük (ör. etkinlik adı) eklemek için düğüme alan ekleyip `overlapping`'de
    döndürün.

Örnek:
    >>> import random
    >>> t = IntervalTree(rng=random.Random(5))
    >>> for start, end in [(1, 3), (5, 8), (2, 6), (10, 12)]:
    ...     t.insert(start, end)
    >>> t.overlapping(3, 5), t.stabbing(11), t.remove(2, 6), t.overlapping(3, 5)
    ([(1, 3), (2, 6), (5, 8)], [(10, 12)], True, [(1, 3), (5, 8)])
"""

from __future__ import annotations

import random
from collections.abc import Iterator


class _Node:
    __slots__ = ("end", "left", "max_end", "priority", "right", "start")

    def __init__(self, start: float, end: float, priority: float) -> None:
        self.start = start
        self.end = end
        self.priority = priority
        self.max_end = end
        self.left: _Node | None = None
        self.right: _Node | None = None


def _update(node: _Node) -> None:
    node.max_end = node.end
    for child in (node.left, node.right):
        if child is not None and child.max_end > node.max_end:
            node.max_end = child.max_end


def _split(node: _Node | None, key: tuple[float, float]) -> tuple[_Node | None, _Node | None]:
    if node is None:
        return None, None
    if (node.start, node.end) < key:
        node.right, right = _split(node.right, key)
        _update(node)
        return node, right
    left, node.left = _split(node.left, key)
    _update(node)
    return left, node


def _merge(left: _Node | None, right: _Node | None) -> _Node | None:
    if left is None or right is None:
        return left if right is None else right
    if left.priority > right.priority:
        left.right = _merge(left.right, right)
        _update(left)
        return left
    right.left = _merge(left, right.left)
    _update(right)
    return right


def _erase(node: _Node | None, key: tuple[float, float]) -> tuple[_Node | None, bool]:
    if node is None:
        return None, False
    here = (node.start, node.end)
    if key < here:
        node.left, removed = _erase(node.left, key)
    elif here < key:
        node.right, removed = _erase(node.right, key)
    else:
        return _merge(node.left, node.right), True
    _update(node)
    return node, removed


class IntervalTree:
    """Kapalı aralıkların çoklu kümesi; çakışma ve nokta sorgusu."""

    def __init__(self, rng: random.Random | None = None) -> None:
        self._rng = rng if rng is not None else random.Random(0)
        self._root: _Node | None = None
        self._size = 0

    def __len__(self) -> int:
        return self._size

    def insert(self, start: float, end: float) -> None:
        """[start, end] aralığını ekler."""
        if end < start:
            raise ValueError(f"bitiş başlangıçtan küçük olamaz: [{start}, {end}]")
        left, right = _split(self._root, (start, end))
        self._root = _merge(_merge(left, _Node(start, end, self._rng.random())), right)
        self._size += 1

    def remove(self, start: float, end: float) -> bool:
        """Aralığın bir kopyasını siler; yoksa False döndürür."""
        self._root, removed = _erase(self._root, (start, end))
        self._size -= removed
        return removed

    def overlapping(self, lo: float, hi: float) -> list[tuple[float, float]]:
        """[lo, hi] ile çakışan tüm aralıklar, (başlangıç, bitiş) sırasıyla."""
        found: list[tuple[float, float]] = []
        stack = [self._root]
        while stack:
            node = stack.pop()
            if node is None or node.max_end < lo:
                continue
            stack.append(node.left)
            if node.start <= hi:
                if node.end >= lo:
                    found.append((node.start, node.end))
                stack.append(node.right)
        return sorted(found)

    def stabbing(self, point: float) -> list[tuple[float, float]]:
        """`point` noktasını içeren tüm aralıklar."""
        return self.overlapping(point, point)

    def __iter__(self) -> Iterator[tuple[float, float]]:
        stack: list[_Node] = []
        node = self._root
        while stack or node is not None:
            while node is not None:
                stack.append(node)
                node = node.left
            node = stack.pop()
            yield node.start, node.end
            node = node.right
