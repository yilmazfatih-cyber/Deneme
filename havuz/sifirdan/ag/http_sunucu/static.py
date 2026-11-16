"""Durağan dosya sunumu: güvenli yol çözümleme, ETag/If-None-Match, If-Modified-Since, aralık
istekleri.

Yol çözümleme (dizin dışına çıkmayı engelleme):
    "/a/b%20c.txt" → '/' ile böl → her parçayı AYRI AYRI yüzde-çöz → "..", ".", "\\", NUL, gizli
    dosya
    (".env") reddedilir → kök + parçalar → `resolve()` (sembolik bağlar çözülür) → hâlâ kökün
    altında mı?
Böylece "%2e%2e", "..%2f", "%5c..%5c" ve kök dışını gösteren sembolik bağ 404 alır.
Önbellek: ETag = "boyut-değişimzamanı" (onaltılık). If-None-Match eşleşirse 304 (gövdesiz).
Aralık: yalnız TEK aralık ("bytes=0-99", "bytes=500-", "bytes=-100"); çoklu aralıkta tüm dosya
döner.
Genişletme: dizin listesi istenirse dosya adlarını `html.escape` ile basan ayrı bir işleyici yazın.
"""

from __future__ import annotations

import asyncio
import mimetypes
import os
from collections.abc import AsyncIterator
from email.utils import formatdate, parsedate_to_datetime
from pathlib import Path
from urllib.parse import unquote

from http_sunucu.headers import Headers
from http_sunucu.messages import Request, Response
from http_sunucu.parser import DIGITS_RE

_MIME = mimetypes.MimeTypes()  # yalnız Python'un yerleşik tablosu: sistemden sisteme değişmez
_TEXTUAL = ("text/", "application/javascript", "application/json", "image/svg+xml")


def content_type(name: str) -> str:
    guessed, _encoding = _MIME.guess_type(name)
    value = guessed or "application/octet-stream"
    return value + "; charset=utf-8" if value.startswith(_TEXTUAL) else value


def parse_range(header: str, size: int) -> tuple[int, int] | str | None:
    """Tek bayt aralığı → (başlangıç, bitiş dahil). Yoksay → None. Karşılanamaz →
    "unsatisfiable".
    """
    if not header.startswith("bytes="):
        return None
    spec = header[6:].strip()
    first, dash, last = spec.partition("-")
    first, last = first.strip(), last.strip()
    if "," in spec or not dash or (first and not DIGITS_RE.fullmatch(first)):
        return None
    if last and not DIGITS_RE.fullmatch(last):
        return None
    if not first:  # sonek: son N bayt
        if not last or int(last) == 0 or size == 0:
            return "unsatisfiable" if last else None
        return max(0, size - int(last)), size - 1
    start = int(first)
    if last and int(last) < start:
        return None  # geçersiz aralık: yok sayılır, tüm dosya döner
    if start >= size:
        return "unsatisfiable"
    return start, min(int(last), size - 1) if last else size - 1


def etag_matches(header: str, etag: str) -> bool:
    """If-None-Match için zayıf karşılaştırma (RFC 9110 §13.1.2): W/ öneki yok sayılır."""
    if header.strip() == "*":
        return True
    bare = etag.removeprefix("W/")
    return any(tag.strip().removeprefix("W/") == bare for tag in header.split(","))


async def file_chunks(
    path: Path, offset: int, length: int, chunk: int = 64 * 1024
) -> AsyncIterator[bytes]:
    """Dosyayı olay döngüsünü bloklamadan (iş parçacığında) parça parça okur."""
    handle = await asyncio.to_thread(path.open, "rb")
    try:
        await asyncio.to_thread(handle.seek, offset)
        remaining = length
        while remaining > 0:
            data = await asyncio.to_thread(handle.read, min(chunk, remaining))
            if (
                not data
            ):  # dosya gönderim sırasında küçüldü: Content-Length tutmaz, bağlantı kesilmeli
                raise ConnectionAbortedError("dosya gönderilirken değişti")
            remaining -= len(data)
            yield data
    finally:
        await asyncio.to_thread(handle.close)


class StaticFiles:
    """`HttpServer(StaticFiles("public"))` — bir klasörü yalnız-okunur olarak yayınlar."""

    def __init__(
        self,
        root: str | os.PathLike[str],
        *,
        prefix: str = "/",
        index: str = "index.html",
        allow_hidden: bool = False,
        cache_seconds: int = 0,
    ) -> None:
        self.root = Path(root).resolve(strict=True)
        self.prefix = prefix if prefix.endswith("/") else prefix + "/"
        self.index = index
        self.allow_hidden = allow_hidden
        self.cache_seconds = cache_seconds

    def resolve(self, url_path: str) -> Path | None:
        """URL yolunu kökün altındaki gerçek bir yola çevirir; güvensizse ya da yoksa None."""
        parts: list[str] = []
        for raw in url_path.split("/"):
            if not raw:
                continue
            try:
                segment = unquote(raw, errors="strict")
            except UnicodeDecodeError:
                return None
            bad = segment in (".", "..") or any(c in segment for c in "/\\\x00")
            if bad or Path(segment).drive or (segment.startswith(".") and not self.allow_hidden):
                return None
            parts.append(segment)
        try:
            resolved = self.root.joinpath(*parts).resolve(strict=True)
        except (OSError, RuntimeError):
            return None
        return resolved if resolved.is_relative_to(self.root) else None

    async def __call__(self, request: Request) -> Response:
        if request.method not in ("GET", "HEAD"):
            return Response.error(405, Headers([("Allow", "GET, HEAD")]))
        if not request.path.startswith(self.prefix) and request.path + "/" != self.prefix:
            return Response.error(404)
        target = self.resolve(request.path[len(self.prefix) :])
        if target is not None and target.is_dir():
            if not request.path.endswith("/"):  # göreli bağlantılar doğru çözülsün diye
                query = f"?{request.query}" if request.query else ""
                return Response.redirect(request.path + "/" + query, status=301)
            target = self.resolve(request.path[len(self.prefix) :] + "/" + self.index)
        if target is None or not target.is_file():
            return Response.error(404)
        return self._file_response(request, target)

    def _file_response(self, request: Request, path: Path) -> Response:
        info = path.stat()
        etag = f'"{info.st_size:x}-{info.st_mtime_ns:x}"'
        headers = Headers(
            [
                ("Content-Type", content_type(path.name)),
                ("ETag", etag),
                ("Last-Modified", formatdate(info.st_mtime, usegmt=True)),
                ("Accept-Ranges", "bytes"),
                ("X-Content-Type-Options", "nosniff"),
                (
                    "Cache-Control",
                    f"max-age={self.cache_seconds}" if self.cache_seconds else "no-cache",
                ),
            ]
        )
        if self._not_modified(request.headers, etag, info.st_mtime):
            headers.remove("Content-Type")
            return Response(304, headers, b"")
        start, length, status = 0, info.st_size, 200
        range_header = request.headers.get("range")
        if range_header is not None and self._if_range_ok(request.headers, etag):
            chosen = parse_range(range_header, info.st_size)
            if chosen == "unsatisfiable":
                return Response.error(416, Headers([("Content-Range", f"bytes */{info.st_size}")]))
            if isinstance(chosen, tuple):
                start, end = chosen
                length, status = end - start + 1, 206
                headers.add("Content-Range", f"bytes {start}-{end}/{info.st_size}")
        headers.add("Content-Length", str(length))
        body = file_chunks(path, start, length) if request.method == "GET" else b""
        return Response(status, headers, body)

    @staticmethod
    def _not_modified(headers: Headers, etag: str, mtime: float) -> bool:
        if_none_match = headers.get("if-none-match")
        if if_none_match is not None:  # varsa If-Modified-Since'e bakılmaz (RFC 9110 §13.2.2)
            return etag_matches(if_none_match, etag)
        since = headers.get("if-modified-since")
        if since is None:
            return False
        try:
            return int(mtime) <= parsedate_to_datetime(since).timestamp()
        except (TypeError, ValueError, OverflowError):
            return False

    @staticmethod
    def _if_range_ok(headers: Headers, etag: str) -> bool:
        """If-Range varsa aralık yalnız ETag aynen tutuyorsa uygulanır (güçlü karşılaştırma)."""
        if_range = headers.get("if-range")
        return if_range is None or if_range.strip() == etag
