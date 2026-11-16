from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.lzw import lzw_compress, lzw_decompress


def test_hand_checked_example() -> None:
    assert lzw_compress(b"ABABABA") == [65, 66, 256, 258]  # 258 = "ABA": KwKwK durumu
    assert lzw_decompress([65, 66, 256, 258]) == b"ABABABA"
    text = "Şu köşe yaz köşesi, şu köşe kış köşesi".encode()
    assert lzw_decompress(lzw_compress(text)) == text


def test_edge_cases() -> None:
    assert lzw_compress(b"") == [] and lzw_decompress([]) == b""
    assert lzw_compress(b"\xff") == [255]
    with pytest.raises(ValueError):
        lzw_decompress([300])
    with pytest.raises(ValueError):
        lzw_decompress([65, 400])


@given(st.binary(max_size=500))
def test_round_trip(data: bytes) -> None:
    assert lzw_decompress(lzw_compress(data)) == data


@given(st.binary(min_size=1, max_size=4), st.integers(50, 200))
def test_repetition_shrinks_code_count(unit: bytes, repeat: int) -> None:
    data = unit * repeat
    assert len(lzw_compress(data)) < len(data) // 3
