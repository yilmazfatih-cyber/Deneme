"""RESP2 (Redis serileştirme protokolü) çözücü ve kodlayıcı — `redis-cli` ile konuşabilecek kadarı.

İstek: bulk dizgi dizisi   *2\\r\\n$3\\r\\nGET\\r\\n$5\\r\\nşehir\\r\\n   (ya da telnet için satır:
"GET şehir\\r\\n") Yanıt türleri:
    +OK\\r\\n            basit dizgi          :42\\r\\n         tamsayı
    -ERR ileti\\r\\n     hata                 $5\\r\\nİzmir\\r\\n  bulk (uzunluk BAYT cinsinden)
    $-1\\r\\n            yok (nil)            *2\\r\\n...       dizi

Çözücü artımlıdır: TCP'den yarım gelen istek için None döner, gerisi gelince devam eder.

Genişletme: RESP3 (eşlem, küme, double) için `encode`'a yeni türler; sürüm HELLO komutuyla seçilir.
"""

from __future__ import annotations

from dataclasses import dataclass

MAX_BULK = 64 * 1024 * 1024
MAX_ITEMS = 1024 * 1024


class ProtocolError(Exception):
    """İstemci RESP kurallarına uymadı; bağlantı kapatılır."""


@dataclass(frozen=True)
class SimpleString:
    text: str


@dataclass(frozen=True)
class Error:
    kind: str  # "ERR", "WRONGTYPE", "OOM", ...
    message: str


Reply = SimpleString | Error | int | bytes | None | list["Reply"]


def encode(reply: Reply) -> bytes:
    if reply is None:
        return b"$-1\r\n"
    if isinstance(reply, SimpleString):
        return b"+" + reply.text.encode() + b"\r\n"
    if isinstance(reply, Error):
        return b"-" + f"{reply.kind} {reply.message}".encode() + b"\r\n"
    if isinstance(reply, bool):
        raise TypeError("bool yerine int kullanın")
    if isinstance(reply, int):
        return b":" + str(reply).encode() + b"\r\n"
    if isinstance(reply, bytes):
        return b"$" + str(len(reply)).encode() + b"\r\n" + reply + b"\r\n"
    return b"*" + str(len(reply)).encode() + b"\r\n" + b"".join(encode(item) for item in reply)


def parse_request(buffer: bytearray) -> list[bytes] | None:
    """Tampondan TAM bir isteği çıkarır (ve tampondan siler); eksikse None, bozuksa
    ProtocolError."""
    if not buffer:
        return None
    if buffer[0:1] != b"*":  # satır kipi (telnet): boşluklarla ayrılmış sözcükler
        end = buffer.find(b"\n")
        if end < 0:
            if len(buffer) > MAX_BULK:
                raise ProtocolError("satır çok uzun")
            return None
        line = bytes(buffer[:end]).rstrip(b"\r")
        del buffer[: end + 1]
        return line.split()
    position = 0
    count, position = _read_int(buffer, 1)
    if count is None:
        return None
    if not 0 <= count <= MAX_ITEMS:
        raise ProtocolError("geçersiz dizi uzunluğu")
    items: list[bytes] = []
    for _ in range(count):
        if position >= len(buffer):
            return None
        if buffer[position : position + 1] != b"$":
            raise ProtocolError("bulk dizgi ($) bekleniyordu")
        length, position = _read_int(buffer, position + 1)
        if length is None:
            return None
        if not 0 <= length <= MAX_BULK:
            raise ProtocolError("geçersiz bulk uzunluğu")
        if len(buffer) < position + length + 2:
            return None
        if buffer[position + length : position + length + 2] != b"\r\n":
            raise ProtocolError("bulk dizgi \\r\\n ile bitmeli")
        items.append(bytes(buffer[position : position + length]))
        position += length + 2
    del buffer[:position]
    return items


def _read_int(buffer: bytearray, start: int) -> tuple[int | None, int]:
    end = buffer.find(b"\r\n", start)
    if end < 0:
        return None, start
    try:
        return int(buffer[start:end]), end + 2
    except ValueError:
        raise ProtocolError("sayı bekleniyordu") from None


def parse_reply(buffer: bytearray) -> tuple[Reply, int] | None:
    """İstemci tarafı: tampondaki ilk yanıtı ve kapladığı bayt sayısını döndürür (eksikse None)."""
    return _parse_reply_at(buffer, 0)


def _parse_reply_at(buffer: bytearray, start: int) -> tuple[Reply, int] | None:
    end = buffer.find(b"\r\n", start)
    if end < 0:
        return None
    kind, line = buffer[start : start + 1], bytes(buffer[start + 1 : end]).decode()
    after = end + 2
    if kind == b"+":
        return SimpleString(line), after
    if kind == b"-":
        error_kind, _, message = line.partition(" ")
        return Error(error_kind, message), after
    if kind == b":":
        return int(line), after
    if kind == b"$":
        length = int(line)
        if length < 0:
            return None, after
        if len(buffer) < after + length + 2:
            return None
        return bytes(buffer[after : after + length]), after + length + 2
    if kind == b"*":
        items: list[Reply] = []
        position = after
        for _ in range(int(line)):
            parsed = _parse_reply_at(buffer, position)
            if parsed is None:
                return None
            items.append(parsed[0])
            position = parsed[1]
        return items, position
    raise ProtocolError(f"bilinmeyen yanıt türü {kind!r}")
