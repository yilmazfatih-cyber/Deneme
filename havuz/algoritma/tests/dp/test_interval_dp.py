from __future__ import annotations

import itertools
import re
from functools import cache

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dp.interval_dp import longest_palindromic_subsequence, min_merge_cost


def _all_merge_costs(piles: list[int]) -> set[int]:
    """Başvuru: her olası birleştirme ağacının maliyeti."""

    @cache
    def go(i: int, j: int) -> frozenset[int]:
        if i == j:
            return frozenset([0])
        total = sum(piles[i : j + 1])
        return frozenset(a + b + total for k in range(i, j) for a in go(i, k) for b in go(k + 1, j))

    return set(go(0, len(piles) - 1))


def _tree_cost(expression: str) -> tuple[int, int]:
    """Parantezli birleştirme ağacının (toplam boyut, maliyet) değeri."""
    stack: list[tuple[int, int] | str] = []
    for token in re.findall(r"\d+|\(|\)", expression):
        if token == "(":
            stack.append(token)
        elif token == ")":
            right, left = stack.pop(), stack.pop()
            stack.pop()
            assert isinstance(left, tuple) and isinstance(right, tuple)
            size = left[0] + right[0]
            stack.append((size, left[1] + right[1] + size))
        else:
            stack.append((int(token), 0))
    result = stack.pop()
    assert isinstance(result, tuple)
    return result


def test_hand_checked_example() -> None:
    # dört dosyayı sırayla birleştirme: maliyet = birleşen boyutların toplamı
    assert min_merge_cost([3, 3, 3, 3])[0] == 24  # (3 3)(3 3): 6 + 6 + 12
    assert longest_palindromic_subsequence("ababaçabab") == "babaçabab"  # 9 harf, ortada ç


def test_edge_cases() -> None:
    assert min_merge_cost([]) == (0, "") and min_merge_cost([7]) == (0, "7")
    assert longest_palindromic_subsequence("") == ""
    assert longest_palindromic_subsequence("x") == "x"
    assert longest_palindromic_subsequence("ab") in {"a", "b"}


@given(st.lists(st.integers(1, 9), min_size=1, max_size=7))
def test_merge_matches_all_trees(piles: list[int]) -> None:
    cost, expression = min_merge_cost(piles)
    assert cost == min(_all_merge_costs(piles))
    assert _tree_cost(expression) == (sum(piles), cost)
    assert [int(t) for t in re.findall(r"\d+", expression)] == piles  # sıra korunur


@given(st.text(alphabet="abç", max_size=11))
def test_palindrome_matches_brute_force(text: str) -> None:
    result = longest_palindromic_subsequence(text)
    assert result == result[::-1]
    it = iter(text)
    assert all(char in it for char in result)  # gerçekten bir alt dizi
    best = max(
        (
            size
            for size in range(len(text) + 1)
            for picked in itertools.combinations(text, size)
            if picked == picked[::-1]
        ),
        default=0,
    )
    assert len(result) == best
