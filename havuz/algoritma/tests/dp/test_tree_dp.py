from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.tree_dp import max_weight_independent_set


@st.composite
def forests(draw: st.DrawFn) -> tuple[list[int], list[tuple[int, int]]]:
    n = draw(st.integers(0, 11))
    weights = draw(st.lists(st.integers(-3, 10), min_size=n, max_size=n))
    edges = [(draw(st.integers(0, v - 1)), v) for v in range(1, n) if draw(st.booleans()) or v % 3]
    return weights, edges


def test_hand_checked_example() -> None:
    # şirket: 0 genel müdür; 1, 2 müdür; 3-6 çalışan. Kimse doğrudan amiriyle aynı partiye gitmez
    fun = [5, 3, 4, 6, 1, 2, 2]
    edges = [(0, 1), (0, 2), (1, 3), (1, 4), (2, 5), (2, 6)]
    assert max_weight_independent_set(fun, edges) == (16, [0, 3, 4, 5, 6])


def test_edge_cases() -> None:
    assert max_weight_independent_set([], []) == (0, [])
    assert max_weight_independent_set([-4], []) == (0, [])  # negatif ağırlık seçilmez
    with pytest.raises(ValueError):
        max_weight_independent_set([1, 1, 1], [(0, 1), (1, 2), (2, 0)])
    with pytest.raises(ValueError):
        max_weight_independent_set([1, 1, 1, 1], [(0, 1), (0, 1)])  # paralel kenar = döngü
    n = 100_000
    total, chosen = max_weight_independent_set([1] * n, [(i, i + 1) for i in range(n - 1)])
    assert total == n // 2 and len(chosen) == n // 2  # derin yol: özyinelemesiz


@given(forests())
def test_matches_brute_force(forest: tuple[list[int], list[tuple[int, int]]]) -> None:
    weights, edges = forest
    n = len(weights)
    best = 0
    for mask in range(1 << n):
        if all(not (mask >> u & 1 and mask >> v & 1) for u, v in edges):
            best = max(best, sum(weights[v] for v in range(n) if mask >> v & 1))
    total, chosen = max_weight_independent_set(weights, edges)
    assert total == best
    picked = set(chosen)
    assert all(not (u in picked and v in picked) for u, v in edges)
    assert sum(weights[v] for v in chosen) == total
