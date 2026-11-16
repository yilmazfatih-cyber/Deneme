"""Tutarlı karma: taşınan anahtar oranı, yalnız yeni düğüme taşınma, yük dengesi, ağırlık, jump hash
başvuru vektörleri ve parçalı depoda üyelik değişirken hiçbir anahtarın kaybolmaması."""

from __future__ import annotations

import random
from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from tutarli_karma import (
    HashRing,
    ShardedStore,
    jump_hash,
    modulo_owner,
    rendezvous_owner,
    stable_hash,
)

KEYS = [f"kullanici:{number}" for number in range(20_000)]
NODES = [f"dugum{number}" for number in range(10)]


def test_adding_a_node_moves_about_one_nth_and_only_to_it() -> None:
    ring = HashRing(NODES)
    before = {key: ring.owner(key) for key in KEYS}
    ring.add("yeni")
    moved = [key for key in KEYS if ring.owner(key) != before[key]]
    assert all(ring.owner(key) == "yeni" for key in moved)  # yalnız yeni düğüme
    assert 0.5 / 11 < len(moved) / len(KEYS) < 1.6 / 11  # ideal 1/11 ≈ %9.1 (ölçüm: %9.8)
    ring.remove("dugum3")
    after = {key: ring.owner(key) for key in KEYS}
    moved_set = set(moved)
    changed = [key for key in KEYS if after[key] != ("yeni" if key in moved_set else before[key])]
    assert {before[key] for key in changed} == {"dugum3"}  # yalnız çıkan düğümün anahtarları


def test_modulo_moves_almost_everything() -> None:
    moved = sum(modulo_owner(k, NODES) != modulo_owner(k, [*NODES, "yeni"]) for k in KEYS)
    assert moved / len(KEYS) > 0.8  # tutarlı karmanın var olma nedeni


def test_balance_weights_and_determinism() -> None:
    ring = HashRing(NODES)
    loads = Counter(ring.owner(key) for key in KEYS)
    assert max(loads.values()) / (len(KEYS) / len(NODES)) < 1.3  # 160 sanal düğüm (ölçüm: 1.2)
    weighted = HashRing({"buyuk": 2.0, "kucuk": 1.0})
    share = Counter(weighted.owner(key) for key in KEYS)
    assert 1.6 < share["buyuk"] / share["kucuk"] < 2.4
    reordered = HashRing(list(reversed(NODES)))
    assert all(reordered.owner(key) == ring.owner(key) for key in KEYS[:2000])
    assert stable_hash("şehir") == stable_hash("şehir")  # süreçten bağımsız (Python hash() değil)


def test_replica_owners() -> None:
    ring = HashRing(NODES)
    for key in KEYS[:500]:
        owners = ring.owners(key, 3)
        assert len(set(owners)) == 3 and owners[0] == ring.owner(key)
    with pytest.raises(ValueError, match="kopya"):
        ring.owners("a", 11)
    with pytest.raises(LookupError, match="boş"):
        HashRing().owner("a")


def test_rendezvous_is_also_minimal() -> None:
    before = {key: rendezvous_owner(key, NODES) for key in KEYS}
    after = {key: rendezvous_owner(key, [*NODES, "yeni"]) for key in KEYS}
    moved = [key for key in KEYS if before[key] != after[key]]
    assert all(after[key] == "yeni" for key in moved) and len(moved) / len(KEYS) < 1.6 / 11


def test_jump_hash_reference_vectors() -> None:
    # Kaynak: github.com/dgryski/go-jump jump_test.go (MIT) — makalenin C++ kodundan ve Guava'dan.
    rows = {
        1: [0, 0, 0, 0, 0, 0, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 17, 17],
        0xDEADBEEF: [0, 1, 2, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 16, 16, 16],
        0x0DDC0FFEEBADF00D: [0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 15, 15, 15, 15],
    }
    for key, expected in rows.items():
        assert [jump_hash(key, n) for n in range(1, len(expected) + 1)] == expected
    golden = [0, 55, 62, 8, 45, 59, 86, 97, 82, 59, 73, 37, 17, 56, 86, 21, 90, 37, 38, 83]
    assert [jump_hash(key, 100) for key in range(20)] == golden
    assert jump_hash(10863919174838991, 11) == 6 and jump_hash(2202, 100001) == 15018


@given(st.integers(0, 2**64 - 1), st.integers(1, 500))
def test_jump_hash_only_moves_to_the_new_bucket(key: int, buckets: int) -> None:
    before, after = jump_hash(key, buckets), jump_hash(key, buckets + 1)
    assert after in (before, buckets)


@given(st.integers(0, 2**32 - 1))
def test_sharded_store_never_loses_keys_during_membership_changes(seed: int) -> None:
    rng = random.Random(seed)
    store = ShardedStore(HashRing(["a", "b", "c"], vnodes=40), replicas=2)
    expected = {f"k{n}": f"değer{n}" for n in range(300)}
    for key, value in expected.items():
        store.put(key, value)
    names = iter(f"yeni{n}" for n in range(100))
    for _ in range(6):
        if len(store.ring) > 2 and rng.random() < 0.5:
            store.leave(rng.choice(sorted(store.ring.weights)))
        else:
            store.join(next(names), rng.choice([0.5, 1.0, 2.0]))
        for key, value in expected.items():
            assert store.get(key) == value
            holders = [node for node, shard in store.shards.items() if key in shard]
            assert sorted(holders) == sorted(store.placement(key))  # tam yerinde, fazlası yok
    with pytest.raises(ValueError, match="Son düğüm"):
        ShardedStore(HashRing(["tek"])).leave("tek")


def test_owner_matches_brute_force_including_wraparound() -> None:
    ring = HashRing(NODES, vnodes=2)  # seyrek halka: son noktadan sonrasına düşen anahtar çok olur
    points = sorted((stable_hash(f"{node}#{i}"), node) for node in NODES for i in range(2))
    wrapped = 0
    for key in KEYS[:5000]:
        digest = stable_hash(key)
        after = [node for point, node in points if point > digest]
        expected = after[0] if after else points[0][1]  # saat yönünde ilk; yoksa başa dön
        wrapped += not after
        assert ring.owner(key) == expected
    assert wrapped > 0  # başa dönme gerçekten sınandı
