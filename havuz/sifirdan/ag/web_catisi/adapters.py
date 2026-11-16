"""Bağdaştırıcılar: aynı `App` hem WSGI sunucularında (wsgiref, gunicorn) hem `http_sunucu` ile
çalışır.

    WSGI:        environ ──request_from_environ──▶ App.handle ──▶ start_response + [gövde]
    http_sunucu: Request(async) ──gövdeyi oku (sınırlı)──▶ iş parçacığında App.handle ──▶ Response
Çatı eşzamanlıdır (WSGI gibi); asyncio sunucusunda olay döngüsünü bloklamasın diye
`asyncio.to_thread`. WSGI'de PATH_INFO "Latin-1 olarak çözülmüş baytlar"dır (PEP 3333); burada
UTF-8'e çevrilir.
Genişletme: ASGI bağdaştırıcısı istenirse aynı kalıpla `asgi_app(app)` yazılır.
"""

from __future__ import annotations

import asyncio
from collections.abc import Callable, Iterable
from typing import Any
from urllib.parse import unquote

from http_sunucu import Handler as ServerHandler
from http_sunucu import Request as ServerRequest
from http_sunucu import Response as ServerResponse
from http_sunucu.headers import Headers
from web_catisi.app import App
from web_catisi.errors import HttpStatusError
from web_catisi.request import Request
from web_catisi.response import Response

StartResponse = Callable[[str, list[tuple[str, str]]], Any]
WsgiApp = Callable[[dict[str, Any], StartResponse], Iterable[bytes]]


def request_from_environ(environ: dict[str, Any], max_body: int) -> Request:
    try:
        path = environ.get("PATH_INFO", "").encode("latin-1").decode("utf-8")
    except UnicodeError as exc:
        raise HttpStatusError(400) from exc
    length_text = environ.get("CONTENT_LENGTH") or "0"
    if not (length_text.isascii() and length_text.isdigit()):
        raise HttpStatusError(400)
    length = int(length_text)
    if length > max_body:
        raise HttpStatusError(413)
    body = environ["wsgi.input"].read(length) if length else b""
    headers = Headers()
    for key, value in environ.items():
        if key.startswith("HTTP_"):
            headers.add(key[5:].replace("_", "-").title(), value)
    for key, name in (("CONTENT_TYPE", "Content-Type"), ("CONTENT_LENGTH", "Content-Length")):
        if environ.get(key):
            headers.add(name, environ[key])
    return Request(
        method=environ.get("REQUEST_METHOD", "GET").upper(),
        path=path or "/",
        query_string=environ.get("QUERY_STRING", ""),
        headers=headers,
        body=body,
        remote_addr=environ.get("REMOTE_ADDR", ""),
        scheme=environ.get("wsgi.url_scheme", "http"),
    )


def wsgi_app(app: App) -> WsgiApp:
    """`wsgiref.simple_server.make_server("127.0.0.1", 8452, wsgi_app(app))` ile kullanılır."""

    def application(environ: dict[str, Any], start_response: StartResponse) -> Iterable[bytes]:
        try:
            response = app.handle(request_from_environ(environ, app.max_body))
        except HttpStatusError as exc:
            response = Response.text(str(exc.status), exc.status)
        response.headers.set("Content-Length", str(len(response.body)))
        start_response(response.status_line, response.headers.items())
        return [] if environ.get("REQUEST_METHOD") == "HEAD" else [response.body]

    return application


def http_handler(app: App) -> ServerHandler:
    """`HttpServer(http_handler(app), port=8452)` ile kullanılır."""

    async def handler(request: ServerRequest) -> ServerResponse:
        body = await request.read(app.max_body)  # sınır aşılırsa sunucu 413 döner
        try:
            path = unquote(request.path, errors="strict")
        except UnicodeDecodeError:
            return ServerResponse.error(400)
        ours = Request(
            method=request.method,
            path=path,
            query_string=request.query,
            headers=request.headers,
            body=body,
            remote_addr=request.client[0] if request.client else "",
            scheme=request.scheme,
        )
        response = await asyncio.to_thread(app.handle, ours)
        return ServerResponse(response.status, response.headers, response.body)

    return handler
