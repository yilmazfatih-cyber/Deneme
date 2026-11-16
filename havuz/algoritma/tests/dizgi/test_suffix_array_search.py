from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from algoritma.dizgi.suffix_array_search import SuffixArrayIndex


def test_hand_checked_example() -> None:
    book = "bir varmış bir yokmuş, evvel zaman içinde bir köy varmış"
    index = SuffixArrayIndex(book)
    assert index.find_all("bir") == [0, 11, 42] and index.count("varmış") == 2
    assert index.count("içinde") == 1 and index.find_all("yok") == [15]


def test_edge_cases() -> None:
    empty = SuffixArrayIndex("")
    assert empty.find_all("a") == [] and empty.count("") == 1 and empty.find_all("") == [0]
    one = SuffixArrayIndex("aaa")
    assert one.find_all("aa") == [0, 1] and one.count("aaaa") == 0 and one.count("") == 4


@given(
    st.text(alphabet="abı", max_size=40),
    st.lists(st.text(alphabet="abı", min_size=1, max_size=4), max_size=6),
)
def test_matches_brute_force(text: str, patterns: list[str]) -> None:
    index = SuffixArrayIndex(text)
    for pattern in patterns:
        expected = [i for i in range(len(text)) if text.startswith(pattern, i)]
        assert index.find_all(pattern) == expected
        assert index.count(pattern) == len(expected)
