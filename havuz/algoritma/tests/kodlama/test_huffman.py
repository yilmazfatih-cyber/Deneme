from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.huffman import huffman_code, huffman_decode, huffman_encode


def _best_prefix_code_cost(weights: list[int]) -> int:
    """Kaba kuvvet: Kraft eşitsizliğini (Σ 2^−l ≤ 1) sağlayan tüm uzunluk vektörleri arasında
    en küçük Σ ağırlık · uzunluk. Bu koşulu sağlayan her vektör için bir önek kodu vardır."""
    n = len(weights)
    if n == 1:
        return weights[0]
    best = None
    for lengths in itertools.product(range(1, n), repeat=n):
        if sum(2.0**-length for length in lengths) <= 1:
            cost = sum(w * length for w, length in zip(weights, lengths))
            best = cost if best is None else min(best, cost)
    assert best is not None
    return best


def test_hand_checked_example() -> None:
    bits, table = huffman_encode("aaaabbc")
    assert len(bits) == 10  # a: 1 bit ×4, b: 2 bit ×2, c: 2 bit ×1
    assert "".join(huffman_decode(bits, table)) == "aaaabbc"
    assert huffman_decode("0", {"x": "0"}) == ["x"]


def test_edge_cases() -> None:
    assert huffman_code({}) == {} and huffman_encode("") == ("", {})
    assert huffman_encode("zzz") == ("000", {"z": "0"})  # tek sembol
    with pytest.raises(ValueError):
        huffman_code({"a": 0})
    with pytest.raises(ValueError):
        huffman_decode("010", {"a": "00", "b": "01"})  # son "0" bir kodun yarısı
    words = ["bir", "iki", "bir"]  # semboller dizgi olmak zorunda değil
    bits, table = huffman_encode(words)
    assert huffman_decode(bits, table) == words


@given(st.lists(st.integers(1, 30), min_size=1, max_size=6))
def test_optimal_and_prefix_free(weights: list[int]) -> None:
    code = huffman_code(dict(enumerate(weights)))
    words = list(code.values())
    assert not any(a != b and b.startswith(a) for a in words for b in words)  # önek yok
    cost = sum(weights[s] * len(c) for s, c in code.items())
    assert cost == _best_prefix_code_cost(weights)


@given(st.text(alphabet="abcçğ", max_size=80))
def test_round_trip(text: str) -> None:
    bits, table = huffman_encode(text)
    assert "".join(huffman_decode(bits, table)) == text
