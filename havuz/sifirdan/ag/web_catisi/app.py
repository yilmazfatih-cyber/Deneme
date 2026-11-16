"""Uygulama çekirdeği: yollar, ara katman zinciri, hata sayfaları, durağan dosyalar.

Bir isteğin zinciri (dıştan içe):
    güvenlik başlıkları → hata sınırı → oturum → CSRF → [sizin ara katmanlarınız] → yönlendirici →
    işleyici
Hata sınırı: işleyicide `abort(404)` ya da beklenmeyen bir istisna → Türkçe hata sayfası; yığın izi
yalnız günlüğe yazılır, kullanıcıya asla gösterilmez.
Ara katman imzası:  def ara(istek: Request, sonraki: Callable[[Request], Response]) -> Response
Genişletme: yeni bir yol için `@app.route("/desen/<int:id>", methods=("GET", "POST"))`; yeni bir ara
katman için `app.use(islev)`; özel hata sayfası için `@app.error_page(404)`.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

from http_sunucu.headers import Headers
from http_sunucu.static import StaticFiles, content_type
from web_catisi.errors import HttpStatusError
from web_catisi.request import Request
from web_catisi.response import Response
from web_catisi.routing import MethodNotAllowedError, NotFoundError, Router
from web_catisi.security import DEFAULT_CSP, csrf_middleware, security_headers_middleware
from web_catisi.sessions import SessionSigner, session_middleware
from web_catisi.templates import escape, render
from web_catisi.texts import error_text, text

Handler = Callable[[Request], Response]
Middleware = Callable[[Request, Handler], Response]
ErrorPage = Callable[[Request, int], Response | str]
logger = logging.getLogger("web_catisi")
ERROR_TEMPLATE = (
    '<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>{title}</title></head>'
    "<body><h1>{title}</h1><p>{message}</p></body></html>"
)


def _bind(middleware: Middleware, call_next: Handler) -> Handler:
    """Ara katmanı bir sonraki halkaya bağlar (zincirin bir halkası)."""

    def handler(request: Request) -> Response:
        return middleware(request, call_next)

    return handler


class App:
    def __init__(
        self,
        secret_keys: list[bytes],
        *,
        max_body: int = 10 * 1024 * 1024,
        session_max_age: int = 14 * 24 * 3600,
        secure_cookies: bool | None = None,
        csrf: bool = True,
        csp: str = DEFAULT_CSP,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self.router = Router()
        self.max_body = max_body
        self.signer = SessionSigner(secret_keys, session_max_age, clock)
        self._user_middleware: list[Middleware] = []
        self._error_pages: dict[int, ErrorPage] = {}
        self._static: list[tuple[str, StaticFiles]] = []
        self._builtin: list[Middleware] = [
            security_headers_middleware(csp),
            self._error_boundary,
            session_middleware(self.signer, secure=secure_cookies),
        ]
        if csrf:
            self._builtin.append(csrf_middleware())

    def route(
        self, pattern: str, methods: tuple[str, ...] = ("GET",), name: str | None = None
    ) -> Callable[[Callable[..., Any]], Callable[..., Any]]:
        def decorator(endpoint: Callable[..., Any]) -> Callable[..., Any]:
            self.router.add(pattern, endpoint, methods, name)
            return endpoint

        return decorator

    def use(self, middleware: Middleware) -> None:
        self._user_middleware.append(middleware)

    def error_page(self, status: int) -> Callable[[ErrorPage], ErrorPage]:
        def decorator(page: ErrorPage) -> ErrorPage:
            self._error_pages[status] = page
            return page

        return decorator

    def static(self, prefix: str, folder: str | Path) -> None:
        """`prefix` altındaki istekleri klasörden yanıtlar (yol geçişi korumalı; http_sunucu ile
        aynı).
        """
        self._static.append((prefix.rstrip("/") + "/", StaticFiles(folder)))

    def url_for(self, name: str, **params: Any) -> str:
        return self.router.url_for(name, **params)

    def handle(self, request: Request) -> Response:
        """Tek giriş noktası: bağdaştırıcılar (WSGI, http_sunucu) ve test istemcisi bunu çağırır."""
        chain: Handler = self._dispatch
        for middleware in reversed([*self._builtin, *self._user_middleware]):
            chain = _bind(middleware, chain)
        return chain(request)

    def _dispatch(self, request: Request) -> Response:
        for prefix, files in self._static:
            if request.path.startswith(prefix):
                return self._serve_static(request, files, request.path[len(prefix) :])
        try:
            route, params = self.router.match(request.method, request.path)
        except NotFoundError as exc:
            raise HttpStatusError(404) from exc
        except MethodNotAllowedError as exc:
            raise HttpStatusError(405, headers=Headers([("Allow", str(exc))])) from exc
        request.path_params = params
        result = route.endpoint(request, **params)
        return Response(result) if isinstance(result, str) else result

    def _serve_static(self, request: Request, files: StaticFiles, relative: str) -> Response:
        if request.method not in ("GET", "HEAD"):
            raise HttpStatusError(405, headers=Headers([("Allow", "GET, HEAD")]))
        target = files.resolve(relative)
        if target is None or not target.is_file():
            raise HttpStatusError(404)
        info = target.stat()
        etag = f'"{info.st_size:x}-{info.st_mtime_ns:x}"'
        headers = Headers([("ETag", etag), ("Cache-Control", "no-cache")])
        if request.headers.get("if-none-match") == etag:
            return Response(b"", 304, headers, content_type=None)
        return Response(target.read_bytes(), 200, headers, content_type(target.name))

    def _error_boundary(self, request: Request, call_next: Handler) -> Response:
        try:
            return call_next(request)
        except HttpStatusError as exc:
            response = self._error_response(request, exc.status)
            for name, value in exc.headers:
                response.headers.add(name, value)
            return response
        except Exception:
            logger.exception("İşleyici hata verdi: %s %s", request.method, request.path)
            return self._error_response(request, 500)

    def _error_response(self, request: Request, status: int) -> Response:
        page = self._error_pages.get(status)
        if page is not None:
            result = page(request, status)
            return Response(result, status) if isinstance(result, str) else result
        body = render(ERROR_TEMPLATE, title=text("hata.baslik"), message=escape(error_text(status)))
        return Response(body, status)
