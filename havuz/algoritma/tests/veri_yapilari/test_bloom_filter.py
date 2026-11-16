from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.bloom_filter import BloomFilter


def test_hand_checked_parameters() -> None:
    bf = BloomFilter(capacity=1000, error_rate=0.01)
    assert (bf.bit_count, bf.hash_count) == (9586, 7)  # m = −n ln p / ln²2, k = m/n · ln 2
    assert len(bf) == 0 and bf.expected_false_positive_rate() == 0.0


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        BloomFilter(0, 0.1)
    with pytest.raises(ValueError):
        BloomFilter(10, 1.0)
    bf = BloomFilter(10, 0.1)
    bf.add(b"\x00")
    bf.add("")
    assert b"\x00" in bf and "" in bf and 42 not in bf


def test_false_positive_rate_close_to_target() -> None:
    bf = BloomFilter(capacity=2000, error_rate=0.02)
    for i in range(2000):
        bf.add(f"var-{i}")
    false_hits = sum(f"yok-{i}" in bf for i in range(20_000))
    assert false_hits / 20_000 < 0.03  # hedef %2; karma belirlenimci olduğundan sonuç sabit
    assert abs(bf.expected_false_positive_rate() - 0.02) < 0.005


@given(st.lists(st.text(max_size=8), max_size=60))
def test_no_false_negatives(items: list[str]) -> None:
    bf = BloomFilter(capacity=50, error_rate=0.05)
    for item in items:
        bf.add(item)
    assert all(item in bf for item in items)
