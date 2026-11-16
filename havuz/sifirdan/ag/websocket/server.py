"""WebSocket sunucusu: `http_sunucu` üstünde, el sıkışmadan sonra bağlantıyı devralır.

    istek → websocket_endpoint(isleyici) → check_request (sürüm, anahtar, Origin) → 101 + upgrade
          → sunucu bağlantıyı bize verir → WebSocket(sunucu tarafı) → isleyici(ws, istek)
          → işleyici dönünce kapanış el sıkışması (1000; sunucu kapanıyorsa 1001)
Kullanım:
    async def yanki(ws: WebSocket, istek: Request) -> None:
        async for ileti in ws:
            await ws.send(ileti)
    sunucu = HttpServer(websocket_endpoint(yanki), port=8451)
Genişletme: aynı kapıda hem sayfa hem WebSocket için `PathRouter` örneğine bakın
(`ornek_sohbet.py`).
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Collection

from http_sunucu import Handler, HttpServer, Request, Response
from websocket.connection import WebSocket
from websocket.handshake import HandshakeError, check_request, response_headers

WebSocketHandler = Callable[[WebSocket, Request], Awaitable[None]]


def websocket_endpoint(
    handler: WebSocketHandler,
    *,
    allowed_origins: Collection[str] | None = None,
    subprotocols: Collection[str] = (),
    max_message: int = 1024 * 1024,
) -> Handler:
    """Bir WebSocket işleyicisini `http_sunucu` işleyicisine çevirir."""

    async def endpoint(request: Request) -> Response:
        try:
            accept, chosen = check_request(
                request.method,
                request.version,
                request.host,
                request.headers,
                allowed_origins,
                subprotocols,
            )
        except HandshakeError as err:
            return Response.error(err.status, err.headers)

        async def takeover(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            ws = WebSocket(reader, writer, is_client=False, max_message=max_message)
            code = 1000
            try:
                await handler(ws, request)
            except asyncio.CancelledError:
                code = 1001  # sunucu kapanıyor: "ayrılıyorum"
                raise
            finally:
                await asyncio.shield(ws.close(code))

        return Response(101, response_headers(accept, chosen), upgrade=takeover)

    return endpoint


class PathRouter:
    """En basit yönlendirici: tam yol eşleşmesi → işleyici; yoksa 404. (Desenli yönlendirme:
    web_catisi.)
    """

    def __init__(self, routes: dict[str, Handler]) -> None:
        self.routes = routes

    async def __call__(self, request: Request) -> Response:
        handler = self.routes.get(request.path)
        if handler is None:
            return Response.error(404)
        return await handler(request)


async def serve(
    handler: WebSocketHandler,
    host: str = "127.0.0.1",
    port: int = 0,
    *,
    allowed_origins: Collection[str] | None = None,
    max_message: int = 1024 * 1024,
) -> HttpServer:
    """Kısayol: yalnız WebSocket konuşan bir sunucu başlatır (her yol aynı işleyiciye gider)."""
    endpoint = websocket_endpoint(handler, allowed_origins=allowed_origins, max_message=max_message)
    server = HttpServer(endpoint, host=host, port=port)
    await server.start()
    return server
