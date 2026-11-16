"""Küçük, eşzamanlı (bloklayan) istemci: komutu RESP dizisi olarak yollar, yanıtı çözer.

    with CacheClient("127.0.0.1", 8450) as c:
        c.set("şehir", "İzmir", ex=60)
        c.get("şehir")            # b'\\xc4\\xb0zmir'  (bayt; .decode() ile metin)

Hata yanıtı `CacheError` olarak fırlatılır. Genişletme: bağlantı havuzu ve yeniden bağlanma.
"""

from __future__ import annotations

import socket

from .resp import Error, Reply, encode, parse_reply


class CacheError(Exception):
    """Sunucu hata yanıtı verdi (ör. "ERR değer bir tamsayı değil")."""


class CacheClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 8450, timeout: float = 10.0) -> None:
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.buffer = bytearray()

    def execute(self, *args: str | bytes | int) -> Reply:
        parts = [a if isinstance(a, bytes) else str(a).encode() for a in args]
        self.sock.sendall(encode(list(parts)))
        while (parsed := parse_reply(self.buffer)) is None:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("sunucu bağlantıyı kapattı")
            self.buffer += chunk
        reply, used = parsed
        del self.buffer[:used]
        if isinstance(reply, Error):
            raise CacheError(f"{reply.kind} {reply.message}")
        return reply

    def get(self, key: str) -> bytes | None:
        reply = self.execute("GET", key)
        return reply if isinstance(reply, bytes) else None

    def set(self, key: str, value: str | bytes, ex: int | None = None) -> bool:
        args: list[str | bytes | int] = ["SET", key, value]
        if ex is not None:
            args += ["EX", ex]
        return self.execute(*args) is not None

    def delete(self, *keys: str) -> int:
        reply = self.execute("DEL", *keys)
        return reply if isinstance(reply, int) else 0

    def incr(self, key: str) -> int:
        reply = self.execute("INCR", key)
        assert isinstance(reply, int)
        return reply

    def close(self) -> None:
        self.sock.close()

    def __enter__(self) -> CacheClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
