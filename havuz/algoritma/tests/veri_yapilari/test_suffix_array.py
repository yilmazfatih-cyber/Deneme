from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.veri_yapilari.suffix_array import (
    lcp_array,
    longest_repeated_substring,
    suffix_array,
)


def _common_prefix(a: str, b: str) -> int:
    length = 0
    while length < min(len(a), len(b)) and a[length] == b[length]:
        length += 1
    return length


def test_hand_checked_example() -> None:
    text = "kırıkkale"
    sa = suffix_array(text)
    assert [text[i:] for i in sa] == sorted(text[i:] for i in range(len(text)))
    assert longest_repeated_substring("abcabcab") == "abcab"  # çakışan tekrar
    assert longest_repeated_substring("şişşiş") == "şiş"


def test_edge_cases() -> None:
    assert suffix_array("") == [] and lcp_array("", []) == []
    assert suffix_array("a") == [0] and lcp_array("a", [0]) == [0]
    assert suffix_array("aaaa") == [3, 2, 1, 0] and lcp_array("aaaa", [3, 2, 1, 0]) == [0, 1, 2, 3]
    assert longest_repeated_substring("") == "" and longest_repeated_substring("abc") == ""


@given(st.text(alphabet="abğı", max_size=40))
def test_matches_brute_force(text: str) -> None:
    sa = suffix_array(text)
    assert sa == sorted(range(len(text)), key=lambda i: text[i:])
    lcp = lcp_array(text, sa)
    expected = [0] * bool(text) + [
        _common_prefix(text[sa[i - 1] :], text[sa[i] :]) for i in range(1, len(sa))
    ]
    assert lcp == expected
    repeated = longest_repeated_substring(text)
    best = max(
        (
            _common_prefix(text[i:], text[j:])
            for i in range(len(text))
            for j in range(i + 1, len(text))
        ),
        default=0,
    )
    assert len(repeated) == best
    occurrences = sum(text.startswith(repeated, i) for i in range(len(text)))  # çakışanlar dahil
    assert repeated == "" or occurrences >= 2
