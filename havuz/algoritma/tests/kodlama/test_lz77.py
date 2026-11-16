from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.lz77 import lz77_compress, lz77_decompress


def test_hand_checked_example() -> None:
    text = "kırk küp kırk kapak".encode()
    tokens = lz77_compress(text)
    assert lz77_decompress(tokens) == text
    assert len(tokens) < len(text)  # tekrar eden "kırk k" bir kopyayla yazılır
    assert lz77_compress(b"aaaa") == [(0, 0, 97), (1, 3, -1)]  # çakışan kopya


def test_edge_cases() -> None:
    assert lz77_compress(b"") == [] and lz77_decompress([]) == b""
    assert lz77_compress(b"x") == [(0, 0, 120)]
    with pytest.raises(ValueError):
        lz77_decompress([(3, 2, -1)])  # henüz olmayan geçmişe başvuru
    with pytest.raises(ValueError):
        lz77_compress(b"abc", window=0)
    data = b"abc" * 50
    tokens = lz77_compress(data, window=8, lookahead=4)  # küçük pencere de doğru çalışmalı
    assert lz77_decompress(tokens) == data and all(o <= 8 and n <= 4 for o, n, _ in tokens)


@given(st.binary(max_size=200), st.integers(1, 40), st.integers(1, 20))
def test_round_trip(data: bytes, window: int, lookahead: int) -> None:
    tokens = lz77_compress(data, window, lookahead)
    assert lz77_decompress(tokens) == data
    assert all(0 <= offset <= window and 0 <= length <= lookahead for offset, length, _ in tokens)


@given(st.text(alphabet="ab", min_size=1, max_size=5), st.integers(10, 40))
def test_repetitive_data_compresses(unit: str, repeat: int) -> None:
    data = (unit * repeat).encode()
    assert len(lz77_compress(data)) <= len(unit) + 2 + len(data) // 32  # kopya başına ≤ 33 bayt
