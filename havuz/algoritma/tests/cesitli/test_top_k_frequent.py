from __future__ import annotations

from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.cesitli.top_k_frequent import misra_gries, top_k_frequent


def test_hand_checked_example() -> None:
    searches = ["hava", "döviz", "hava", "maç", "döviz", "hava", "altın"]
    assert top_k_frequent(searches, 3) == [("hava", 3), ("döviz", 2), ("altın", 1)]


def test_edge_cases() -> None:
    assert top_k_frequent([], 3) == [] and top_k_frequent(["a"], 0) == []
    assert top_k_frequent("bbaa", 5) == [("a", 2), ("b", 2)]  # eşitlikte öğe sırası
    with pytest.raises(ValueError):
        top_k_frequent("a", -1)
    with pytest.raises(ValueError):
        misra_gries("a", 1)
    assert misra_gries([], 4) == {}


@given(st.lists(st.integers(0, 9), max_size=80), st.integers(0, 12))
def test_exact_matches_sorted_counter(items: list[int], k: int) -> None:
    expected = sorted(Counter(items).items(), key=lambda p: (-p[1], p[0]))[:k]
    assert top_k_frequent(items, k) == expected


@given(st.lists(st.integers(0, 6), max_size=120), st.integers(2, 6))
def test_misra_gries_guarantees(stream: list[int], k: int) -> None:
    summary = misra_gries(stream, k)
    truth = Counter(stream)
    n = len(stream)
    assert len(summary) <= k - 1
    for item, count in truth.items():
        estimate = summary.get(item, 0)
        assert count - n / k <= estimate <= count  # hiçbir zaman fazla saymaz
        if count > n / k:
            assert item in summary  # ağır vuruşlar kaçmaz
