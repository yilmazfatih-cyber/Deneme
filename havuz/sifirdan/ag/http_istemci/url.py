"""URL ayrıştırma ve göreli adres çözümleme (RFC 3986 §5.2) — yönlendirmeler için.

    "https://Köprü.örnek:8443/a b?x=ç#k"
      → Url(scheme="https", host="xn--kpr-sna6a.xn--rnek-4qa", port=8443, path="/a%20b",
            query="x=%C3%A7", fragment="k")
Güvenlik: adreste CR/LF/NUL/sekme varsa reddedilir (istek satırına başlık enjeksiyonu);
"kullanıcı:parola@" bölümü reddedilir (parolanın günlüklere ve yönlendirmelere sızmasını önlemek,
"https://banka@kotu.site" aldatmacası). Yalnız http ve https desteklenir.
Genişletme: yeni bir şema (ör. "ws") eklenecekse `DEFAULT_PORTS`'a ekleyin ve testine bakın.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass
from urllib.parse import quote

from http_istemci.errors import InvalidUrlError

DEFAULT_PORTS = {"http": 80, "https": 443}
_SCHEME_RE = re.compile(r"([A-Za-z][A-Za-z0-9+.\-]*)://")
_HOST_RE = re.compile(r"[a-z0-9_]([a-z0-9_\-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_\-]*[a-z0-9_])?)*\.?")
_RFC3986_RE = re.compile(r"^(([^:/?#]+):)?(//([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$", re.DOTALL)
_PATH_SAFE = "/%:@!$&'()*+,;=-._~"
_QUERY_SAFE = _PATH_SAFE + "?"


@dataclass(frozen=True)
class Url:
    scheme: str
    host: str
    port: int
    path: str = "/"
    query: str = ""
    fragment: str = ""

    @property
    def target(self) -> str:
        """İstek satırındaki hedef: yol + sorgu (parça adresi asla gönderilmez)."""
        return self.path + (f"?{self.query}" if self.query else "")

    @property
    def host_header(self) -> str:
        host = f"[{self.host}]" if ":" in self.host else self.host
        return host if self.port == DEFAULT_PORTS[self.scheme] else f"{host}:{self.port}"

    @property
    def origin(self) -> tuple[str, str, int]:
        return self.scheme, self.host, self.port

    def __str__(self) -> str:
        fragment = f"#{self.fragment}" if self.fragment else ""
        return f"{self.scheme}://{self.host_header}{self.target}{fragment}"


def _parse_host(raw: str) -> tuple[str, str]:
    """Yetki bölümünden (host, kapı-metni)."""
    if raw.startswith("["):
        end = raw.find("]")
        if end < 0:
            raise InvalidUrlError("IPv6 adresi ']' ile kapanmalı.")
        host, rest = raw[1:end], raw[end + 1 :]
        try:
            ipaddress.IPv6Address(host)
        except ValueError as exc:
            raise InvalidUrlError(f"Geçersiz IPv6 adresi: {host}") from exc
        if rest and not rest.startswith(":"):
            raise InvalidUrlError("IPv6 adresinden sonra yalnız ':kapı' gelebilir.")
        return host.lower(), rest[1:]
    host, _, port = raw.partition(":")
    if not host.isascii():
        try:
            host = host.encode("idna").decode("ascii")  # Türkçe alan adı → xn--…
        except UnicodeError as exc:
            raise InvalidUrlError(f"Alan adı IDNA ile kodlanamadı: {host}") from exc
    host = host.lower()
    if not _HOST_RE.fullmatch(host):
        raise InvalidUrlError(f"Geçersiz sunucu adı: {host!r}")
    return host, port


def parse_url(text: str) -> Url:
    """Mutlak http/https adresini ayrıştırır ve yol/sorguyu yüzde-kodlar."""
    text = text.strip(" ")
    if any(ch in text for ch in "\r\n\t\x00"):
        raise InvalidUrlError("Adreste satır sonu, sekme ya da NUL karakteri olamaz.")
    match = _SCHEME_RE.match(text)
    if not match:
        raise InvalidUrlError("Adres 'http://' ya da 'https://' ile başlamalı.")
    scheme = match.group(1).lower()
    if scheme not in DEFAULT_PORTS:
        raise InvalidUrlError(f"Desteklenmeyen şema: {scheme}")
    rest = text[match.end() :]
    cut = min(
        [i for i in (rest.find("/"), rest.find("?"), rest.find("#")) if i >= 0] or [len(rest)]
    )
    authority, remainder = rest[:cut], rest[cut:]
    if "@" in authority:
        raise InvalidUrlError("Adreste kullanıcı adı/parola desteklenmez (güvenlik).")
    host, port_text = _parse_host(authority)
    if port_text and not (
        port_text.isascii() and port_text.isdigit() and 0 < int(port_text) < 65536
    ):
        raise InvalidUrlError(f"Geçersiz kapı: {port_text}")
    remainder, _, fragment = remainder.partition("#")
    path, _, query = remainder.partition("?")
    return Url(
        scheme=scheme,
        host=host,
        port=int(port_text) if port_text else DEFAULT_PORTS[scheme],
        path=quote(path, safe=_PATH_SAFE) or "/",
        query=quote(query, safe=_QUERY_SAFE),
        fragment=quote(fragment, safe=_QUERY_SAFE),
    )


def remove_dot_segments(path: str) -> str:
    """RFC 3986 §5.2.4: "/a/b/../c/./d" → "/a/c/d"."""
    output: list[str] = []
    while path:
        if path.startswith(("../", "./")):
            path = path[path.index("/") + 1 :]
        elif path.startswith("/./") or path == "/.":
            path = "/" + path[3:]
        elif path.startswith("/../") or path == "/..":
            path = "/" + path[4:]
            if output:
                output.pop()
        elif path in (".", ".."):
            path = ""
        else:
            start = 1 if path.startswith("/") else 0
            end = path.find("/", start)
            end = len(path) if end < 0 else end
            output.append(path[:end])
            path = path[end:]
    return "".join(output)


def _split(reference: str) -> tuple[str | None, str | None, str, str | None, str | None]:
    match = _RFC3986_RE.match(reference)
    assert match is not None  # bu düzenli ifade her dizgiyle eşleşir
    return match.group(2), match.group(4), match.group(5), match.group(7), match.group(9)


def _merge(base_authority: str | None, base_path: str, ref_path: str) -> str:
    if base_authority is not None and not base_path:
        return "/" + ref_path
    return base_path[: base_path.rfind("/") + 1] + ref_path


def resolve_reference(base: str, reference: str) -> str:
    """Göreli bir başvuruyu (Location başlığı) taban adrese göre mutlak adrese çevirir (§5.2.2)."""
    b_scheme, b_auth, b_path, b_query, _ = _split(base)
    r_scheme, r_auth, r_path, r_query, r_frag = _split(reference)
    scheme: str | None
    auth: str | None
    query: str | None
    if r_scheme is not None:
        scheme, auth, path, query = r_scheme, r_auth, remove_dot_segments(r_path), r_query
    elif r_auth is not None:
        scheme, auth, path, query = b_scheme, r_auth, remove_dot_segments(r_path), r_query
    elif not r_path:
        scheme, auth, path = b_scheme, b_auth, b_path
        query = r_query if r_query is not None else b_query
    else:
        if r_path.startswith("/"):
            path = remove_dot_segments(r_path)
        else:
            path = remove_dot_segments(_merge(b_auth, b_path, r_path))
        scheme, auth, query = b_scheme, b_auth, r_query
    result = f"{scheme}:" if scheme is not None else ""
    if auth is not None:
        result += f"//{auth}"
    result += path
    if query is not None:
        result += f"?{query}"
    if r_frag is not None:
        result += f"#{r_frag}"
    return result
