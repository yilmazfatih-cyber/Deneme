"""Güvenlik ara katmanları ve parola özeti: CSRF, güvenlik başlıkları, scrypt.

CSRF (siteler arası istek sahteciliği): kötü bir site, kullanıcının tarayıcısına sizin sitenize form
POST ettirebilir; tarayıcı çerezi de ekler. Savunma üç katmanlı:
    1. SameSite=Lax oturum çerezi (siteler arası POST'ta çerez gitmez)
    2. Sec-Fetch-Site / Origin başlığı başka kökense → 403
    3. Eşzamanlayıcı belirteç: formdaki gizli "_csrf" alanı (ya da X-CSRF-Token) = oturumdaki
Parola: `hashlib.scrypt` (bellek-zor, stdlib). Kayıt "scrypt$n$r$p$tuz$özet" biçiminde saklanır;
parametreler kayıtta durduğu için ileride yükseltilebilir.
Genişletme: yeni bir güvenlik başlığı için `DEFAULT_HEADERS`'a ekleyin; testi `test_guvenlik.py`'de.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from collections.abc import Callable

from web_catisi.request import Request
from web_catisi.response import Response
from web_catisi.texts import text

Handler = Callable[[Request], Response]
Middleware = Callable[[Request, Handler], Response]
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
DEFAULT_CSP = (
    "default-src 'self'; form-action 'self'; frame-ancestors 'none'; "
    "base-uri 'none'; object-src 'none'"
)
DEFAULT_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Cross-Origin-Opener-Policy": "same-origin",
}


def _forbidden() -> Response:
    return Response(text("csrf"), 403, content_type="text/plain; charset=utf-8")


def csrf_middleware(field: str = "_csrf", header: str = "X-CSRF-Token") -> Middleware:
    """Durum değiştiren her istekte köken ve belirteç denetimi (oturum ara katmanından SONRA
    koşar).
    """

    def middleware(request: Request, call_next: Handler) -> Response:
        if request.method in SAFE_METHODS:
            return call_next(request)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return _forbidden()
        origin = request.headers.get("origin")
        if origin is not None and origin != request.origin:
            return _forbidden()
        if request.session is None:
            raise RuntimeError("CSRF denetimi için önce oturum ara katmanı gerekir.")
        expected = request.session.get("_csrf")
        sent = request.headers.get(header) or request.form.get(field) or ""
        if not isinstance(expected, str) or not hmac.compare_digest(
            sent.encode(), expected.encode()
        ):
            return _forbidden()
        return call_next(request)

    return middleware


def security_headers_middleware(csp: str = DEFAULT_CSP) -> Middleware:
    """Her yanıta güvenli varsayılan başlıklar (işleyici kendisi koyduysa dokunulmaz)."""

    def middleware(request: Request, call_next: Handler) -> Response:
        response = call_next(request)
        for name, value in {**DEFAULT_HEADERS, "Content-Security-Policy": csp}.items():
            response.headers.setdefault(name, value)
        return response

    return middleware


def hash_password(password: str, *, n: int = 2**14, r: int = 8, p: int = 1) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=32)
    encode = base64.b64encode
    return f"scrypt${n}${r}${p}${encode(salt).decode()}${encode(digest).decode()}"


def verify_password(password: str, stored: str) -> bool:
    """Sabit zamanlı doğrulama; bozuk kayıt False döner (istisna sızmaz)."""
    try:
        kind, n, r, p, salt, digest = stored.split("$")
        if kind != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(
            password.encode("utf-8"),
            salt=base64.b64decode(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)
