"""İstek kapısı: her isteğe, GÖVDESİ OKUNMADAN ÖNCE uygulanan güvenlik denetimleri (saf ASGI ara katmanı).

Kaynak: `havuz/yz/yz/sunucu/kapi.py` (kopyalanıp uyarlandı).
Sıra: (1) API anahtarı yoksa sunucu "yalnız bu bilgisayar" kipindedir: Host adı 127.0.0.1/localhost/::1
olmalı (DNS yeniden bağlama saldırısına karşı) ve başka siteden gelen değiştirici istek (Origin)
reddedilir (CSRF: herhangi bir web sitesi kullanıcının tarayıcısı üzerinden görüntü yükleyemesin).
(2) Anahtar varsa `Authorization: Bearer …` ya da `X-API-Key` (sabit zamanlı karşılaştırma).
(3) Gövde boyu: Content-Length söylüyorsa hemen, söylemiyorsa okunurken sayılarak (413).
Neden ara katman: FastAPI yüklenen dosyayı uç işlevi çalışmadan ÖNCE okur; denetim uçta olsaydı
kimliksiz biri de sunucuya GB'larca veri yazdırabilirdi.

Genişletme: yeni bir ön denetim → `__call__` içinde gövde okunmadan önce ekleyin;
`tests/test_server.py`'ye "saldırgan denedi, olmadı" testi yazın.
"""

from __future__ import annotations

import hmac
from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

from starlette.datastructures import Headers
from starlette.exceptions import HTTPException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from goruntu.messages import t
from goruntu.text_tr import lower_ascii

LOCAL_NAMES = frozenset({"127.0.0.1", "localhost", "::1"})
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
OPEN_PATHS = frozenset({"/saglik"})
UPLOAD_PATHS = frozenset({"/siniflandir", "/benzer"})
JSON_LIMIT = 64 * 1024
MULTIPART_MARGIN = 64 * 1024  # çok parçalı gövdede dosya dışındaki başlıklar için pay


def host_name(host: str) -> str:
    """Host başlığından adı alır: "LocalHost:8465" → "localhost", "[::1]:8465" → "::1"."""
    value = lower_ascii(host.strip())
    if value.startswith("["):
        return value[1 : value.find("]")] if "]" in value else ""
    return value.rsplit(":", 1)[0] if value.count(":") == 1 else value


def _same_origin(origin: str, host: str) -> bool:
    parts = urlsplit(origin)
    return parts.scheme in ("http", "https") and lower_ascii(parts.netloc) == lower_ascii(host)


def key_matches(headers: Mapping[str, str], expected: str) -> bool:
    """İstek başlıklarındaki anahtar (Bearer ya da X-API-Key) beklenenle aynı mı? (sabit zamanlı)"""
    given = headers.get("x-api-key") or ""
    authorization = headers.get("authorization") or ""
    if lower_ascii(authorization[:7]) == "bearer ":
        given = authorization[7:].strip()
    return hmac.compare_digest(given.encode(), expected.encode())


class RequestGate:
    """`app.add_middleware(RequestGate, state=durum)`; `state` → `api_key`, `limits`, `allowed_origins`."""

    def __init__(self, app: ASGIApp, state: Any) -> None:
        self.app = app
        self.state = state

    def _reject(self, scope: Scope, headers: Headers) -> JSONResponse | None:
        method = scope["method"]
        if self.state.api_key is None:
            host = headers.get("host") or ""
            if host_name(host) not in LOCAL_NAMES:
                return JSONResponse({"hata": t("sunucu.yerel_kip")}, status_code=403)
            origin = headers.get("origin")
            if (
                method not in SAFE_METHODS
                and origin is not None
                and origin not in self.state.allowed_origins
                and not _same_origin(origin, host)
            ):
                return JSONResponse({"hata": t("sunucu.baska_site")}, status_code=403)
        elif scope["path"] not in OPEN_PATHS and not key_matches(headers, self.state.api_key):
            return JSONResponse({"hata": t("sunucu.anahtar")}, status_code=401)
        return None

    def _limit(self, path: str) -> int:
        if path in UPLOAD_PATHS:
            return int(self.state.limits.max_bytes) + MULTIPART_MARGIN
        return JSON_LIMIT

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = Headers(scope=scope)
        rejection = self._reject(scope, headers)
        if rejection is not None:
            await rejection(scope, receive, send)
            return
        limit = self._limit(scope["path"])
        message = t("sunucu.govde_buyuk", mb=f"{limit / 1024 / 1024:.1f}")
        declared = headers.get("content-length") or ""
        if declared.isdigit() and int(declared) > limit:
            await JSONResponse({"hata": message}, status_code=413)(scope, receive, send)
            return
        received = 0

        async def counting_receive() -> Message:
            nonlocal received
            event = await receive()
            if event["type"] == "http.request":
                received += len(event.get("body", b""))
                if received > limit:
                    raise HTTPException(status_code=413, detail=message)
            return event

        await self.app(scope, counting_receive, send)
