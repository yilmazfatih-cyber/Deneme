"""Çatının yanıt nesnesi, çerez yazma ve AÇIK YÖNLENDİRME korumalı yönlendirme hedefi.

Çerez varsayılanları güvenli taraftadır: HttpOnly (JavaScript okuyamaz), SameSite=Lax (siteler arası
POST'ta gönderilmez), Path=/. Secure, https'de açıktır (`App(secure_cookies=...)`).
Açık yönlendirme: "/giris?sonra=//kotu.site" gibi bir parametreyle kullanıcı başka siteye
gönderilebilir. `safe_redirect_target` yalnız aynı sitenin yollarına izin verir.
Genişletme: yeni bir yanıt biçimi için sınıf yöntemi ekleyin (`json` örneğine bakın).
"""

from __future__ import annotations

import json as jsonlib
import re
from typing import Any

from http_sunucu.headers import Headers
from http_sunucu.texts import reason

_COOKIE_NAME_RE = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_COOKIE_VALUE_RE = re.compile(r"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*")


class Response:
    def __init__(
        self,
        body: bytes | str = b"",
        status: int = 200,
        headers: Headers | None = None,
        content_type: str | None = "text/html; charset=utf-8",
    ) -> None:
        self.body = body.encode("utf-8") if isinstance(body, str) else body
        self.status = status
        self.headers = headers or Headers()
        if content_type and "content-type" not in self.headers:
            self.headers.set("Content-Type", content_type)

    @property
    def status_line(self) -> str:
        return f"{self.status} {reason(self.status)}"

    @classmethod
    def text(cls, text: str, status: int = 200) -> Response:
        return cls(text, status, content_type="text/plain; charset=utf-8")

    @classmethod
    def json(cls, value: Any, status: int = 200) -> Response:
        payload = jsonlib.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return cls(payload, status, content_type="application/json")

    @classmethod
    def redirect(cls, location: str, status: int = 303) -> Response:
        """303: form gönderiminden sonra GET ile yeni sayfaya (Post/Redirect/Get)."""
        return cls(b"", status, Headers([("Location", location)]), content_type=None)

    def set_cookie(
        self,
        name: str,
        value: str,
        *,
        max_age: int | None = None,
        path: str = "/",
        secure: bool = False,
        httponly: bool = True,
        samesite: str = "Lax",
    ) -> None:
        if not _COOKIE_NAME_RE.fullmatch(name) or not _COOKIE_VALUE_RE.fullmatch(value):
            raise ValueError(
                'Çerez adı/değeri geçersiz karakter içeriyor (boşluk, ;, ", \\ olamaz).'
            )
        if samesite not in ("Strict", "Lax", "None"):
            raise ValueError("SameSite Strict, Lax ya da None olmalı.")
        parts = [f"{name}={value}", f"Path={path}", f"SameSite={samesite}"]
        if max_age is not None:
            parts.append(f"Max-Age={max_age}")
        if secure or samesite == "None":
            parts.append("Secure")
        if httponly:
            parts.append("HttpOnly")
        self.headers.add("Set-Cookie", "; ".join(parts))

    def delete_cookie(self, name: str, path: str = "/") -> None:
        self.set_cookie(name, "", max_age=0, path=path)


def safe_redirect_target(target: str | None, default: str = "/") -> str:
    """Yalnız bu sitenin göreli yolu döner; aksi hâlde `default`.

    Reddedilenler: "//kotu.site" (şemasız mutlak), "/\\\\kotu.site" (tarayıcı \\'yi / sayar),
    "https://…", "javascript:…", içinde sekme/satır sonu olanlar (tarayıcı onları silip "//"ya
    çevirir).
    """
    if not target or not target.startswith("/") or target.startswith(("//", "/\\")):
        return default
    if "\\" in target or any(ord(ch) < 0x20 or ord(ch) == 0x7F for ch in target):
        return default
    return target
