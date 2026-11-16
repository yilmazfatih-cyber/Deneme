from __future__ import annotations

from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.rastgele.consistent_hashing import ConsistentHashRing

KEYS = [f"kullanici:{i}" for i in range(5000)]


def test_adding_node_moves_only_its_share() -> None:
    ring = ConsistentHashRing([f"sunucu-{i}" for i in range(4)], replicas=100)
    before = {k: ring.node_for(k) for k in KEYS}
    ring.add_node("sunucu-4")
    after = {k: ring.node_for(k) for k in KEYS}
    moved = [k for k in KEYS if before[k] != after[k]]
    assert all(after[k] == "sunucu-4" for k in moved)  # yalnız yeni sunucuya taşınır
    assert 0.1 < len(moved) / len(KEYS) < 0.3  # ≈ 1/5; `% N` olsaydı ≈ 4/5 taşınırdı


def test_load_is_balanced_with_virtual_nodes() -> None:
    ring = ConsistentHashRing([f"s{i}" for i in range(5)], replicas=200)
    load = Counter(ring.node_for(k) for k in KEYS)
    assert max(load.values()) / min(load.values()) < 1.5


def test_edge_cases() -> None:
    with pytest.raises(LookupError):
        ConsistentHashRing().node_for("x")
    with pytest.raises(ValueError):
        ConsistentHashRing(replicas=0)
    ring = ConsistentHashRing(["tek"])
    ring.add_node("tek")  # ikinci kez eklemek etkisiz
    assert ring.nodes == ["tek"] and ring.node_for("herhangi") == "tek"
    with pytest.raises(KeyError):
        ring.remove_node("yok")


@given(
    st.lists(
        st.text(alphabet="abcdef", min_size=1, max_size=3), min_size=2, max_size=6, unique=True
    ),
    st.data(),
)
def test_removal_moves_only_removed_keys(nodes: list[str], data: st.DataObject) -> None:
    ring = ConsistentHashRing(nodes, replicas=20)
    victim = data.draw(st.sampled_from(nodes))
    before = {k: ring.node_for(k) for k in KEYS[:300]}
    ring.remove_node(victim)
    for key, owner in before.items():
        now = ring.node_for(key)
        assert now == owner or owner == victim
        assert now != victim
