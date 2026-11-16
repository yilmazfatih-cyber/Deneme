from __future__ import annotations

import itertools
import random
from collections import Counter

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.rastgele.fisher_yates import fisher_yates_shuffle, random_permutation, random_sample
from tests.rastgele.scripted_random import ScriptedRandom


def test_every_choice_sequence_gives_a_distinct_permutation() -> None:
    # n = 4: seçim dizileri (3. adımda 0..3, 2. adımda 0..2, 1. adımda 0..1) = 4! tane.
    # Her biri FARKLI bir permütasyon veriyorsa dağılım tam düzgündür (istatistiğe gerek yok).
    outcomes: Counter[tuple[object, ...] | frozenset[int]] = Counter()
    for choices in itertools.product(range(4), range(3), range(2)):
        items = ["a", "b", "c", "d"]
        fisher_yates_shuffle(items, ScriptedRandom(list(choices)))
        outcomes[tuple(items)] += 1
    assert len(outcomes) == 24 and set(outcomes.values()) == {1}


def test_naive_shuffle_is_biased() -> None:
    # Yanlış sürüm: her adımda 0..n−1'den seç. 3³ = 27 dizi 6 permütasyona eşit bölünemez.
    outcomes: Counter[tuple[object, ...] | frozenset[int]] = Counter()
    for choices in itertools.product(range(3), repeat=3):
        items = [0, 1, 2]
        for i, j in enumerate(choices):
            items[i], items[j] = items[j], items[i]
        outcomes[tuple(items)] += 1
    assert sorted(outcomes.values()) == [4, 4, 4, 5, 5, 5]


def test_edge_cases() -> None:
    empty: list[int] = []
    fisher_yates_shuffle(empty, random.Random(0))
    assert empty == [] and random_permutation(1, random.Random(0)) == [0]
    assert random_sample([], 0, random.Random(0)) == []
    with pytest.raises(ValueError):
        random_sample([1, 2], 3, random.Random(0))


def test_sample_positions_are_uniform() -> None:
    # random_sample ile her öğenin seçilme olasılığı k/n olmalı (tohumlu, istatistiksel)
    rng = random.Random(11)
    counts = Counter(x for _ in range(20_000) for x in random_sample(range(5), 2, rng))
    assert all(abs(counts[x] / 20_000 - 0.4) < 0.02 for x in range(5))


@given(st.lists(st.integers(), max_size=30), st.integers(0, 10**6))
def test_result_is_a_permutation(items: list[int], seed: int) -> None:
    shuffled = list(items)
    fisher_yates_shuffle(shuffled, random.Random(seed))
    assert sorted(shuffled) == sorted(items)
    n = len(items)
    assert sorted(random_permutation(n, random.Random(seed))) == list(range(n))
    k = seed % (n + 1)
    sample = random_sample(items, k, random.Random(seed))
    assert len(sample) == k and not Counter(sample) - Counter(items)
