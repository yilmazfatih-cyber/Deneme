"""Çerçeve kodlayıcı/çözücü: RFC 6455 §5.7 örnek çerçeveleri, ihlal kodları, rastgele girdi."""

from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from http_sunucu.headers import Headers
from websocket.frames import (
    Frame,
    Opcode,
    ProtocolError,
    apply_mask,
    close_payload,
    encode_frame,
    parse_close_payload,
    parse_frame,
)
from websocket.handshake import HandshakeError, accept_key, check_request

MASK = bytes([0x37, 0xFA, 0x21, 0x3D])


def parse(data: bytes, masked: bool = False, max_size: int = 1 << 20) -> Frame:
    result = parse_frame(data, expect_masked=masked, max_size=max_size)
    assert result is not None
    frame, used = result
    assert used == len(data)
    return frame


def test_rfc6455_ornek_el_sikisma_anahtari() -> None:
    assert accept_key("dGhlIHNhbXBsZSBub25jZQ==") == "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="


def test_rfc6455_5_7_ornek_cerceveler() -> None:
    hello = b"\x81\x05\x48\x65\x6c\x6c\x6f"
    assert encode_frame(Opcode.TEXT, b"Hello") == hello
    assert parse(hello) == Frame(True, Opcode.TEXT, b"Hello")
    masked = b"\x81\x85\x37\xfa\x21\x3d\x7f\x9f\x4d\x51\x58"
    assert encode_frame(Opcode.TEXT, b"Hello", mask=MASK) == masked
    assert parse(masked, masked=True).payload == b"Hello"
    first, second = b"\x01\x03\x48\x65\x6c", b"\x80\x02\x6c\x6f"
    assert parse(first) == Frame(False, Opcode.TEXT, b"Hel")
    assert parse(second) == Frame(True, Opcode.CONTINUATION, b"lo")
    assert encode_frame(Opcode.PING, b"Hello") == b"\x89\x05Hello"
    pong = b"\x8a\x85\x37\xfa\x21\x3d\x7f\x9f\x4d\x51\x58"
    assert encode_frame(Opcode.PONG, b"Hello", mask=MASK) == pong
    assert encode_frame(Opcode.BINARY, bytes(256))[:4] == b"\x82\x7e\x01\x00"
    assert encode_frame(Opcode.BINARY, bytes(65536))[:10] == b"\x82\x7f" + (65536).to_bytes(
        8, "big"
    )


@pytest.mark.parametrize("size", [0, 125, 126, 65535, 65536])
def test_uzunluk_sinirlari(size: int) -> None:
    payload = bytes(i % 256 for i in range(size))
    assert parse(encode_frame(Opcode.BINARY, payload, mask=MASK), masked=True).payload == payload


def test_eksik_cerceve_none_doner() -> None:
    whole = encode_frame(Opcode.TEXT, b"merhaba", mask=MASK)
    for cut in range(len(whole)):
        assert parse_frame(whole[:cut], expect_masked=True, max_size=100) is None


@pytest.mark.parametrize(
    ("data", "masked", "code"),
    [
        (b"\xc1\x00", False, 1002),  # RSV1 açık
        (b"\x83\x00", False, 1002),  # bilinmeyen işlem kodu
        (b"\x09\x00", False, 1002),  # bölünmüş ping
        (b"\x89\x7e\x00\x7e" + bytes(126), False, 1002),  # 125'ten büyük denetim çerçevesi
        (b"\x81\x05Hello", True, 1002),  # sunucu maskeli bekler, maskesiz geldi
        (b"\x81\x85" + MASK + b"Hello", False, 1002),  # istemci maskesiz bekler
        (b"\x82\x7e\x00\x05abcde", False, 1002),  # 5 bayt 16 bit alanla yazılmış
        (b"\x82\x7f" + (5).to_bytes(8, "big") + b"abcde", False, 1002),
        (b"\x82\x7f" + (1 << 63).to_bytes(8, "big"), False, 1002),  # en üst bit açık
        (b"\x82\x7e\x10\x00", False, 1009),  # 4096 > sınır
    ],
)
def test_protokol_ihlalleri(data: bytes, masked: bool, code: int) -> None:
    with pytest.raises(ProtocolError) as info:
        parse_frame(data, expect_masked=masked, max_size=1000)
    assert info.value.code == code


def test_kapanis_yuku() -> None:
    assert parse_close_payload(b"") == (1005, "")
    assert parse_close_payload(close_payload(1000, "güle güle")) == (1000, "güle güle")
    assert parse_close_payload(close_payload(4321)) == (4321, "")
    for code in (0, 999, 1004, 1005, 1006, 1015, 2000, 2999, 5000):
        with pytest.raises(ProtocolError) as info:
            parse_close_payload(code.to_bytes(2, "big"))
        assert info.value.code == 1002
    with pytest.raises(ProtocolError):
        parse_close_payload(b"\x03")
    with pytest.raises(ProtocolError) as info:
        parse_close_payload(b"\x03\xe8\xff")
    assert info.value.code == 1007
    with pytest.raises(ValueError, match="123"):
        close_payload(1000, "ş" * 62)


@given(st.binary(max_size=300), st.booleans(), st.binary(min_size=4, max_size=4))
def test_kodla_coz_gidis_donus(payload: bytes, fin: bool, mask: bytes) -> None:
    frame = parse(encode_frame(Opcode.BINARY, payload, fin=fin, mask=mask), masked=True)
    assert frame == Frame(fin, Opcode.BINARY, payload)
    assert apply_mask(apply_mask(payload, mask), mask) == payload


@given(st.binary(max_size=200), st.booleans())
def test_rastgele_bayt_cozucuyu_cokertmez(data: bytes, masked: bool) -> None:
    code = None
    try:
        parse_frame(data, expect_masked=masked, max_size=500)
    except ProtocolError as err:
        code = err.code
    assert code in (None, 1002, 1009)


def _handshake_headers(**changes: str | None) -> Headers:
    values: dict[str, str | None] = {
        "Host": "ornek:8081",
        "Upgrade": "websocket",
        "Connection": "keep-alive, Upgrade",
        "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
        "Sec-WebSocket-Version": "13",
    }
    values.update(changes)
    return Headers([(k, v) for k, v in values.items() if v is not None])


@pytest.mark.parametrize(
    ("changes", "status"),
    [
        ({"Upgrade": None}, 426),
        ({"Connection": "keep-alive"}, 400),
        ({"Sec-WebSocket-Version": "8"}, 426),
        ({"Sec-WebSocket-Key": "kisa"}, 400),
        ({"Sec-WebSocket-Key": "@@@@@@@@@@@@@@@@@@@@@@@@"}, 400),
        ({"Origin": "http://kotu-site.example"}, 403),
    ],
)
def test_el_sikisma_reddi(changes: dict[str, str | None], status: int) -> None:
    with pytest.raises(HandshakeError) as info:
        check_request("GET", "HTTP/1.1", "ornek:8081", _handshake_headers(**changes))
    assert info.value.status == status


def test_el_sikisma_koken_ve_alt_protokol() -> None:
    same = _handshake_headers(Origin="http://ornek:8081")
    assert check_request("GET", "HTTP/1.1", "ornek:8081", same)[1] is None
    listed = _handshake_headers(Origin="https://izinli.example")
    check_request("GET", "HTTP/1.1", "ornek:8081", listed, {"https://izinli.example"})
    with_proto = _handshake_headers(**{"Sec-WebSocket-Protocol": "json, sohbet.v1"})
    accept, chosen = check_request("GET", "HTTP/1.1", "x", with_proto, None, ["sohbet.v1"])
    assert (accept, chosen) == ("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", "sohbet.v1")
    with pytest.raises(HandshakeError):
        check_request("POST", "HTTP/1.1", "x", _handshake_headers())
