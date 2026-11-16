from __future__ import annotations

import zlib

from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.crc32 import crc32, crc32_bitwise


def test_hand_checked_example() -> None:
    assert crc32(b"123456789") == 0xCBF43926  # standart "check" değeri
    assert crc32(b"") == 0 and crc32(b"The quick brown fox jumps over the lazy dog") == 0x414FA339


def test_detects_single_bit_flips() -> None:
    data = bytearray("Ödeme: 1500 TL".encode())
    reference = crc32(bytes(data))
    for i in range(len(data) * 8):
        data[i // 8] ^= 1 << (i % 8)
        assert crc32(bytes(data)) != reference
        data[i // 8] ^= 1 << (i % 8)


@given(st.binary(max_size=300), st.binary(max_size=100))
def test_matches_zlib_and_chains(first: bytes, second: bytes) -> None:
    assert crc32(first) == zlib.crc32(first) == crc32_bitwise(first)
    assert crc32(second, crc32(first)) == zlib.crc32(first + second)
