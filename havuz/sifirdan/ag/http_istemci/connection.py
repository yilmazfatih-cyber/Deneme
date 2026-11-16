"""Tek bir TCP (+ isteğe bağlı TLS) bağlantısı ve yanıt başlığını okuma.

    Connection(url) → socket.create_connection → (https ise) ssl.wrap_socket(server_hostname=…)
    send(istek baytları) → read_head() → (sürüm, durum, gerekçe, başlıklar); 1xx ara yanıtlar
    atlanır
TLS: varsayılan bağlam `ssl.create_default_context()` — sertifika ve ad doğrulaması AÇIK. Kendinden
imzalı sertifikayla denemek için o sertifikayı `ssl.create_default_context(cafile=...)` ile verin;
doğrulamayı kapatmayın.
Genişletme: HTTP vekili (CONNECT) desteği bu dosyada, `__init__` içinde TLS sarmadan önce eklenir.
"""

from __future__ import annotations

import contextlib
import select
import socket
import ssl

from http_istemci.errors import (
    ConnectError,
    ProtocolViolationError,
    RemoteDisconnectedError,
    RequestTimeoutError,
)
from http_istemci.url import Url
from http_sunucu.headers import Headers
from http_sunucu.parser import HttpError, parse_header_line

MAX_LINE = 8190
MAX_HEADERS = 100


def tls_context(cafile: str | None = None) -> ssl.SSLContext:
    """Doğrulaması açık TLS bağlamı; `cafile` yerel/kendinden imzalı sertifikaya güvenmek
    içindir.
    """
    return ssl.create_default_context(cafile=cafile)


class Connection:
    def __init__(self, url: Url, timeout: float, ssl_context: ssl.SSLContext | None = None) -> None:
        self.origin = url.origin
        self.reused = False
        try:
            sock = socket.create_connection((url.host, url.port), timeout=timeout)
        except TimeoutError as exc:
            raise RequestTimeoutError(f"{url.host_header} adresine bağlanma süresi doldu.") from exc
        except OSError as exc:
            raise ConnectError(f"{url.host_header} adresine bağlanılamadı: {exc}") from exc
        if url.scheme == "https":
            context = ssl_context or tls_context()
            try:
                sock = context.wrap_socket(sock, server_hostname=url.host)
            except ssl.SSLCertVerificationError as exc:
                sock.close()
                raise ConnectError(f"TLS sertifikası doğrulanamadı: {exc.verify_message}") from exc
            except (ssl.SSLError, OSError) as exc:
                sock.close()
                raise ConnectError(f"TLS el sıkışması başarısız: {exc}") from exc
        self.sock = sock
        self.file = sock.makefile("rb")

    @classmethod
    def from_socket(cls, sock: socket.socket, url: Url) -> Connection:
        """Hazır bir soketi sarar (testler, UNIX soketleri ya da önceden kurulmuş tüneller için)."""
        conn = cls.__new__(cls)
        conn.origin, conn.reused, conn.sock = url.origin, False, sock
        conn.file = sock.makefile("rb")
        return conn

    def send(self, data: bytes) -> None:
        try:
            self.sock.sendall(data)
        except TimeoutError as exc:
            raise RequestTimeoutError("İstek gönderilirken süre doldu.") from exc
        except OSError as exc:
            raise RemoteDisconnectedError(f"İstek gönderilemedi: {exc}") from exc

    def readline(self) -> bytes:
        try:
            line = self.file.readline(MAX_LINE + 2)
        except TimeoutError as exc:
            raise RequestTimeoutError("Sunucu zamanında yanıt vermedi.") from exc
        except OSError as exc:
            raise RemoteDisconnectedError(f"Okuma hatası: {exc}") from exc
        if len(line) > MAX_LINE and not line.endswith(b"\n"):
            raise ProtocolViolationError("Yanıt satırı çok uzun.")
        return line

    def read_head(self) -> tuple[str, int, str, Headers]:
        """Son (1xx olmayan) yanıtın başlığı. 101 dışındaki ara yanıtlar okunup atlanır."""
        while True:
            line = self.readline()
            if not line:
                raise RemoteDisconnectedError("Sunucu yanıt vermeden bağlantıyı kapattı.")
            parts = line.decode("latin-1").rstrip("\r\n").split(" ", 2)
            if len(parts) < 2 or parts[0] not in ("HTTP/1.1", "HTTP/1.0"):
                raise ProtocolViolationError("Sunucu geçerli bir HTTP/1.x yanıtı göndermedi.")
            if not (len(parts[1]) == 3 and parts[1].isascii() and parts[1].isdigit()):
                raise ProtocolViolationError("Durum kodu üç basamaklı olmalı.")
            headers = self._read_headers()
            status = int(parts[1])
            if 100 <= status < 200 and status != 101:
                continue
            return parts[0], status, parts[2] if len(parts) > 2 else "", headers

    def _read_headers(self) -> Headers:
        headers = Headers()
        for _ in range(MAX_HEADERS + 1):
            line = self.readline().rstrip(b"\r\n")
            if not line:
                return headers
            try:
                headers.add(*parse_header_line(line))
            except HttpError as exc:
                raise ProtocolViolationError(f"Bozuk yanıt başlığı: {exc.detail}") from exc
        raise ProtocolViolationError("Yanıtta çok fazla başlık var.")

    def is_stale(self) -> bool:
        """Havuzdan alınmadan önce: boştaki bağlantı okunabilir görünüyorsa sunucu kapatmıştır."""
        try:
            readable, _, _ = select.select([self.sock], [], [], 0)
        except (OSError, ValueError):
            return True
        pending = self.sock.pending() if isinstance(self.sock, ssl.SSLSocket) else 0
        return bool(readable) or pending > 0

    def close(self) -> None:
        with contextlib.suppress(OSError):
            self.file.close()
        with contextlib.suppress(OSError):
            self.sock.close()
