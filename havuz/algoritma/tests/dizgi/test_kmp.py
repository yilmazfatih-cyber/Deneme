from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.kmp import kmp_search, prefix_function


def _brute_search(text: str, pattern: str) -> list[int]:
    return [i for i in range(len(text) - len(pattern) + 1) if text[i : i + len(pattern)] == pattern]


def test_hand_checked_example() -> None:
    assert kmp_search("aaaa", "aa") == [0, 1, 2]  # çakışan geçişler
    assert prefix_function("abcabcd") == [0, 0, 0, 1, 2, 3, 0]
    period = 6 - prefix_function("abcabc")[-1]
    assert period == 3  # "abc" tekrarı
    assert kmp_search(["bir", "iki", "bir", "iki"], ["bir", "iki"]) == [0, 2]  # kelime dizisi


def test_edge_cases() -> None:
    assert kmp_search("", "a") == [] and kmp_search("abc", "") == [0, 1, 2, 3]
    assert kmp_search("a", "ab") == [] and prefix_function("") == []
    assert kmp_search("ıiIİ", "i") == [1]  # dört farklı harf


@given(st.text(alphabet="abı", max_size=40), st.text(alphabet="abı", min_size=1, max_size=4))
def test_matches_brute_force(text: str, pattern: str) -> None:
    assert kmp_search(text, pattern) == _brute_search(text, pattern)


@given(st.text(alphabet="ab", max_size=30))
def test_prefix_function_matches_definition(s: str) -> None:
    expected = [
        max(k for k in range(i + 1) if s[:k] == s[i + 1 - k : i + 1] and k <= i)
        for i in range(len(s))
    ]
    assert prefix_function(s) == expected
