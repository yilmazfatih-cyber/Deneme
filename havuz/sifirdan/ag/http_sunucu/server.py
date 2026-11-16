"""asyncio akışlarıyla HTTP/1.1 sunucusu: bağlantı döngüsü, kalıcı bağlantı, boru hattı, düzgün
kapanış.

Bir bağlantının yaşamı:
    bağlan → [ilk bayt bekle (boşta) → başlıklar (head_timeout) → işleyici → gövdeyi boşalt → yanıt
    yaz]*
           → "Connection: close" / HTTP/1.0 / hata / sunucu kapanıyor / boşta süre doldu → kapat
Boru hattı (pipelining): istemci yanıt beklemeden peş peşe istek yollayabilir; istekler aynı
okuyucudan SIRAYLA okunup yanıtlar aynı sırayla yazıldığı için ek kod gerekmez. Düzgün kapanış
(`close`): dinleme durur, boştaki bağlantılar hemen kapanır, yanıtı süren bağlantılara `grace`
saniye tanınır, sonra kalanlar iptal edilir.
Genişletme: istek başına ortak bir iş (erişim günlüğü, istek kimliği) için işleyiciyi saran bir
işlev yazın; bu dosyaya dokunmanız gerekmez. Örnek: `hiz_ve_vekil/proxy.py`.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import ssl
from collections.abc import Awaitable, Callable
from email.utils import formatdate

from http_sunucu.body import BodyReader
from http_sunucu.headers import Headers
from http_sunucu.messages import Request, Response
from http_sunucu.parser import (
    HttpError,
    Limits,
    PeerClosedError,
    body_framing,
    parse_request_line,
    read_head,
    split_target,
    validate_host,
)
from http_sunucu.texts import error_text, reason

Handler = Callable[[Request], Awaitable[Response]]
logger = logging.getLogger("http_sunucu")
_DISCONNECTS = (ConnectionError, TimeoutError, asyncio.IncompleteReadError, ssl.SSLError)


class _Connection:
    """Bir bağlantının kapanışta bilinmesi gereken durumu."""

    def __init__(self) -> None:
        self.idle = True


class HttpServer:
    """`async with HttpServer(isleyici, port=0) as sunucu:` → `sunucu.port` gerçek kapıdır."""

    def __init__(
        self,
        handler: Handler,
        host: str = "127.0.0.1",
        port: int = 0,
        limits: Limits | None = None,
        ssl_context: ssl.SSLContext | None = None,
    ) -> None:
        self.handler = handler
        self.host = host
        self.port = port
        self.limits = limits or Limits()
        self.ssl_context = ssl_context
        self._server: asyncio.Server | None = None
        self._connections: dict[asyncio.Task[object], _Connection] = {}
        self._closing = False

    @property
    def url(self) -> str:
        return f"{'https' if self.ssl_context else 'http'}://{self.host}:{self.port}"

    async def start(self) -> int:
        self._server = await asyncio.start_server(
            self._on_connection,
            self.host,
            self.port,
            limit=self.limits.max_line + 2,
            ssl=self.ssl_context,
        )
        self.port = int(self._server.sockets[0].getsockname()[1])
        return self.port

    async def close(self, grace: float = 5.0) -> None:
        """Düzgün kapanış (yukarıdaki açıklamaya bakın)."""
        if self._server is None:
            return
        self._closing = True
        self._server.close()
        for task, conn in list(self._connections.items()):
            if conn.idle:
                task.cancel()
        tasks = list(self._connections)
        if tasks:
            _done, pending = await asyncio.wait(tasks, timeout=grace)
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
        await self._server.wait_closed()
        self._server = None

    async def __aenter__(self) -> HttpServer:
        await self.start()
        return self

    async def __aexit__(self, *exc_info: object) -> None:
        await self.close()

    async def _on_connection(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        task = asyncio.current_task()
        assert task is not None
        self._connections[task] = conn = _Connection()
        try:
            if len(self._connections) > self.limits.max_connections or self._closing:
                await self._send_error(writer, HttpError(503, "bağlantı sınırı"))
                return
            await self._serve(reader, writer, conn)
        except _DISCONNECTS:
            pass  # istemci koptu ya da yazma zaman aşımı: sessizce kapat
        except Exception:
            logger.exception("Bağlantı beklenmedik biçimde sonlandı")
        finally:
            del self._connections[task]
            writer.close()
            with contextlib.suppress(Exception):
                await asyncio.wait_for(writer.wait_closed(), 1.0)

    async def _serve(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter, conn: _Connection
    ) -> None:
        served = 0
        while not self._closing:
            conn.idle = True
            wait = self.limits.keepalive_timeout if served else self.limits.head_timeout
            try:
                first = await asyncio.wait_for(reader.read(1), wait)
            except TimeoutError:
                return  # hiç bayt gelmedi: sessizce kapat
            if not first:
                return  # istemci kapattı
            conn.idle = False
            try:
                line, headers = await asyncio.wait_for(
                    read_head(reader, self.limits, first), self.limits.head_timeout
                )
                request = self._build_request(line, headers, reader, writer)
            except PeerClosedError:
                return
            except TimeoutError:
                await self._send_error(writer, HttpError(408, "başlıklar zamanında gelmedi"))
                return
            except HttpError as err:
                await self._send_error(writer, err)
                return
            served += 1
            if not await self._respond(request, reader, writer, served):
                return

    def _build_request(
        self,
        line: bytes,
        headers: Headers,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> Request:
        method, target, version = parse_request_line(line)
        path, query, absolute_host = split_target(method, target)
        host = validate_host(version, headers, absolute_host)
        framing, length = body_framing(version, headers)
        if framing == "length" and length > self.limits.max_body:
            raise HttpError(413, "gövde çok büyük")  # 100 Continue göndermeden reddet
        on_first_read = None
        expect = headers.get("expect")
        if expect is not None and version == "HTTP/1.1":  # HTTP/1.0'da Expect yok sayılır
            if expect.lower() != "100-continue":
                raise HttpError(417, "yalnız 100-continue desteklenir")
            if framing != "none":

                async def send_continue() -> None:
                    writer.write(b"HTTP/1.1 100 Continue\r\n\r\n")
                    await asyncio.wait_for(writer.drain(), self.limits.write_timeout)

                on_first_read = send_continue
        body = BodyReader(reader, framing, length, self.limits, on_first_read)
        peer = writer.get_extra_info("peername")
        client = (str(peer[0]), int(peer[1])) if isinstance(peer, tuple) else None
        scheme = "https" if self.ssl_context else "http"
        return Request(method, target, path, query, version, headers, body, host, client, scheme)

    async def _respond(
        self,
        request: Request,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
        served: int,
    ) -> bool:
        """İşleyiciyi çağırır, yanıtı yazar; bağlantı sürecekse True döndürür."""
        force_close = False
        try:
            response = await self.handler(request)
        except HttpError as err:
            response, force_close = Response.error(err.status), True
        except Exception:
            logger.exception("İşleyici hata verdi: %s %s", request.method, request.path)
            response, force_close = Response.error(500), True
        logger.info(
            "%s %s %s → %d", request.client, request.method, request.target, response.status
        )
        if response.upgrade is not None and response.status == 101:
            writer.write(self._encode_head(response.status, response.headers))
            await asyncio.wait_for(writer.drain(), self.limits.write_timeout)
            await response.upgrade(reader, writer)
            return False
        keep = not force_close and self._keep_alive(request, response, served)
        if keep and not request.body.done:
            keep = await self._discard_body(request)
        return await self._write_response(writer, request, response, keep)

    async def _discard_body(self, request: Request) -> bool:
        """İşleyicinin okumadığı gövdeyi atar; atılamıyorsa bağlantı kapanmalıdır (False)."""
        if request.headers.get("expect") and not request.body.started:
            return (
                False  # 100 Continue göndermedik; istemci gövdeyi yollayıp yollamayacağını bilmiyor
            )
        try:
            return await request.body.drain(self.limits.drain_limit)
        except HttpError:
            return False

    def _keep_alive(self, request: Request, response: Response, served: int) -> bool:
        if self._closing or served >= self.limits.max_requests_per_connection:
            return False
        if request.headers.has_token("connection", "close"):
            return False
        if response.headers.has_token("connection", "close"):
            return False
        if request.version == "HTTP/1.0":
            return request.headers.has_token("connection", "keep-alive")
        return True

    @staticmethod
    def _encode_head(status: int, headers: Headers) -> bytes:
        lines = [f"HTTP/1.1 {status} {reason(status)}", *(f"{n}: {v}" for n, v in headers)]
        return ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1")

    async def _write_response(
        self, writer: asyncio.StreamWriter, request: Request, response: Response, keep: bool
    ) -> bool:
        headers = response.headers.copy()
        status, body = response.status, response.body
        no_body = request.method == "HEAD" or status in (204, 304) or status < 200
        chunked = False
        if isinstance(body, bytes):
            explicit_head = request.method == "HEAD" and "content-length" in headers
            if status >= 200 and status not in (204, 304) and not explicit_head:
                headers.set("Content-Length", str(len(body)))  # HEAD: GET'in uzunluğu korunur
        elif "content-length" not in headers and not no_body:
            if request.version == "HTTP/1.1":
                headers.set("Transfer-Encoding", "chunked")
                chunked = True
            else:
                keep = False  # HTTP/1.0: gövdenin sonu bağlantının kapanmasıyla anlaşılır
        headers.setdefault("Date", formatdate(usegmt=True))
        if not keep:
            headers.set("Connection", "close")
        elif request.version == "HTTP/1.0":
            headers.set("Connection", "keep-alive")
        writer.write(self._encode_head(status, headers))
        try:
            if isinstance(body, bytes):
                if not no_body:
                    writer.write(body)
            elif not no_body:
                async for chunk in body:
                    if chunk:
                        writer.write(b"%x\r\n%b\r\n" % (len(chunk), chunk) if chunked else chunk)
                        await asyncio.wait_for(writer.drain(), self.limits.write_timeout)
                if chunked:
                    writer.write(b"0\r\n\r\n")
            await asyncio.wait_for(writer.drain(), self.limits.write_timeout)
        finally:
            aclose = getattr(body, "aclose", None)
            if aclose is not None:
                await aclose()  # akış yarıda kaldıysa açık dosyayı kapatır
        return keep

    async def _send_error(self, writer: asyncio.StreamWriter, err: HttpError) -> None:
        """İstek ayrıştırılamadığında: en kısa hata yanıtı + bağlantıyı kapat."""
        payload = (error_text(err.status) + "\n").encode("utf-8")
        headers = Headers([("Content-Type", "text/plain; charset=utf-8")])
        headers.add("Content-Length", str(len(payload)))
        headers.add("Connection", "close")
        try:
            writer.write(self._encode_head(err.status, headers) + payload)
            await asyncio.wait_for(writer.drain(), self.limits.write_timeout)
        except _DISCONNECTS:
            pass
