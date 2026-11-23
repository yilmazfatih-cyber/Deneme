"""Toplu Hamming uzaklığı, eşik altı çiftler, kopya grupları ve iki küme arası sızıntı.

Kim kullanır: `kopya-bul`, `sizinti` komutları, eğitimdeki kopya-farkında ayrım (`siniflandirma/split.py`).

Yöntem: özetler uint64 dizisidir (görüntü başına k kırpma varyantı: (n, k)); XOR + `np.bitwise_count`
(numpy ≥ 2.0) ile bir blok satırın bütün dizinle uzaklığı tek seferde hesaplanır. Ara bellek blok
başına ~64 MB ile sınırlıdır. Karmaşıklık n²'dir (süre ölçümü: docs/DENEME_KAYDI.md); yüz binlerce
görüntüde çok-indeksli özet (multi-index hashing) gibi bir yöntem gerekir (README Sınırlar).
Gruplar birleşim-bul (union-find) ile kurulur: A~B ve B~C ise A, B, C aynı gruptadır (zincir).

Genişletme: başka bir "aynı grupta tut" kuralı (ör. aynı ürün kodu) için `UnionFind.union` çağıran bir
adım ekleyin; `tests/test_groups.py` içine zincir örneği yazın.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

_BLOCK_BYTES = 64 * 1024 * 1024


@dataclass(frozen=True)
class Pair:
    left: int
    right: int
    distance: int


def _block_rows(columns: int) -> int:
    """Bir blokta kaç satır: XOR ara sonucu uint64 (8 bayt) olduğundan ~64 MB'ı aşmasın."""
    return max(1, min(4096, _BLOCK_BYTES // (8 * max(columns, 1))))


def distances(row_hashes: np.ndarray, col_hashes: np.ndarray) -> np.ndarray:
    """Uzaklık matrisi: satır × sütun, uint8.

    Girdi tek boyutluysa (n,) düz Hamming uzaklığıdır. İki boyutluysa (n, k) her satır bir görüntünün
    k merkez-kırpma varyantıdır (0. sütun görüntünün tamamı; bkz. `scan.CROP_SCALES`). O zaman uzaklık
    "birinin tamamı ↔ ötekinin herhangi bir kırpması" karşılaştırmalarının en küçüğüdür: B, A'nın
    hafif kırpılmış hâliyse A'nın uygun kırpması B'nin tamamıyla örtüşür.
    """
    if row_hashes.ndim == 1:
        xor = row_hashes[:, None] ^ col_hashes[None, :]
        return np.asarray(np.bitwise_count(xor), dtype=np.uint8)
    best = distances(row_hashes[:, 0], col_hashes[:, 0])
    for column in range(1, row_hashes.shape[1]):
        np.minimum(best, distances(row_hashes[:, column], col_hashes[:, 0]), out=best)
        np.minimum(best, distances(row_hashes[:, 0], col_hashes[:, column]), out=best)
    return best


def near_pairs(hashes: np.ndarray, threshold: int) -> list[Pair]:
    """Aynı kümede uzaklığı ≤ eşik olan bütün (i < j) çiftler."""
    count = hashes.shape[0]
    pairs: list[Pair] = []
    if count < 2 or threshold < 0:
        return pairs
    step = _block_rows(count)
    for start in range(0, count, step):
        stop = min(start + step, count)
        block = distances(hashes[start:stop], hashes)
        rows, cols = np.nonzero(block <= threshold)
        for row, col in zip(rows.tolist(), cols.tolist(), strict=True):
            left = start + row
            if col > left:
                pairs.append(Pair(left, col, int(block[row, col])))
    return pairs


def cross_pairs(left: np.ndarray, right: np.ndarray, threshold: int) -> list[Pair]:
    """İki küme arasında uzaklığı ≤ eşik olan çiftler: `left` sırası, `right` sırası."""
    pairs: list[Pair] = []
    if left.shape[0] == 0 or right.shape[0] == 0 or threshold < 0:
        return pairs
    step = _block_rows(right.shape[0])
    for start in range(0, left.shape[0], step):
        block = distances(left[start : start + step], right)
        rows, cols = np.nonzero(block <= threshold)
        for row, col in zip(rows.tolist(), cols.tolist(), strict=True):
            pairs.append(Pair(start + row, col, int(block[row, col])))
    return pairs


class UnionFind:
    """Birleşim-bul: `find` kökü verir; `union` iki öğenin gruplarını birleştirir (küçük kök kalır)."""

    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> None:
        root_left, root_right = self.find(left), self.find(right)
        if root_left != root_right:
            low, high = sorted((root_left, root_right))
            self.parent[high] = low

    def labels(self) -> list[int]:
        """Her öğeye 0'dan başlayan, ilk görülme sırasına göre grup numarası."""
        numbering: dict[int, int] = {}
        return [numbering.setdefault(self.find(i), len(numbering)) for i in range(len(self.parent))]


def group_members(labels: list[int]) -> list[list[int]]:
    """Grup numarası → üyeler; yalnız birden çok üyeli gruplar, büyükten küçüğe."""
    members: dict[int, list[int]] = {}
    for index, label in enumerate(labels):
        members.setdefault(label, []).append(index)
    groups = [rows for rows in members.values() if len(rows) > 1]
    return sorted(groups, key=lambda rows: (-len(rows), rows[0]))


def duplicate_groups(hashes: np.ndarray, threshold: int) -> tuple[list[int], list[Pair]]:
    """Her öğeye grup numarası (kopyalar aynı numarayı alır) ve eşik altı çiftler."""
    pairs = near_pairs(hashes, threshold)
    finder = UnionFind(int(hashes.shape[0]))
    for pair in pairs:
        finder.union(pair.left, pair.right)
    return finder.labels(), pairs
