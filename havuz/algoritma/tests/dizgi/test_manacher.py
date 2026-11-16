from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.manacher import (
    count_palindromic_substrings,
    longest_palindromic_substring,
    palindrome_radii,
)


def test_hand_checked_example() -> None:
    assert longest_palindromic_substring("ey edip adanada pide ye") == "ey edip adanada pide ye"
    assert longest_palindromic_substring("abbac") == "abba"  # çift uzunluk
    assert count_palindromic_substrings("abba") == 6  # a, b, b, a, bb, abba


def test_edge_cases() -> None:
    assert longest_palindromic_substring("") == "" and palindrome_radii("") == [0]
    assert longest_palindromic_substring("x") == "x" and count_palindromic_substrings("") == 0
    assert longest_palindromic_substring("abc") == "a"  # eşitlikte en soldaki
    assert len(longest_palindromic_substring("a" * 50_000)) == 50_000


@given(st.text(alphabet="abı", max_size=30))
def test_matches_brute_force(text: str) -> None:
    palindromes = [
        text[i:j] for i in range(len(text)) for j in range(i + 1, len(text) + 1)
        if text[i:j] == text[i:j][::-1]
    ]  # fmt: skip
    assert count_palindromic_substrings(text) == len(palindromes)
    best = max((len(p) for p in palindromes), default=0)
    result = longest_palindromic_substring(text)
    assert len(result) == best and result == result[::-1] and result in text
    first = next((i for i in range(len(text)) if text[i : i + best] == text[i : i + best][::-1]), 0)
    assert result == text[first : first + best]
