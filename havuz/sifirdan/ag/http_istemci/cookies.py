"""Çerez kavanozu (RFC 6265 §5 + 6265bis önekleri): Set-Cookie'yi saklar, uygun isteğe Cookie ekler.

    Set-Cookie: oturum=abc; Path=/; Secure; HttpOnly; Max-Age=3600
      → saklanır: (ad, alan, yol) anahtarıyla; süre saat kaynağından hesaplanır
    sonraki istek → alan eşleşmesi + yol eşleşmesi + (Secure ise yalnız https) → "Cookie:
    oturum=abc"
Güvenlik kuralları: Domain özniteliği istek sunucusunu kapsamıyorsa çerez reddedilir (başka siteye
çerez yazılamaz); http üzerinden gelen Secure çerez reddedilir; "__Host-" / "__Secure-" önekleri
denetlenir; IP adresine alan çerezi verilmez; tek etiketli alan ("com") reddedilir (tam Kamu Sonek
Listesi YOK, bkz. README).
Genişletme: kalıcı kavanoz için `cookies` listesini JSON'a yazıp okuyan iki küçük işlev ekleyin.
"""

from __future__ import annotations

import ipaddress
import time
from collections.abc import Callable
from dataclasses import dataclass
from email.utils import parsedate_to_datetime

from http_istemci.url import Url


@dataclass
class Cookie:
    name: str
    value: str
    domain: str
    path: str
    host_only: bool
    secure: bool
    http_only: bool
    expires: float | None  # None: oturum çerezi
    creation: float


def _is_ip(host: str) -> bool:
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return False
    return True


def domain_match(host: str, domain: str) -> bool:
    """RFC 6265 §5.1.3: aynı ad ya da `domain`'in alt alanı (IP adreslerinde yalnız tam eşitlik)."""
    return host == domain or (not _is_ip(host) and host.endswith("." + domain))


def default_path(request_path: str) -> str:
    """RFC 6265 §5.1.4: "/a/b/c" → "/a/b"; "/a" ya da "" → "/"."""
    if not request_path.startswith("/") or request_path.count("/") == 1:
        return "/"
    return request_path[: request_path.rfind("/")]


def path_match(request_path: str, cookie_path: str) -> bool:
    if request_path == cookie_path:
        return True
    if not request_path.startswith(cookie_path):
        return False
    return cookie_path.endswith("/") or request_path[len(cookie_path)] == "/"


class CookieJar:
    def __init__(self, clock: Callable[[], float] = time.time, max_cookies: int = 3000) -> None:
        self._clock = clock
        self.max_cookies = max_cookies
        self._cookies: dict[tuple[str, str, str], Cookie] = {}

    @property
    def cookies(self) -> list[Cookie]:
        self._evict_expired()
        return list(self._cookies.values())

    def __len__(self) -> int:
        return len(self.cookies)

    def clear(self) -> None:
        self._cookies.clear()

    def _evict_expired(self) -> None:
        now = self._clock()
        for key in [
            k for k, c in self._cookies.items() if c.expires is not None and c.expires <= now
        ]:
            del self._cookies[key]

    def set_from_header(self, url: Url, header: str) -> bool:
        """Bir Set-Cookie değerini işler; saklandıysa True (reddedildi ya da silindiyse False)."""
        pair, *attributes = header.split(";")
        name, equals, value = pair.partition("=")
        name, value = name.strip(" \t"), value.strip(" \t")
        if not equals or not name or len(name) + len(value) > 4096:
            return False
        now = self._clock()
        expires: float | None = None
        max_age: float | None = None
        domain, path, secure, http_only = "", "", False, False
        for attribute in attributes:
            key, _, val = attribute.partition("=")
            key, val = key.strip(" \t").lower(), val.strip(" \t")
            if key == "expires":
                try:
                    expires = parsedate_to_datetime(val).timestamp()
                except (TypeError, ValueError, OverflowError):
                    continue
            elif key == "max-age" and val.lstrip("-").isdigit() and val.isascii():
                max_age = now + int(val) if int(val) > 0 else float("-inf")
            elif key == "domain" and val:
                domain = val.removeprefix(".").lower()
            elif key == "path" and val.startswith("/"):
                path = val
            elif key == "secure":
                secure = True
            elif key == "httponly":
                http_only = True
        if max_age is not None:
            expires = max_age  # Max-Age, Expires'tan önceliklidir
        host_only = not domain
        if domain:
            if "." not in domain or not domain_match(url.host, domain):
                return False  # başka bir siteye ya da tüm bir üst alana çerez yazma girişimi
        else:
            domain = url.host
        if secure and url.scheme != "https":
            return False
        if name.startswith("__Secure-") and not secure:
            return False
        if name.startswith("__Host-") and (not secure or not host_only or path != "/"):
            return False
        cookie = Cookie(
            name,
            value,
            domain,
            path or default_path(url.path),
            host_only,
            secure,
            http_only,
            expires,
            now,
        )
        ident = (cookie.name, cookie.domain, cookie.path)
        if ident in self._cookies:
            cookie.creation = self._cookies[ident].creation
        if cookie.expires is not None and cookie.expires <= now:
            self._cookies.pop(ident, None)  # süresi geçmiş Set-Cookie = silme komutu
            return False
        self._cookies[ident] = cookie
        if len(self._cookies) > self.max_cookies:
            oldest = min(self._cookies, key=lambda k: self._cookies[k].creation)
            del self._cookies[oldest]
        return True

    def cookie_header(self, url: Url) -> str | None:
        """Bu isteğe gidecek `Cookie` başlığı (yoksa None). Uzun yollu çerezler önce gelir."""
        matching = [
            c
            for c in self.cookies
            if (url.host == c.domain if c.host_only else domain_match(url.host, c.domain))
            and path_match(url.path, c.path)
            and (url.scheme == "https" or not c.secure)
        ]
        matching.sort(key=lambda c: (-len(c.path), c.creation))
        return "; ".join(f"{c.name}={c.value}" for c in matching) or None
