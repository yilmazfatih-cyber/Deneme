from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.varint import decode_varint, encode_varint, zigzag_decode, zigzag_encode


def test_hand_checked_example() -> None:
    # Protocol Buffers belgelerindeki örnekler
    assert encode_varint(150) == b"\x96\x01" and encode_varint(127) == b"\x7f"
    assert encode_varint(128) == b"\x80\x01" and encode_varint(2**64 - 1) == b"\xff" * 9 + b"\x01"
    stream = encode_varint(5) + encode_varint(70000) + encode_varint(0)
    first, pos = decode_varint(stream)
    second, pos = decode_varint(stream, pos)
    third, pos = decode_varint(stream, pos)
    assert (first, second, third, pos) == (5, 70000, 0, len(stream))
    assert zigzag_encode(-64) == 127 and len(encode_varint(zigzag_encode(-64))) == 1


def test_edge_cases() -> None:
    with pytest.raises(ValueError):
        encode_varint(-1)
    with pytest.raises(ValueError, match="yarım"):
        decode_varint(b"\x80")
    with pytest.raises(ValueError, match="uzun"):
        decode_varint(b"\x80\x00")  # 0'ın gereğinden uzun yazımı
    with pytest.raises(ValueError):
        zigzag_decode(-1)
    with pytest.raises(ValueError):
        decode_varint(b"")


@given(st.integers(0, 2**80))
def test_round_trip(value: int) -> None:
    encoded = encode_varint(value)
    assert decode_varint(encoded) == (value, len(encoded))
    assert len(encoded) == max(1, -(-value.bit_length() // 7))  # 7 bit / bayt


@given(st.integers(-(2**70), 2**70))
def test_zigzag_round_trip(value: int) -> None:
    code = zigzag_encode(value)
    assert code >= 0 and zigzag_decode(code) == value
    assert code == (2 * abs(value) - (value < 0))  # tanım: |küçük| → küçük kod
