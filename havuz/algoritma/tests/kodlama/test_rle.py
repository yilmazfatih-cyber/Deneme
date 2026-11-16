from __future__ import annotations

import itertools

import pytest
from hypothesis import given
from hypothesis import strategies as st

from algoritma.kodlama.rle import rle_decode, rle_decode_bytes, rle_encode, rle_encode_bytes


def test_hand_checked_example() -> None:
    assert rle_encode("ççççaay") == [("ç", 4), ("a", 2), ("y", 1)]
    assert rle_encode_bytes(b"AAAB") == b"\x03A\x01B"
    assert rle_decode_bytes(b"\x02z\x01y") == b"zzy"


def test_edge_cases() -> None:
    assert rle_encode("") == [] and rle_decode([]) == "" and rle_encode_bytes(b"") == b""
    assert rle_encode_bytes(b"\x07" * 256) == b"\xff\x07\x01\x07"  # 255'ten uzun koşu bölünür
    with pytest.raises(ValueError):
        rle_decode([("a", 0)])
    with pytest.raises(ValueError):
        rle_decode_bytes(b"\x01")
    with pytest.raises(ValueError):
        rle_decode_bytes(b"\x00a")


@given(st.text(alphabet="abğ", max_size=60))
def test_text_round_trip_matches_groupby(text: str) -> None:
    runs = rle_encode(text)
    assert runs == [(char, len(list(group))) for char, group in itertools.groupby(text)]
    assert rle_decode(runs) == text


@given(st.binary(max_size=600))
def test_bytes_round_trip(data: bytes) -> None:
    assert rle_decode_bytes(rle_encode_bytes(data)) == data
