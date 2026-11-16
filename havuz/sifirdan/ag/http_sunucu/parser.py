"""HTTP/1.1 istek başlığı ayrıştırıcı (RFC 9112) — sınırlarla ve SIKI kurallarla.

Akış: `read_head` istek satırını ve başlıkları satır satır okur → `parse_request_line`,
`parse_header_line` her satırı doğrular → `body_framing` gövdenin nasıl çerçevelendiğine karar
verir.
Neden sıkı: istek kaçakçılığı (request smuggling), önde duran bir vekil ile arkadaki sunucunun aynı
baytları FARKLI istek sınırlarıyla okumasından doğar. Bu yüzden belirsiz her durum reddedilir:
çıplak LF/CR, katlanmış başlık, adla ':' arasında boşluk, çelişen Content-Length/Transfer-Encoding,
"+5", "0x10", "1_0", Arapça rakam gibi Python'un `int()` işlevinin sessizce kabul ettiği sayılar.
Genişletme: yeni bir sınır için `Limits`'e alan ekleyin, ilgili yerde `HttpError` fırlatın, test
yazın.
"""

from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass

from http_sunucu.headers import TOKEN_RE, Headers

DIGITS_RE = re.compile(r"[0-9]{1,18}")
HEX_RE = re.compile(r"[0-9A-Fa-f]{1,16}")
_TARGET_RE = re.compile(r"[\x21-\x7e]+")  # görünür ASCII; boşluk ve denetim karakteri yok
_HOST_RE = re.compile(r"(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.\-_~!$&'()*+,;=%]*)(:[0-9]{0,5})?")
_FIELD_VALUE_RE = re.compile(r"[\t\x20-\x7e\x80-\xff]*")
_VERSION_RE = re.compile(r"HTTP/[0-9]\.[0-9]")


@dataclass(frozen=True)
class Limits:
    """Sunucunun kabul ettiği en büyük boyutlar ve en uzun bekleme süreleri (saniye)."""

    max_line: int = 8190  # istek satırı ve tek bir başlık satırı (bayt)
    max_headers: int = 100
    max_head_bytes: int = 64 * 1024
    max_body: int = 10 * 1024 * 1024
    head_timeout: float = 10.0  # başlıkların TAMAMI bu sürede gelmeli (Slowloris'e karşı)
    body_timeout: float = 10.0  # gövdeden her okuma bu sürede veri getirmeli
    keepalive_timeout: float = 5.0  # iki istek arasında boşta bekleme
    write_timeout: float = 10.0  # yavaş okuyan istemciye yazarken bekleme
    max_requests_per_connection: int = 1000
    max_connections: int = 512
    drain_limit: int = 64 * 1024  # okunmamış küçük gövde atılır; büyükse bağlantı kapatılır


class HttpError(Exception):
    """İstemciye hata yanıtı olarak dönecek sorun (ör. 400, 413, 431)."""

    def __init__(self, status: int, detail: str = "") -> None:
        super().__init__(f"{status} {detail}".strip())
        self.status = status
        self.detail = detail


class PeerClosedError(Exception):
    """Karşı taraf yeni bir istek başlamadan bağlantıyı kapattı (olağan durum)."""


async def read_line(
    reader: asyncio.StreamReader, limit: int, too_long: int, prefix: bytes = b""
) -> bytes:
    """CRLF ile biten bir satırı okur ve CRLF'siz döndürür. Çıplak LF ya da CR reddedilir."""
    try:
        line = prefix + await reader.readuntil(b"\n")
    except asyncio.LimitOverrunError as exc:
        raise HttpError(too_long, "satır çok uzun") from exc
    except asyncio.IncompleteReadError as exc:
        if not exc.partial and not prefix:
            raise PeerClosedError from exc
        raise HttpError(400, "satır yarıda kesildi") from exc
    if len(line) > limit + 2:
        raise HttpError(too_long, "satır çok uzun")
    if not line.endswith(b"\r\n") or b"\r" in line[:-2]:
        raise HttpError(400, "satır sonu CRLF olmalı")
    return line[:-2]


async def read_head(
    reader: asyncio.StreamReader, limits: Limits, prefix: bytes = b""
) -> tuple[bytes, Headers]:
    """İstek satırını ve başlıkları okur. RFC 9112 §2.2 gereği öndeki en çok iki boş satırı
    atlar.
    """
    line = await read_line(reader, limits.max_line, 414, prefix)
    for _ in range(2):
        if line:
            break
        line = await read_line(reader, limits.max_line, 414)
    total = len(line)
    headers = Headers()
    while True:
        try:
            raw = await read_line(reader, limits.max_line, 431)
        except PeerClosedError as exc:
            raise HttpError(400, "başlıklar yarıda kesildi") from exc
        if not raw:
            return line, headers
        total += len(raw)
        if total > limits.max_head_bytes or len(headers) >= limits.max_headers:
            raise HttpError(431, "başlıklar çok büyük")
        name, value = parse_header_line(raw)
        headers.add(name, value)


def parse_request_line(line: bytes) -> tuple[str, str, str]:
    """`YÖNTEM SP HEDEF SP SÜRÜM` → (yöntem, hedef, sürüm). Tek boşluk dışında ayraç kabul
    edilmez.
    """
    try:
        text = line.decode("ascii")
    except UnicodeDecodeError as exc:
        raise HttpError(400, "istek satırı ASCII olmalı") from exc
    parts = text.split(" ")
    if len(parts) != 3:
        raise HttpError(400, "istek satırı biçimi: YÖNTEM HEDEF SÜRÜM")
    method, target, version = parts
    if not TOKEN_RE.fullmatch(method):
        raise HttpError(400, "yöntem adı geçersiz")
    if version not in ("HTTP/1.1", "HTTP/1.0"):
        raise HttpError(505 if _VERSION_RE.fullmatch(version) else 400, "HTTP sürümü")
    if not _TARGET_RE.fullmatch(target) or "#" in target:
        raise HttpError(400, "istek hedefi geçersiz")
    return method, target, version


def parse_header_line(raw: bytes) -> tuple[str, str]:
    """`Ad: değer` satırı. Katlanmış satır (obs-fold) ve adla ':' arasında boşluk reddedilir."""
    if raw[:1] in (b" ", b"\t"):
        raise HttpError(400, "katlanmış başlık satırı (obs-fold) desteklenmez")
    name_raw, colon, value_raw = raw.partition(b":")
    if not colon:
        raise HttpError(400, "başlık satırında ':' yok")
    name = name_raw.decode("latin-1")
    if not TOKEN_RE.fullmatch(name):
        raise HttpError(400, "başlık adı geçersiz (adla ':' arasında boşluk olamaz)")
    value = value_raw.decode("latin-1").strip(" \t")
    if not _FIELD_VALUE_RE.fullmatch(value):
        raise HttpError(400, "başlık değerinde denetim karakteri var")
    return name, value


def split_target(method: str, target: str) -> tuple[str, str, str | None]:
    """Hedefi (yol, sorgu, mutlak-biçimdeki-host) parçalarına ayırır."""
    host: str | None = None
    if target == "*":
        if method != "OPTIONS":
            raise HttpError(400, "'*' hedefi yalnız OPTIONS ile kullanılır")
        return "*", "", None
    if target.lower().startswith(("http://", "https://")):  # mutlak biçim (RFC 9112 §3.2.2)
        rest = target.split("://", 1)[1]
        cut = min((i for i in (rest.find("/"), rest.find("?")) if i >= 0), default=len(rest))
        host, target = rest[:cut], rest[cut:] or "/"
        if target.startswith("?"):
            target = "/" + target
    if not target.startswith("/"):
        raise HttpError(400, "istek hedefi '/' ile başlamalı")
    path, _, query = target.partition("?")
    return path, query, host


def validate_host(version: str, headers: Headers, absolute_host: str | None) -> str:
    """HTTP/1.1'de tam olarak bir Host başlığı zorunludur (RFC 9112 §3.2)."""
    values = headers.get_all("host")
    if len(values) > 1:
        raise HttpError(400, "birden çok Host başlığı")
    if version == "HTTP/1.1" and not values:
        raise HttpError(400, "Host başlığı eksik")
    host = absolute_host if absolute_host is not None else (values[0] if values else "")
    if not _HOST_RE.fullmatch(host):
        raise HttpError(400, "Host başlığı geçersiz")
    return host


def body_framing(version: str, headers: Headers) -> tuple[str, int]:
    """Gövde çerçevesi: ("none", 0) | ("length", n) | ("chunked", 0). RFC 9112 §6.3."""
    te_values = headers.get_all("transfer-encoding")
    cl_values = headers.get_all("content-length")
    if te_values:
        if cl_values:
            raise HttpError(400, "Content-Length ve Transfer-Encoding birlikte olamaz")
        if version == "HTTP/1.0":
            raise HttpError(400, "HTTP/1.0 isteğinde Transfer-Encoding olamaz")
        codings = [c.strip().lower() for value in te_values for c in value.split(",")]
        if codings == ["chunked"]:
            return "chunked", 0
        if "chunked" in codings or not all(TOKEN_RE.fullmatch(c) for c in codings):
            raise HttpError(400, "Transfer-Encoding geçersiz")
        raise HttpError(501, "yalnız 'chunked' aktarım kodlaması desteklenir")
    if cl_values:
        parts = [p.strip() for value in cl_values for p in value.split(",")]
        if len(parts) != 1 or not DIGITS_RE.fullmatch(parts[0]):
            raise HttpError(400, "Content-Length tek bir ondalık sayı olmalı")
        return "length", int(parts[0])
    return "none", 0
