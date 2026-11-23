"""Kimlik doğrulama ara katmanı (saf ASGI).

/api/* ve /v1/* isteklerinde:
1. Kimliği çözer: `Authorization: Bearer aip_...` (API anahtarı) veya `aip_session` çerezi (tarayıcı).
2. Uç için gereken rolü (policy.required_role) denetler: yoksa 401, yetmezse 403.
3. İstemcinin gönderdiği `X-AIP-User` / `X-User` başlıklarını SİLER ve yerine doğrulanmış kullanıcıyı
   yazar. Böylece başlığı okuyan mevcut yönlendiriciler değişmeden güvenilir kimlik alır.
   Tek istisna: `delegate` anahtarlı istemci düğümü; onun gönderdiği X-AIP-User kişi adı olarak
   kabul edilir ama rol her zaman 'kullanici' olur.

Kimlik doğrulama kapalıyken (yalnız 127.0.0.1'e bağlı tek kullanıcılı kurulum) davranış eskisiyle
aynıdır: başlıktaki ad kullanılır, rol 'yonetici' sayılır.
"""

from __future__ import annotations

import json
import logging
from http.cookies import SimpleCookie

from ..config import get_settings
from . import policy
from .service import Principal, resolve_token

log = logging.getLogger("aiplatform.auth")

SESSION_COOKIE = "aip_session"
_STRIP = {b"x-aip-user", b"x-user", b"x-aip-role"}


def _header(scope, name: bytes) -> str | None:
    for k, v in scope.get("headers") or []:
        if k == name:
            return v.decode("latin-1")
    return None


def _cookie(scope, name: str) -> str | None:
    raw = _header(scope, b"cookie")
    if not raw:
        return None
    c = SimpleCookie()
    try:
        c.load(raw)
    except Exception:  # noqa: BLE001 — bozuk çerez = çerez yok
        return None
    m = c.get(name)
    return m.value if m else None


def _decode_user(value: str | None) -> str | None:
    """X-AIP-User başlığı Türkçe karakter için yüzde-kodlu gelebilir."""
    if not value:
        return None
    from urllib.parse import unquote

    return unquote(value).strip()[:64] or None


def _encode_user(name: str) -> bytes:
    from urllib.parse import quote

    return quote(name, safe="@._-:").encode("latin-1")


def resolve(scope) -> Principal | None:
    forwarded = _decode_user(_header(scope, b"x-aip-user"))
    auth = _header(scope, b"authorization") or ""
    if auth.lower().startswith("bearer "):
        p = resolve_token(auth[7:].strip(), forwarded_user=forwarded)
        if p is not None:
            return p
    sess = _cookie(scope, SESSION_COOKIE)
    if sess:
        return resolve_token(sess)  # oturum çerezi asla başkası adına çalışmaz
    return None


async def _send_error(send, status: int, code: str, message: str, hint: str | None, extra_headers=()):
    body = json.dumps(
        {"error": {"code": code, "message": message, "hint": hint}}, ensure_ascii=False
    ).encode()
    headers = [
        (b"content-type", b"application/json; charset=utf-8"),
        (b"content-length", str(len(body)).encode()),
    ]
    headers.extend(extra_headers)
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


class AuthMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        if not (path.startswith(("/api/", "/v1/")) or path == "/v1"):
            return await self.app(scope, receive, send)  # statik arayüz dosyaları

        method = scope.get("method", "GET").upper()
        settings = get_settings()

        if not settings.auth_enabled:
            name = (
                _decode_user(_header(scope, b"x-aip-user"))
                or _decode_user(_header(scope, b"x-user"))
                or "yerel"
            )
            principal = Principal(username=name, role="yonetici", via="local")
        elif method == "OPTIONS":
            return await self.app(scope, receive, send)  # CORS ön kontrolü
        else:
            principal = resolve(scope)
            if principal is None and not policy.is_public(method, path):
                return await _send_error(
                    send,
                    401,
                    "unauthenticated",
                    "Bu işlem için giriş yapmanız gerekiyor.",
                    "Tarayıcıda giriş yapın veya 'Authorization: Bearer <API anahtarı>' başlığı gönderin.",
                    extra_headers=[(b"www-authenticate", b'Bearer realm="aiplatform"')],
                )
            if principal is not None and not policy.is_public(method, path):
                need = policy.required_role(method, path)
                if not policy.has_role(principal.role, need):
                    return await _send_error(
                        send,
                        403,
                        "forbidden",
                        f"Bu işlem '{policy.ROLE_LABELS[need]}' rolü gerektiriyor; rolünüz: "
                        f"{policy.ROLE_LABELS.get(principal.role, principal.role)}.",
                        "Yetki için platform yöneticisine başvurun.",
                    )

        headers = [(k, v) for k, v in scope.get("headers") or [] if k not in _STRIP]
        if principal is not None:
            headers.append((b"x-aip-user", _encode_user(principal.username)))
            headers.append((b"x-aip-role", principal.role.encode()))
        scope = dict(scope)
        scope["headers"] = headers
        state = dict(scope.get("state") or {})
        state["principal"] = principal
        state["auth_enabled"] = settings.auth_enabled
        scope["state"] = state
        return await self.app(scope, receive, send)
