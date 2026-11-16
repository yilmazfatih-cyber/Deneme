"""Kalıp — birleşim-bul uygulamaları: bağlantılar gelirken "kaç grup var, bu ikisi bağlı mı?".

Fikir:
    Ayrık küme yapısı (bkz. `algoritma/veri_yapilari/disjoint_set.py`) iki işlem sunar:
    find(x) → grubun temsilcisi, union(a, b) → iki grubu birleştir. Birçok soru buna indirgenir:
      * Çevrimiçi bileşen sayısı: her yeni bağlantıda grup sayısı en çok 1 azalır.
      * Döngü bulma: union, iki uç ZATEN aynı gruptaysa False döner → bu kenar bir döngü kurar.
      * Eşdeğerlik sınıfları: "ortak bir özelliği paylaşan kayıtlar aynı kişidir" gibi geçişli
        ilişkiler (a ~ b, b ~ c ⇒ a ~ c), ortak özellik üzerinden birleştirilerek gruplanır.
    Burada küçük bir ayrık küme kopyası vardır (kopyalanabilirlik için).
    Akla gelmeli: "bağlantılar sırayla ekleniyor", "aynı gruptalar mı", "gereksiz bağlantı",
    "birleştir ve say", Kruskal.

Karmaşıklık: işlem başına amortize O(α(n)) ≈ O(1); yer O(n)
Ne zaman: bağlantılar yalnız EKLENİYORSA (silme yok) ve gruplar soruluyorsa.
Ne zaman değil: bağlantı silme gerekiyorsa (çevrimdışı ters çevirme hilesi ya da dinamik
    bağlantılılık yapıları gerekir); en kısa yol gibi uzaklık soruları için BFS.
Bağımlılık: yok
Genişletme: grup başına toplam/en büyük gibi bilgiler için `_DSU.union` içinde kök kaydını
    güncelleyin.

Örnek:
    >>> islands_after_each_drain(2, 2, [(0, 0), (1, 1), (0, 1)])
    [1, 2, 1]
    >>> first_redundant_cable(4, [(0, 1), (1, 2), (2, 0), (2, 3)])
    (2, 0)
    >>> group_records([["555-1", "555-2"], ["555-3"], ["555-2", "555-4"]])
    [[0, 2], [1]]
"""

from __future__ import annotations

from collections.abc import Sequence


class _DSU:
    """İSKELET: yol yarılama + boyuta göre birleştirme (tam sürüm: disjoint_set.py)."""

    def __init__(self, n: int) -> None:
        self.parent = list(range(n))
        self.size = [1] * n
        self.groups = n

    def find(self, x: int) -> int:
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def union(self, a: int, b: int) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return False
        if self.size[ra] < self.size[rb]:
            ra, rb = rb, ra
        self.parent[rb] = ra
        self.size[ra] += self.size[rb]
        self.groups -= 1
        return True


def islands_after_each_drain(rows: int, cols: int, drained: Sequence[tuple[int, int]]) -> list[int]:
    """Problem: Bir baraj gölü kuruyor; her gün bir hücre (satır, sütun) karaya dönüşüyor.
    Yatay/dikey komşu kara hücreleri aynı adadır. Her günün sonunda kaç ada var?
    Çözüm: yeni kara hücre önce kendi başına bir adadır; kara komşularıyla birleştirilir.
    """
    dsu = _DSU(rows * cols)
    land = [[False] * cols for _ in range(rows)]
    islands = 0
    counts = []
    for r, c in drained:
        if not land[r][c]:
            land[r][c] = True
            islands += 1
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and land[nr][nc]:
                    if dsu.union(r * cols + c, nr * cols + nc):
                        islands -= 1
        counts.append(islands)
    return counts


def first_redundant_cable(
    villages: int, cables: Sequence[tuple[int, int]]
) -> tuple[int, int] | None:
    """Problem: Köyler arasına sırayla telefon kablosu çekiliyor. Zaten (dolaylı yoldan) bağlı
    iki köyü yeniden bağlayan İLK kablo gereksizdir. Hangisi? Yoksa None.
    """
    dsu = _DSU(villages)
    for a, b in cables:
        if not dsu.union(a, b):
            return a, b
    return None


def group_records(records: Sequence[Sequence[str]]) -> list[list[int]]:
    """Problem: Bir müşteri veritabanında her kayıt bir telefon listesi taşıyor. Ortak en az bir
    numarası olan kayıtlar aynı kişiye aittir (ve bu ilişki geçişlidir). Kişileri (kayıt dizin
    grupları) bulun; gruplar ve içleri sıralı.
    Çözüm: her numaranın ilk görüldüğü kayıtla sonraki kayıtları birleştir.
    """
    dsu = _DSU(len(records))
    owner: dict[str, int] = {}
    for index, phones in enumerate(records):
        for phone in phones:
            if phone in owner:
                dsu.union(owner[phone], index)
            else:
                owner[phone] = index
    groups: dict[int, list[int]] = {}
    for index in range(len(records)):
        groups.setdefault(dsu.find(index), []).append(index)
    return sorted(groups.values())
