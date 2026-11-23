"""Gruplama testleri: blok hesap = tam matris, zincirleme birleşim, iki küme arası çiftler."""

from __future__ import annotations

import numpy as np
import pytest

from goruntu.kopya import groups
from goruntu.kopya.groups import (
    UnionFind,
    cross_pairs,
    distances,
    duplicate_groups,
    group_members,
    near_pairs,
)


def _random_hashes(count: int, columns: int = 5, seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 2**63, size=(count, columns), dtype=np.uint64)


def _brute(hashes: np.ndarray, threshold: int) -> set[tuple[int, int]]:
    """Kaba kuvvet: "birinin tamamı ↔ ötekinin herhangi bir kırpması" en küçük bit farkı."""
    found = set()
    columns = range(hashes.shape[1])
    for i in range(len(hashes)):
        for j in range(i + 1, len(hashes)):
            gaps = [bin(int(hashes[i, s]) ^ int(hashes[j, 0])).count("1") for s in columns]
            gaps += [bin(int(hashes[i, 0]) ^ int(hashes[j, s])).count("1") for s in columns]
            if min(gaps) <= threshold:
                found.add((i, j))
    return found


def test_blok_hesabi_kaba_kuvvetle_ayni(monkeypatch: pytest.MonkeyPatch) -> None:
    hashes = _random_hashes(40)
    hashes[7] = hashes[3] ^ np.uint64(0b111)  # 3 bit fark
    hashes[20, 2] = hashes[11, 0]  # 20'nin kırpması 11'in tamamına eşit
    expected = _brute(hashes, 8)
    monkeypatch.setattr(groups, "_BLOCK_BYTES", 8 * 40 * 3)  # 3 satırlık bloklar
    assert {(p.left, p.right) for p in near_pairs(hashes, 8)} == expected
    assert {(3, 7), (11, 20)} <= expected


def test_zincir_tek_grup_olur() -> None:
    base = np.uint64(0)
    chain = np.asarray([base, base ^ np.uint64(0xFF), base ^ np.uint64(0xFFFF)], dtype=np.uint64)
    labels, pairs = duplicate_groups(chain, 8)
    assert labels == [0, 0, 0]  # 0~1 ve 1~2 (8 bit), 0 ile 2 arası 16 bit olsa da aynı grup
    assert len(pairs) == 2


def test_union_find() -> None:
    finder = UnionFind(5)
    finder.union(3, 4)
    finder.union(0, 4)
    assert finder.labels() == [0, 1, 2, 0, 0]
    assert group_members(finder.labels()) == [[0, 3, 4]]


def test_iki_kume_arasi() -> None:
    left = _random_hashes(10, 1, seed=1)[:, 0]
    right = np.concatenate([_random_hashes(10, 1, seed=2)[:, 0], left[4:5] ^ np.uint64(1)])
    pairs = cross_pairs(left, right, 4)
    assert [(p.left, p.right, p.distance) for p in pairs] == [(4, 10, 1)]


def test_tek_boyutlu_uzaklik() -> None:
    values = np.asarray([0, 0b1011], dtype=np.uint64)
    assert distances(values, values).tolist() == [[0, 3], [3, 0]]


def test_esik_eksi_bir_kapatir() -> None:
    assert near_pairs(_random_hashes(5), -1) == []
