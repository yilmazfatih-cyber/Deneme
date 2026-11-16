"""WebSocket el sıkışması (RFC 6455 §4): HTTP isteğiyle başlar, "101 Switching Protocols" ile biter.

    istemci: GET /oda HTTP/1.1          sunucu: HTTP/1.1 101 Switching Protocols
             Upgrade: websocket                 Upgrade: websocket
             Connection: Upgrade                Connection: Upgrade
             Sec-WebSocket-Key: <16 bayt b64>   Sec-WebSocket-Accept: b64(SHA1(anahtar + GUID))
             Sec-WebSocket-Version: 13
             Origin: http://site
Accept değeri bir güvenlik önlemi değil, "karşı taraf gerçekten WebSocket konuşuyor" kanıtıdır.
Güvenlik: tarayıcılar WebSocket'e aynı-köken kuralı UYGULAMAZ; kötü bir site kullanıcının
çerezleriyle sizin sunucunuza bağlanabilir (CSWSH). Bu yüzden `Origin` varsayılan olarak Host ile
aynı köken olmalıdır.
Genişletme: alt protokol (`Sec-WebSocket-Protocol`) seçimi `check_request` içinde; yeni bir kural
ekleyecekseniz `tests/websocket/test_el_sikisma.py`'ye bir test ekleyin.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import secrets
from collections.abc import Callable, Collection

from http_sunucu.headers import Headers

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class HandshakeError(Exception):
    """El sıkışma reddedildi; `status` sunucunun döneceği HTTP durum kodudur."""

    def __init__(self, status: int, message: str, headers: Headers | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.headers = headers or Headers()


def accept_key(key: str) -> str:
    """Sec-WebSocket-Accept = base64(SHA-1(anahtar + sabit GUID)). SHA-1 burada protokol
    gereğidir.
    """
    digest = hashlib.sha1((key + GUID).encode("ascii"), usedforsecurity=False).digest()
    return base64.b64encode(digest).decode("ascii")


def new_key(randbytes: Callable[[int], bytes] = secrets.token_bytes) -> str:
    return base64.b64encode(randbytes(16)).decode("ascii")


def _origin_allowed(origin: str | None, host: str, allowed: Collection[str] | None) -> bool:
    if allowed is not None and "*" in allowed:
        return True
    if (
        origin is None
    ):  # tarayıcı dışı istemciler Origin göndermez; çerez taşımadıkları için güvenli
        return True
    if allowed is None:  # varsayılan: yalnız aynı köken
        return origin.lower() in (f"http://{host}".lower(), f"https://{host}".lower())
    return origin in allowed


def check_request(
    method: str,
    version: str,
    host: str,
    headers: Headers,
    allowed_origins: Collection[str] | None = None,
    subprotocols: Collection[str] = (),
) -> tuple[str, str | None]:
    """İstemcinin el sıkışma isteğini doğrular → (accept değeri, seçilen alt protokol)."""
    if method != "GET" or version != "HTTP/1.1":
        raise HandshakeError(400, "WebSocket için HTTP/1.1 GET gerekir.")
    if not headers.has_token("upgrade", "websocket"):
        raise HandshakeError(
            426, "Upgrade: websocket gerekli.", Headers([("Upgrade", "websocket")])
        )
    if not headers.has_token("connection", "upgrade"):
        raise HandshakeError(400, "Connection: Upgrade gerekli.")
    if headers.get_all("sec-websocket-version") != ["13"]:
        version_header = Headers([("Sec-WebSocket-Version", "13")])
        raise HandshakeError(426, "Yalnız WebSocket sürüm 13 desteklenir.", version_header)
    keys = headers.get_all("sec-websocket-key")
    try:
        valid = len(keys) == 1 and len(base64.b64decode(keys[0], validate=True)) == 16
    except binascii.Error:
        valid = False
    if not valid:
        raise HandshakeError(400, "Sec-WebSocket-Key 16 baytlık base64 olmalı.")
    if not _origin_allowed(headers.get("origin"), host, allowed_origins):
        raise HandshakeError(403, "Bu kökenden bağlantıya izin verilmiyor.")
    offered = [p.strip() for v in headers.get_all("sec-websocket-protocol") for p in v.split(",")]
    chosen = next((p for p in offered if p in subprotocols), None)
    return accept_key(keys[0]), chosen


def response_headers(accept: str, subprotocol: str | None) -> Headers:
    headers = Headers([("Upgrade", "websocket"), ("Connection", "Upgrade")])
    headers.add("Sec-WebSocket-Accept", accept)
    if subprotocol:
        headers.add("Sec-WebSocket-Protocol", subprotocol)
    return headers


def client_request(
    host_header: str, target: str, key: str, origin: str | None, subprotocols: Collection[str]
) -> bytes:
    lines = [
        f"GET {target} HTTP/1.1",
        f"Host: {host_header}",
        "Upgrade: websocket",
        "Connection: Upgrade",
        f"Sec-WebSocket-Key: {key}",
        "Sec-WebSocket-Version: 13",
    ]
    if origin:
        lines.append(f"Origin: {origin}")
    if subprotocols:
        lines.append(f"Sec-WebSocket-Protocol: {', '.join(subprotocols)}")
    return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1")


def check_response(status: int, headers: Headers, key: str) -> None:
    """Sunucunun 101 yanıtını doğrular (istemci tarafı)."""
    if status != 101:
        raise HandshakeError(status, f"Sunucu bağlantı yükseltmesini kabul etmedi ({status}).")
    if not headers.has_token("upgrade", "websocket") or not headers.has_token(
        "connection", "upgrade"
    ):
        raise HandshakeError(status, "Sunucu yanıtında Upgrade/Connection başlıkları eksik.")
    if headers.get("sec-websocket-accept") != accept_key(key):
        raise HandshakeError(status, "Sec-WebSocket-Accept değeri tutmuyor.")
