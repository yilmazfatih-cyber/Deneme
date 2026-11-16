"""RESP çözücü: istek hangi noktalardan bölünerek gelirse gelsin aynı komutlar çıkmalı (TCP her
şeyi böler)."""

from __future__ import annotations

from hypothesis import given
from hypothesis import strategies as st

from onbellek_sunucu.resp import (
    Error,
    Reply,
    SimpleString,
    encode,
    parse_reply,
    parse_request,
)

COMMANDS = st.lists(
    st.lists(st.binary(max_size=12), min_size=1, max_size=4), min_size=1, max_size=5
)


def _feed(stream: bytes, cuts: list[int]) -> list[list[bytes]]:
    buffer, out, last = bytearray(), [], 0
    for cut in [*sorted(set(cuts)), len(stream)]:
        buffer += stream[last:cut]
        last = cut
        while (request := parse_request(buffer)) is not None:
            out.append(request)
    assert not buffer  # hiçbir şey artmadı
    return out


def test_byte_by_byte() -> None:
    stream = encode([b"SET", b"\xc5\x9fehir", b"\r\nkacis\r\n"])
    assert _feed(stream, list(range(len(stream)))) == [[b"SET", "şehir".encode(), b"\r\nkacis\r\n"]]


@given(COMMANDS, st.lists(st.integers(0, 400), max_size=20))
def test_any_split_gives_same_commands(commands: list[list[bytes]], cuts: list[int]) -> None:
    stream = b"".join(encode(list(command)) for command in commands)
    assert _feed(stream, [c for c in cuts if c < len(stream)]) == commands


def test_reply_roundtrip() -> None:
    reply: list[Reply] = [
        SimpleString("OK"),
        Error("ERR", "olmadı"),
        42,
        b"ikili\r\nveri",
        None,
        ["iç".encode(), 7],
    ]
    data = encode(reply)
    for cut in range(len(data)):  # yarım yanıt: None
        assert parse_reply(bytearray(data[:cut])) is None
    assert parse_reply(bytearray(data)) == (reply, len(data))
