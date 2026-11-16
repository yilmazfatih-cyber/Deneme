from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.hamming_code import decode_bytes, decode_word, encode_bytes, encode_nibble


def test_every_single_bit_error_is_corrected() -> None:
    for nibble in range(16):
        word = encode_nibble(nibble)
        assert decode_word(word) == (nibble, "ok")
        for bit in range(8):
            assert decode_word(word ^ (1 << bit)) == (nibble, "corrected")


def test_every_double_bit_error_is_detected() -> None:
    for nibble in range(16):
        word = encode_nibble(nibble)
        for a, b in itertools.combinations(range(8), 2):
            assert decode_word(word ^ (1 << a) ^ (1 << b)) == (None, "double_error")


def test_minimum_distance_is_four() -> None:
    words = [encode_nibble(n) for n in range(16)]
    distances = [bin(x ^ y).count("1") for x, y in itertools.combinations(words, 2)]
    assert min(distances) == 4  # SECDED'in temeli: tek hatayı düzelt, çifti sez


def test_edge_cases() -> None:
    assert encode_bytes(b"") == b"" and decode_bytes([]) == (b"", 0)
    with pytest.raises(ValueError):
        encode_nibble(16)
    with pytest.raises(ValueError):
        decode_word(256)
    with pytest.raises(ValueError):
        decode_bytes([0])
    broken = bytearray(encode_bytes(b"A"))
    broken[0] ^= 0b11
    with pytest.raises(ValueError, match="çift bit"):
        decode_bytes(broken)


@given(st.binary(max_size=40), st.data())
def test_bytes_survive_one_error_per_word(data: bytes, draw: st.DataObject) -> None:
    words = bytearray(encode_bytes(data))
    flips = 0
    for i in range(len(words)):
        bit = draw.draw(st.integers(-1, 7))
        if bit >= 0:
            words[i] ^= 1 << bit
            flips += 1
    assert decode_bytes(words) == (data, flips)
