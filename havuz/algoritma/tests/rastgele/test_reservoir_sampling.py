from __future__ import annotations

import itertools
import random
from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.rastgele.reservoir_sampling import reservoir_sample, weighted_reservoir_sample
from tests.rastgele.scripted_random import ScriptedRandom


def test_algorithm_r_is_exactly_uniform() -> None:
    # n = 5, k = 2: i = 2, 3, 4 adımlarında 3·4·5 = 60 seçim dizisi; her 2'li küme
    # 60 / C(5, 2) = 6 kez çıkmalı.
    outcomes: Counter[tuple[object, ...] | frozenset[int]] = Counter()
    for choices in itertools.product(range(3), range(4), range(5)):
        sample = reservoir_sample(range(5), 2, ScriptedRandom(list(choices)))
        outcomes[frozenset(sample)] += 1
    assert len(outcomes) == 10 and set(outcomes.values()) == {6}


def test_weighted_frequencies() -> None:
    rng = random.Random(5)
    stream = [("az", 1.0), ("orta", 3.0), ("çok", 6.0)]
    counts = Counter(weighted_reservoir_sample(stream, 1, rng)[0] for _ in range(20_000))
    assert abs(counts["çok"] / 20_000 - 0.6) < 0.02 and abs(counts["az"] / 20_000 - 0.1) < 0.02


def test_edge_cases() -> None:
    assert reservoir_sample([], 3, random.Random(0)) == []
    assert reservoir_sample("ab", 5, random.Random(0)) == ["a", "b"]  # akış k'dan kısa
    assert reservoir_sample(range(10), 0, random.Random(0)) == []
    with pytest.raises(ValueError):
        reservoir_sample([1], -1, random.Random(0))
    with pytest.raises(ValueError):
        weighted_reservoir_sample([("x", 0.0)], 1, random.Random(0))


@given(st.lists(st.integers(), max_size=40, unique=True), st.integers(0, 10), st.integers(0, 99))
def test_samples_are_distinct_members(items: list[int], k: int, seed: int) -> None:
    sample = reservoir_sample(iter(items), k, random.Random(seed))  # tek geçişlik akış
    assert len(sample) == min(k, len(items)) and set(sample) <= set(items)
    assert len(set(sample)) == len(sample)
    weighted = weighted_reservoir_sample(
        ((x, 1.0 + abs(x) % 3) for x in items), k, random.Random(seed)
    )
    assert len(weighted) == min(k, len(items)) and len(set(weighted)) == len(weighted)
