"""Ayrık küme (union-find): "bu ikisi aynı grupta mı?" sorusunu neredeyse O(1)'de yanıtlar.

Fikir:
    Her grup bir ağaçtır; ağacın kökü grubun temsilcisidir. `find` kökü bulur, `union` iki kökü
    birbirine bağlar. İki iyileştirme birlikte işlem başına maliyeti α(n)'e (ters Ackermann;
    pratikte ≤ 4) indirir:
      * Sıraya göre birleştirme: alçak ağaç yüksek ağacın altına bağlanır.
      * Yol sıkıştırma: `find` yolundaki her düğüm doğrudan köke bağlanır.
    `find` özyinelemesiz (iki geçişli) yazıldı; uzun zincirde Python yığın sınırına takılmaz.

Karmaşıklık: find/union/connected amortize O(α(n)) ≈ O(1); kurulum O(n); yer O(n)
Ne zaman: bağlantılılık sorguları, Kruskal, bileşen sayma, eşdeğerlik sınıfları, döngü bulma.
Ne zaman değil: birleştirmenin geri alınması (bölme) gerekiyorsa; o durumda başka yapı gerekir.
Bağımlılık: yok
Genişletme: grup başına toplam/en küçük tutmak için `union` içinde kök kaydını güncelleyin
    (`_size` nasıl tutuluyorsa öyle).

Örnek:
    >>> ds = DisjointSet(5)
    >>> ds.union(0, 1), ds.union(3, 4), ds.union(1, 0)
    (True, True, False)
    >>> ds.connected(0, 1), ds.connected(1, 3), ds.set_count, ds.size_of(4)
    (True, False, 3, 2)
"""

from __future__ import annotations


class DisjointSet:
    """0 … n−1 elemanları üstünde ayrık küme."""

    def __init__(self, n: int) -> None:
        if n < 0:
            raise ValueError("eleman sayısı negatif olamaz")
        self._parent = list(range(n))
        self._rank = [0] * n  # ağaç yüksekliği için üst sınır
        self._size = [1] * n  # yalnız köklerde anlamlı
        self._sets = n

    def __len__(self) -> int:
        return len(self._parent)

    @property
    def set_count(self) -> int:
        """Ayrık grup sayısı."""
        return self._sets

    def find(self, x: int) -> int:
        """x'in grubunun temsilcisi (kök)."""
        root = x
        while self._parent[root] != root:
            root = self._parent[root]
        while self._parent[x] != root:  # yol sıkıştırma
            self._parent[x], x = root, self._parent[x]
        return root

    def union(self, a: int, b: int) -> bool:
        """İki grubu birleştirir; zaten aynı gruptaysalar False döndürür."""
        root_a, root_b = self.find(a), self.find(b)
        if root_a == root_b:
            return False
        if self._rank[root_a] < self._rank[root_b]:
            root_a, root_b = root_b, root_a
        self._parent[root_b] = root_a
        self._size[root_a] += self._size[root_b]
        if self._rank[root_a] == self._rank[root_b]:
            self._rank[root_a] += 1
        self._sets -= 1
        return True

    def connected(self, a: int, b: int) -> bool:
        """İki eleman aynı grupta mı?"""
        return self.find(a) == self.find(b)

    def size_of(self, x: int) -> int:
        """x'in grubundaki eleman sayısı."""
        return self._size[self.find(x)]

    def groups(self) -> list[list[int]]:
        """Tüm gruplar; her grup sıralı, gruplar en küçük elemanlarına göre sıralı."""
        by_root: dict[int, list[int]] = {}
        for x in range(len(self._parent)):
            by_root.setdefault(self.find(x), []).append(x)
        return sorted(by_root.values())
