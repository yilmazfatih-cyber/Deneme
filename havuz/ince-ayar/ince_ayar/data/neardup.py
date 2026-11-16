"""Yinelenen ve birbirine çok benzeyen metinleri gruplar (sızıntısız ayrımın temeli).

Kim kullanır: `data/split.py` (aynı grubun örnekleri aynı tarafa gider), sentetik veri hattı
(yineleme ayıklama), `veri sizinti` komutu.

Yöntem:
1. Metin `fold_for_match` ile sadeleştirilir ("İSTANBUL" = "istanbul", "şeker" = "seker").
2. Sadeleştirilmiş hâli aynı olanlar **tam yineleme** sayılır.
3. Kalanlar için 5 karakterlik parçaların (shingle) kümesi çıkarılır; iki metnin benzerliği
   Jaccard = |kesişim| / |birleşim| olur.
4. Tüm çiftlere bakmak n² iş olduğundan aday çiftler MinHash + LSH ile bulunur, sonra her aday
   **gerçek Jaccard** ile doğrulanır. Yani yanlış eşleşme olmaz; LSH yalnız kaçırabilir.
   Bant ayarı eşiğe göre seçilir (`choose_rows`): eşik değerinde bile yakalama olasılığı ≥ %99.
5. Eşleşenler birleşim-bul (union-find) ile gruplanır.

Genişletme: parça uzunluğu ve imza boyu modül sabitleridir; değiştirirseniz
`tests/test_neardup.py` içindeki kaba kuvvet karşılaştırması yeşil kalmalıdır.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from ince_ayar.text_tr import fold_for_match

SHINGLE_SIZE = 5
NUM_HASHES = 120  # 3, 4 ve 5'e tam bölünür: bant sayısı = NUM_HASHES // satır
_MIX_1 = np.uint64(0xBF58476D1CE4E5B9)
_MIX_2 = np.uint64(0x94D049BB133111EB)
_BASE = np.uint64(0x100000001B3)


@dataclass(frozen=True)
class DuplicateGroups:
    """`group_of[i]`: i. metnin grup numarası (0'dan başlar, ilk görülme sırasıyla)."""

    group_of: list[int]
    exact_duplicates: int
    near_duplicates: int

    @property
    def group_count(self) -> int:
        return len(set(self.group_of))


def _mix(values: np.ndarray) -> np.ndarray:
    """splitmix64 son karıştırıcısı (uint64 taşması bilerek sarmalıdır)."""
    values = values ^ (values >> np.uint64(30))
    values = values * _MIX_1
    values = values ^ (values >> np.uint64(27))
    values = values * _MIX_2
    return np.asarray(values ^ (values >> np.uint64(31)), dtype=np.uint64)


def shingle_hashes(folded: str, size: int = SHINGLE_SIZE) -> np.ndarray:
    """Sadeleştirilmiş metnin karakter parçalarını benzersiz 64 bit özetlere çevirir."""
    codes = np.frombuffer(folded.encode("utf-32-le"), dtype=np.uint32).astype(np.uint64)
    if codes.size == 0:
        return np.zeros(1, dtype=np.uint64)
    if codes.size < size:
        codes = np.concatenate([codes, np.zeros(size - codes.size, dtype=np.uint64)])
    windows = np.lib.stride_tricks.sliding_window_view(codes, size)
    powers = _BASE ** np.arange(size, dtype=np.uint64)
    return np.unique(_mix((windows * powers).sum(axis=1, dtype=np.uint64)))


def jaccard(left: frozenset[int], right: frozenset[int]) -> float:
    """İki parça kümesinin Jaccard benzerliği (0–1)."""
    if not left and not right:
        return 1.0
    return len(left & right) / len(left | right)


def choose_rows(threshold: float) -> int:
    """Eşiğe göre bant başına satır sayısı. Küçük eşik → daha az satır (daha çok aday)."""
    if threshold < 0.62:
        return 3
    if threshold < 0.78:
        return 4
    return 5


def capture_probability(similarity: float, rows: int, num_hashes: int = NUM_HASHES) -> float:
    """Benzerliği `similarity` olan bir çiftin aday olma olasılığı: 1 − (1 − sʳ)ᵇ."""
    bands = num_hashes // rows
    return float(1.0 - (1.0 - similarity**rows) ** bands)


def _signatures(hash_sets: list[np.ndarray]) -> np.ndarray:
    seeds = _mix(np.arange(1, NUM_HASHES + 1, dtype=np.uint64))
    signatures = np.empty((len(hash_sets), NUM_HASHES), dtype=np.uint64)
    for index, hashes in enumerate(hash_sets):
        signatures[index] = _mix(hashes[:, None] ^ seeds[None, :]).min(axis=0)
    return signatures


class _UnionFind:
    def __init__(self, size: int) -> None:
        self.parent = list(range(size))

    def find(self, item: int) -> int:
        while self.parent[item] != item:
            self.parent[item] = self.parent[self.parent[item]]
            item = self.parent[item]
        return item

    def union(self, left: int, right: int) -> bool:
        root_left, root_right = self.find(left), self.find(right)
        if root_left == root_right:
            return False
        self.parent[max(root_left, root_right)] = min(root_left, root_right)
        return True


def _near_pairs(hash_sets: list[np.ndarray], threshold: float) -> list[tuple[int, int]]:
    """LSH ile aday bulur, gerçek Jaccard ile doğrular; eşiği geçen çiftleri döndürür."""
    rows = choose_rows(threshold)
    signatures = _signatures(hash_sets)
    sets = [frozenset(hashes.tolist()) for hashes in hash_sets]
    pairs: set[tuple[int, int]] = set()
    checked: set[tuple[int, int]] = set()
    for band in range(NUM_HASHES // rows):
        buckets: dict[bytes, list[int]] = {}
        chunk = np.ascontiguousarray(signatures[:, band * rows : (band + 1) * rows])
        for index in range(len(hash_sets)):
            buckets.setdefault(chunk[index].tobytes(), []).append(index)
        for members in buckets.values():
            for position, left in enumerate(members):
                for right in members[position + 1 :]:
                    if (left, right) in checked:
                        continue
                    checked.add((left, right))
                    if jaccard(sets[left], sets[right]) >= threshold:
                        pairs.add((left, right))
    return sorted(pairs)


def find_duplicate_groups(texts: list[str], threshold: float = 0.85) -> DuplicateGroups:
    """Metinleri tam ve yakın yineleme gruplarına ayırır. `threshold >= 1` yalnız tam yineleme."""
    folded = [fold_for_match(text) for text in texts]
    unique_index: dict[str, int] = {}
    owner: list[int] = []
    for text in folded:
        owner.append(unique_index.setdefault(text, len(unique_index)))
    exact = len(texts) - len(unique_index)
    union = _UnionFind(len(unique_index))
    near = 0
    if threshold < 1.0 and len(unique_index) > 1:
        hash_sets = [shingle_hashes(text) for text in unique_index]
        for left, right in _near_pairs(hash_sets, threshold):
            near += 1
            union.union(left, right)
    numbering: dict[int, int] = {}
    group_of = [numbering.setdefault(union.find(unique), len(numbering)) for unique in owner]
    return DuplicateGroups(group_of, exact, near)


class NearDuplicateIndex:
    """Artımlı yineleme dizini: metinler tek tek eklenir, her eklemede eşi var mı diye bakılır.

    Sentetik veri hattı kullanır (üretilen her aday, kabul edilenlerle ve var olan veriyle
    karşılaştırılır). Aday bulma LSH ile, doğrulama gerçek Jaccard ile yapılır.
    """

    def __init__(self, threshold: float) -> None:
        self.threshold = threshold
        self.rows = choose_rows(threshold)
        self._exact: dict[str, int] = {}
        self._sets: list[frozenset[int]] = []
        self._buckets: dict[tuple[int, bytes], list[int]] = {}

    def __len__(self) -> int:
        return len(self._sets)

    def find(self, text: str) -> int | None:
        """Eşi (tam ya da yakın) varsa onun sıra numarasını döndürür; yoksa None. Eklemez."""
        folded = fold_for_match(text)
        if folded in self._exact:
            return self._exact[folded]
        hashes = shingle_hashes(folded)
        candidate_set = frozenset(hashes.tolist())
        signature = _signatures([hashes])[0]
        for band in range(NUM_HASHES // self.rows):
            key = (band, signature[band * self.rows : (band + 1) * self.rows].tobytes())
            for other in self._buckets.get(key, []):
                if jaccard(candidate_set, self._sets[other]) >= self.threshold:
                    return other
        return None

    def add(self, text: str) -> int:
        """Metni dizine ekler ve sıra numarasını döndürür (eş denetimi yapmaz)."""
        folded = fold_for_match(text)
        index = len(self._sets)
        self._exact.setdefault(folded, index)
        hashes = shingle_hashes(folded)
        self._sets.append(frozenset(hashes.tolist()))
        signature = _signatures([hashes])[0]
        for band in range(NUM_HASHES // self.rows):
            key = (band, signature[band * self.rows : (band + 1) * self.rows].tobytes())
            self._buckets.setdefault(key, []).append(index)
        return index


def brute_force_pairs(texts: list[str], threshold: float) -> list[tuple[int, int]]:
    """Başvuru gerçeklemesi (n² iş): testlerde LSH sonucunu doğrulamak için."""
    sets = [frozenset(shingle_hashes(fold_for_match(text)).tolist()) for text in texts]
    return [
        (left, right)
        for left in range(len(texts))
        for right in range(left + 1, len(texts))
        if jaccard(sets[left], sets[right]) >= threshold
    ]
