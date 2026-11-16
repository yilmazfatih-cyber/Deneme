"""İstek ve yanıt nesneleri — işleyicinin (handler) gördüğü yüz.

İşleyici sözleşmesi:  `async def isleyici(istek: Request) -> Response`
Yanıt gövdesi ya `bytes` (Content-Length kendiliğinden yazılır) ya da baytlar üreten bir eşzamansız
yineleyicidir (HTTP/1.1'de parçalı aktarılır; `Content-Length` başlığı verilmişse olduğu gibi akar).
`upgrade` doluysa sunucu "101 Switching Protocols" yazar ve bağlantıyı bu işleve devreder
(WebSocket böyle çalışır: `websocket/server.py`).
Genişletme: sık kullanılan yanıt biçimleri için `Response`'a yeni bir sınıf yöntemi ekleyin.
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterable, Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from http_sunucu.body import BodyReader
from http_sunucu.headers import Headers
from http_sunucu.texts import error_text

UpgradeHandler = Callable[[asyncio.StreamReader, asyncio.StreamWriter], Awaitable[None]]
Body = bytes | AsyncIterable[bytes]


@dataclass
class Request:
    method: str
    target: str  # istek satırındaki ham hedef ("/ara?q=k%C3%B6pr%C3%BC")
    path: str  # yüzde-kodlu ham yol ("/ara")
    query: str  # '?' sonrası ham sorgu ("q=k%C3%B6pr%C3%BC")
    version: str  # "HTTP/1.1" ya da "HTTP/1.0"
    headers: Headers
    body: BodyReader
    host: str = ""
    client: tuple[str, int] | None = None  # (ip, kapı) — vekil arkasındaysa vekilin adresidir
    scheme: str = "http"

    async def read(self, limit: int | None = None) -> bytes:
        """Gövdenin tamamını okur (`limit`/`Limits.max_body` aşılırsa 413)."""
        return await self.body.read_all(limit)


@dataclass
class Response:
    status: int = 200
    headers: Headers = field(default_factory=Headers)
    body: Body = b""
    upgrade: UpgradeHandler | None = None

    @classmethod
    def text(cls, text: str, status: int = 200) -> Response:
        headers = Headers([("Content-Type", "text/plain; charset=utf-8")])
        return cls(status, headers, text.encode("utf-8"))

    @classmethod
    def html(cls, html: str, status: int = 200) -> Response:
        headers = Headers([("Content-Type", "text/html; charset=utf-8")])
        return cls(status, headers, html.encode("utf-8"))

    @classmethod
    def json(cls, value: Any, status: int = 200) -> Response:
        headers = Headers([("Content-Type", "application/json")])
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        return cls(status, headers, payload)

    @classmethod
    def error(cls, status: int, extra_headers: Headers | None = None) -> Response:
        """Türkçe gövdeli hata yanıtı; iç ayrıntı içermez."""
        response = cls.text(error_text(status) + "\n", status)
        for name, value in extra_headers or Headers():
            response.headers.add(name, value)
        return response

    @classmethod
    def redirect(cls, location: str, status: int = 303) -> Response:
        return cls(status, Headers([("Location", location)]), b"")
