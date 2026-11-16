from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kaliplar.backtracking_template import (
    backtrack,
    balanced_tags,
    exact_orders,
    seating,
)


def test_hand_checked_examples() -> None:
    # genel iskelet: 3 bitlik ve "11" içermeyen tüm diziler
    found = backtrack(
        lambda p: len(p) == 3,
        lambda p: (0, 1),
        lambda p, bit: not (p and p[-1] == 1 and bit == 1),
    )
    assert found == [[0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], [1, 0, 1]]
    assert len(balanced_tags(4)) == 14  # Catalan(4)


def test_edge_cases() -> None:
    assert seating([], []) == [[]] and balanced_tags(0) == [""]
    assert exact_orders([5], 3) == [] and exact_orders([5], 0) == [[]]
    with pytest.raises(ValueError):
        exact_orders([0, 5], 10)


@given(st.integers(1, 5), st.data())
def test_seating_matches_permutation_filter(n: int, data: st.DataObject) -> None:
    guests = [f"k{i}" for i in range(n)]
    pairs = list(itertools.combinations(guests, 2))
    feuds = data.draw(st.lists(st.sampled_from(pairs), max_size=4)) if pairs else []
    banned = {frozenset(f) for f in feuds}
    expected = [
        list(p)
        for p in itertools.permutations(sorted(guests))
        if all(frozenset(pair) not in banned for pair in itertools.pairwise(p))
    ]
    assert seating(guests, feuds) == expected


@given(st.lists(st.integers(1, 9), min_size=1, max_size=3, unique=True), st.integers(0, 20))
def test_orders_match_product_filter(prices: list[int], budget: int) -> None:
    expected = sorted(
        sorted(combo)
        for r in range(budget + 1)
        for combo in itertools.combinations_with_replacement(sorted(prices), r)
        if sum(combo) == budget
    )
    assert sorted(exact_orders(prices, budget)) == expected


@given(st.integers(0, 5))
def test_tags_match_product_filter(pairs: int) -> None:
    def valid(s: str) -> bool:
        depth = 0
        for ch in s:
            depth += 1 if ch == "<" else -1
            if depth < 0:
                return False
        return depth == 0

    expected = ["".join(p) for p in itertools.product("<>", repeat=2 * pairs) if valid("".join(p))]
    assert balanced_tags(pairs) == expected
