"""WebSocket çerçevesi kodlama/çözme (RFC 6455 §5) — soketten bağımsız çekirdek + asyncio okuyucu.

     0               1               2               3
    +-+-+-+-+-------+-+-------------+-------------------------------+
    |F|R|R|R| işlem |M| uzunluk (7) | uzun. (16/64, 126/127 ise)    |
    |I|S|S|S|  kodu |A|             |                               |
    |N|V|V|V|  (4)  |S|             |                               |
    +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
    | maske anahtarı (4 bayt, MASK=1 ise)  |  yük (maskeliyse XOR'lanmış)
İstemci → sunucu çerçeveleri MASKELİ, sunucu → istemci MASKESİZ olmak zorundadır (önbellek zehirleme
saldırılarına karşı, RFC 6455 §10.3). Denetim çerçeveleri (kapat/ping/pong) en çok 125 bayt ve
bölünmezdir. Her ihlal `ProtocolError` olur; kodu, bağlantıyı kapatırken gönderilecek kapanış
kodudur.
Genişletme: sıkıştırma (permessage-deflate) RSV1 bitini kullanır; eklenecekse `_check_first_byte`
izin vermelidir.
"""

from __future__ import annotations

import asyncio
import struct
from dataclasses import dataclass
from enum import IntEnum


class Opcode(IntEnum):
    CONTINUATION = 0x0
    TEXT = 0x1
    BINARY = 0x2
    CLOSE = 0x8
    PING = 0x9
    PONG = 0xA


_KNOWN_OPCODES = frozenset(int(op) for op in Opcode)


class ProtocolError(Exception):
    """Karşı taraf protokolü çiğnedi; `code` kapanış kodudur (1002, 1007, 1009…)."""

    def __init__(self, code: int, reason: str) -> None:
        super().__init__(f"{code}: {reason}")
        self.code = code
        self.reason = reason


@dataclass(frozen=True)
class Frame:
    fin: bool
    opcode: Opcode
    payload: bytes


def apply_mask(data: bytes, mask: bytes) -> bytes:
    """Yükü 4 baytlık anahtarla XOR'lar (maskeleme ve maske kaldırma aynı işlemdir)."""
    if not data:
        return data
    repeated = (mask * (len(data) // 4 + 1))[: len(data)]
    return (int.from_bytes(data, "big") ^ int.from_bytes(repeated, "big")).to_bytes(
        len(data), "big"
    )


def encode_frame(
    opcode: int, payload: bytes, *, fin: bool = True, mask: bytes | None = None
) -> bytes:
    first = (0x80 if fin else 0) | opcode
    mask_bit = 0x80 if mask is not None else 0
    size = len(payload)
    if size < 126:
        head = struct.pack("!BB", first, mask_bit | size)
    elif size < 65536:
        head = struct.pack("!BBH", first, mask_bit | 126, size)
    else:
        head = struct.pack("!BBQ", first, mask_bit | 127, size)
    if mask is None:
        return head + payload
    return head + mask + apply_mask(payload, mask)


def _check_first_bytes(b0: int, b1: int, expect_masked: bool) -> None:
    if b0 & 0x70:
        raise ProtocolError(1002, "RSV bitleri sıfır olmalı (uzantı anlaşılmadı)")
    opcode = b0 & 0x0F
    if opcode not in _KNOWN_OPCODES:
        raise ProtocolError(1002, f"bilinmeyen işlem kodu {opcode}")
    if opcode >= 0x8 and (not b0 & 0x80 or (b1 & 0x7F) > 125):
        raise ProtocolError(1002, "denetim çerçevesi bölünemez ve 125 baytı aşamaz")
    if bool(b1 & 0x80) != expect_masked:
        side = "maskeli" if expect_masked else "maskesiz"
        raise ProtocolError(1002, f"çerçeve {side} olmalı")


def header_size(first_two: bytes) -> int:
    """İlk iki bayttan başlığın toplam uzunluğu (uzunluk alanı + maske dahil)."""
    length7 = first_two[1] & 0x7F
    extra = 2 if length7 == 126 else 8 if length7 == 127 else 0
    return 2 + extra + (4 if first_two[1] & 0x80 else 0)


def _payload_length(header: bytes, max_size: int) -> int:
    length7 = header[1] & 0x7F
    if length7 == 126:
        length = int(struct.unpack("!H", header[2:4])[0])
        if length < 126:
            raise ProtocolError(1002, "uzunluk en kısa biçimde yazılmamış")
    elif length7 == 127:
        length = int(struct.unpack("!Q", header[2:10])[0])
        if length >> 63:
            raise ProtocolError(1002, "64 bitlik uzunluğun en üst biti sıfır olmalı")
        if length < 65536:
            raise ProtocolError(1002, "uzunluk en kısa biçimde yazılmamış")
    else:
        length = length7
    if length > max_size:
        raise ProtocolError(1009, "çerçeve izin verilen boyutu aşıyor")
    return length


def parse_frame(buffer: bytes, *, expect_masked: bool, max_size: int) -> tuple[Frame, int] | None:
    """Tampondaki ilk tam çerçeve → (çerçeve, tüketilen bayt). Eksikse None."""
    if len(buffer) < 2:
        return None
    _check_first_bytes(buffer[0], buffer[1], expect_masked)
    head = header_size(buffer[:2])
    if len(buffer) < head:
        return None
    length = _payload_length(buffer[:head], max_size)
    if len(buffer) < head + length:
        return None
    payload = buffer[head : head + length]
    if expect_masked:
        payload = apply_mask(payload, buffer[head - 4 : head])
    frame = Frame(bool(buffer[0] & 0x80), Opcode(buffer[0] & 0x0F), payload)
    return frame, head + length


async def read_frame(reader: asyncio.StreamReader, *, expect_masked: bool, max_size: int) -> Frame:
    """Akıştan tam bir çerçeve okur (ihlalde `ProtocolError`, kopmada `IncompleteReadError`)."""
    buffer = await reader.readexactly(2)
    _check_first_bytes(buffer[0], buffer[1], expect_masked)
    buffer += await reader.readexactly(header_size(buffer) - 2)
    length = _payload_length(buffer, max_size)
    buffer += await reader.readexactly(length)
    parsed = parse_frame(buffer, expect_masked=expect_masked, max_size=max_size)
    assert parsed is not None
    return parsed[0]


def close_payload(code: int, reason: str = "") -> bytes:
    data = reason.encode("utf-8")
    if len(data) > 123:
        raise ValueError("Kapanış gerekçesi en çok 123 bayt olabilir.")
    return struct.pack("!H", code) + data


def parse_close_payload(payload: bytes) -> tuple[int, str]:
    """Kapanış çerçevesinin yükü → (kod, gerekçe). Kodsuz kapanış 1005 sayılır (RFC 6455 §7.1.5)."""
    if not payload:
        return 1005, ""
    if len(payload) == 1:
        raise ProtocolError(1002, "kapanış yükü tek bayt olamaz")
    code = int(struct.unpack("!H", payload[:2])[0])
    if not (1000 <= code <= 1014 and code not in (1004, 1005, 1006)) and not 3000 <= code <= 4999:
        raise ProtocolError(1002, f"geçersiz kapanış kodu {code}")
    try:
        reason = payload[2:].decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ProtocolError(1007, "kapanış gerekçesi geçerli UTF-8 değil") from exc
    return code, reason
