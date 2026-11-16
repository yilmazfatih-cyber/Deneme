from __future__ import annotations

import math
import random
from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.rastgele.alias_method import AliasSampler


def test_hand_checked_example() -> None:
    sampler = AliasSampler([0.5, 0.25, 0.25])
    assert len(sampler) == 3
    assert all(math.isclose(p, q) for p, q in zip(sampler.probabilities(), [0.5, 0.25, 0.25]))
    rng = random.Random(3)
    counts = Counter(sampler.sample(rng) for _ in range(40_000))
    assert abs(counts[0] / 40_000 - 0.5) < 0.01


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        AliasSampler([])
    with pytest.raises(ValueError):
        AliasSampler([0, 0])
    with pytest.raises(ValueError):
        AliasSampler([1, -1])
    only = AliasSampler([0, 5, 0])  # sıfır ağırlıklılar hiç seçilmez
    rng = random.Random(1)
    assert {only.sample(rng) for _ in range(500)} == {1}


@given(st.lists(st.integers(0, 50), min_size=1, max_size=20).filter(lambda w: sum(w) > 0))
def test_table_reproduces_weights(weights: list[int]) -> None:
    total = sum(weights)
    probabilities = AliasSampler(weights).probabilities()
    assert all(math.isclose(p, w / total, abs_tol=1e-12) for p, w in zip(probabilities, weights))
