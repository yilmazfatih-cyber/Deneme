"""Yanıt nesnesi: gövdeyi çerçevesine göre okur (uzunluk / parçalı / kapanışa dek) ve açar
(gzip/deflate).

Akış (iter_bytes):  bağlantı → aktarım çözümü (chunked) → içerik çözümü (gzip/deflate) → çağırana
parça Gövde tamamen okununca bağlantı yeniden kullanılabilirse havuza döner; yarıda bırakılırsa
kapatılır.
Sıkıştırma bombası: 10 KB'lık gzip 10 GB'a açılabilir. Açılan toplam boyut `max_decompressed`'i
aşarsa `ResponseTooLargeError` (açma işlemi parça parça ve `max_length` ile sınırlı yapılır).
Genişletme: yeni bir içerik kodlaması (ör. "br") için `_Decoder`'a bir dal ekleyin; testte stdlib
ile üretin.
"""

from __future__ import annotations

import json
import re
import zlib
from collections.abc import Callable, Iterator
from typing import Any

from http_istemci.connection import Connection
from http_istemci.errors import (
    ProtocolViolationError,
    RequestTimeoutError,
    ResponseTooLargeError,
)
from http_istemci.url import Url
from http_sunucu.headers import Headers

_HEX_RE = re.compile(r"[0-9A-Fa-f]{1,16}")
_CHARSET_RE = re.compile(r"charset=\"?([A-Za-z0-9_\-:.]+)", re.IGNORECASE)


def response_framing(method: str, status: int, headers: Headers) -> tuple[str, int]:
    """("none" | "length" | "chunked" | "close", uzunluk) — RFC 9112 §6.3."""
    if method == "HEAD" or status in (204, 304) or 100 <= status < 200:
        return "none", 0
    te_values = headers.get_all("transfer-encoding")
    if te_values:
        codings = [c.strip().lower() for v in te_values for c in v.split(",") if c.strip()]
        if codings == ["chunked"]:
            return "chunked", 0
        if "chunked" in codings:
            raise ProtocolViolationError("Desteklenmeyen aktarım kodlaması zinciri.")
        return "close", 0
    lengths = {p.strip() for v in headers.get_all("content-length") for p in v.split(",")}
    if lengths:
        value = lengths.pop()
        if lengths or not (value.isascii() and value.isdigit() and len(value) <= 18):
            raise ProtocolViolationError("Content-Length geçersiz ya da çelişkili.")
        return "length", int(value)
    return "close", 0


class _Decoder:
    """Content-Encoding çözücü; açılan boyutu sınırlar."""

    def __init__(self, encoding: str, limit: int) -> None:
        self.encoding = encoding
        self.limit = limit
        self.produced = 0
        wbits = {"gzip": 16 + zlib.MAX_WBITS, "x-gzip": 16 + zlib.MAX_WBITS}.get(
            encoding, zlib.MAX_WBITS
        )
        self._zlib = (
            zlib.decompressobj(wbits) if encoding in ("gzip", "x-gzip", "deflate") else None
        )
        self._first = True

    def _take(self, data: bytes) -> bytes:
        assert self._zlib is not None
        out = self._zlib.decompress(data, self.limit - self.produced + 1)
        if self._zlib.unconsumed_tail:
            raise ResponseTooLargeError(
                "Açılmış yanıt izin verilen boyutu aşıyor (sıkıştırma bombası?)."
            )
        return out

    def decode(self, data: bytes) -> bytes:
        if self._zlib is None:
            out = data
        else:
            try:
                out = self._take(data)
            except zlib.error:
                if not (self._first and self.encoding == "deflate"):
                    raise ProtocolViolationError("Sıkıştırılmış gövde bozuk.") from None
                self._zlib = zlib.decompressobj(
                    -zlib.MAX_WBITS
                )  # bazı sunucular ham deflate yollar
                out = self._take(data)
        self._first = False
        self.produced += len(out)
        if self.produced > self.limit:
            raise ResponseTooLargeError(
                "Açılmış yanıt izin verilen boyutu aşıyor (sıkıştırma bombası?)."
            )
        return out


class Response:
    def __init__(
        self,
        method: str,
        url: Url,
        version: str,
        status: int,
        reason: str,
        headers: Headers,
        conn: Connection,
        release: Callable[[Connection, bool], None],
        max_body: int,
        max_decompressed: int,
    ) -> None:
        self.url, self.version, self.status, self.reason, self.headers = (
            url,
            version,
            status,
            reason,
            headers,
        )
        self.history: list[Response] = []
        self._conn: Connection | None = conn
        self._release = release
        self._framing, self._remaining = response_framing(method, status, headers)
        self._done = self._framing == "none" or (self._framing == "length" and self._remaining == 0)
        self.max_body = max_body
        self._received = 0
        encoding = (headers.get("content-encoding") or "identity").strip().lower()
        self._decoder = _Decoder(encoding, max_decompressed)
        self._content: bytes | None = None
        keep = not headers.has_token("connection", "close") and self._framing != "close"
        self._reusable = keep and (
            version == "HTTP/1.1" or headers.has_token("connection", "keep-alive")
        )
        if self._done:
            self._finish()

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 400

    def _finish(self) -> None:
        self._done = True
        if self._conn is not None:
            conn, self._conn = self._conn, None
            self._release(conn, self._reusable)

    def _read_exact_line(self, conn: Connection) -> bytes:
        line = conn.readline()
        if not line.endswith(b"\r\n"):
            raise ProtocolViolationError("Parçalı gövdede satır sonu bozuk.")
        return line[:-2]

    def _next_raw(self, size: int) -> bytes:
        conn = self._conn
        if self._done or conn is None:
            return b""
        if self._framing == "chunked" and self._remaining == 0:
            size_line = self._read_exact_line(conn).split(b";", 1)[0].decode("latin-1")
            if not _HEX_RE.fullmatch(size_line):
                raise ProtocolViolationError("Parça boyutu geçersiz.")
            self._remaining = int(size_line, 16)
            if self._remaining == 0:
                while self._read_exact_line(conn):  # son başlıklar (trailer) okunup atlanır
                    pass
                self._finish()
                return b""
        want = size if self._framing == "close" else min(size, self._remaining)
        try:
            data = conn.file.read1(want) if want else b""
        except TimeoutError as exc:
            raise RequestTimeoutError("Gövde okunurken süre doldu.") from exc
        if not data:
            if self._framing == "close":
                self._finish()
                return b""
            raise ProtocolViolationError("Sunucu gövdeyi tamamlamadan bağlantıyı kapattı.")
        self._received += len(data)
        if self._received > self.max_body:
            raise ResponseTooLargeError("Yanıt gövdesi izin verilen boyutu aşıyor.")
        if self._framing != "close":
            self._remaining -= len(data)
            if self._remaining == 0:
                if self._framing == "chunked" and self._read_exact_line(conn):
                    raise ProtocolViolationError("Parçadan sonra CRLF gelmeli.")
                if self._framing == "length":
                    self._finish()
        return data

    def iter_bytes(self, chunk_size: int = 65536) -> Iterator[bytes]:
        """Açılmış gövdeyi parça parça verir (akışla okuma). Hata olursa bağlantı kapatılır."""
        if self._content is not None:
            yield self._content
            return
        try:
            while True:
                raw = self._next_raw(chunk_size)
                if not raw:
                    break
                if decoded := self._decoder.decode(raw):
                    yield decoded
        except BaseException:
            self.close()
            raise

    def read(self) -> bytes:
        if self._content is None:
            self._content = b"".join(self.iter_bytes())
        return self._content

    def text(self, encoding: str | None = None) -> str:
        match = _CHARSET_RE.search(self.headers.get("content-type") or "")
        chosen = encoding or (match.group(1) if match else "utf-8")
        try:
            return self.read().decode(chosen, errors="replace")
        except LookupError:
            return self.read().decode("utf-8", errors="replace")

    def json(self) -> Any:
        return json.loads(self.read())

    def close(self) -> None:
        """Gövde tamamen okunmadıysa bağlantı yeniden kullanılamaz: kapatılır."""
        if self._conn is not None:
            conn, self._conn = self._conn, None
            self._release(conn, self._done and self._reusable)
        self._done = True

    def __enter__(self) -> Response:
        return self

    def __exit__(self, *exc_info: object) -> None:
        self.close()

    def __repr__(self) -> str:
        return f"<Response {self.status} {self.url}>"
