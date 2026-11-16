"""multipart/form-data ayrıştırıcı (RFC 7578): form alanları ve yüklenen dosyalar.

    --SINIR\\r\\n
    Content-Disposition: form-data; name="baslik"\\r\\n\\r\\n
    Alışveriş listesi\\r\\n
    --SINIR\\r\\n
    Content-Disposition: form-data; name="dosya"; filename="notlar.txt"\\r\\n
    Content-Type: text/plain\\r\\n\\r\\n
    <dosya baytları>\\r\\n
    --SINIR--\\r\\n
Güvenlik: dosya adı yalnız taban ada indirgenir ("../../etc/passwd" → "passwd", "C:\\\\a\\\\b.txt" →
"b.txt"), denetim karakterleri atılır; parça sayısı ve parça başlığı boyutu sınırlıdır; gövde boyutu
çağıranca (`App.max_body`) sınırlanmıştır. Dosya adına asla güvenip diske o adla yazmayın.
Genişletme: büyük dosyaları belleğe almadan diske akıtmak gerekirse ayrıştırıcıyı parça parça okuyan
bir sürüme çevirin; sınır testlerini (`tests/web_catisi/test_istek.py`) koruyun.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from web_catisi.datastructures import MultiDict

_BOUNDARY_RE = re.compile(r"[0-9A-Za-z'()+_,\-./:=? ]{0,69}[0-9A-Za-z'()+_,\-./:=?]")
_PARAM_RE = re.compile(r';\s*([A-Za-z0-9_*\-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)')


class MultipartError(ValueError):
    """Gövde geçerli bir multipart/form-data değil (400)."""


@dataclass(frozen=True)
class UploadedFile:
    filename: str
    content_type: str
    data: bytes

    @property
    def size(self) -> int:
        return len(self.data)


def header_params(value: str) -> tuple[str, dict[str, str]]:
    """'form-data; name="a"; filename="b.txt"' → ("form-data", {"name": "a", "filename":
    "b.txt"}).
    """
    main, _, rest = value.partition(";")
    params: dict[str, str] = {}
    for match in _PARAM_RE.finditer(";" + rest):
        raw = match.group(2).strip()
        if raw.startswith('"'):
            raw = re.sub(r"\\(.)", r"\1", raw[1:-1])
        params[match.group(1).lower()] = raw
    return main.strip().lower(), params


def safe_filename(name: str) -> str:
    """Yol bileşenlerini ve denetim karakterlerini atar; geriye yalnız taban ad kalır."""
    base = re.split(r"[/\\]", name)[-1]
    base = "".join(ch for ch in base if ch.isprintable()).strip().lstrip(".")
    return base[:200] or "dosya"


def boundary_of(content_type: str) -> bytes:
    kind, params = header_params(content_type)
    boundary = params.get("boundary", "")
    if kind != "multipart/form-data" or not _BOUNDARY_RE.fullmatch(boundary):
        raise MultipartError("Content-Type geçerli bir multipart/form-data sınırı içermiyor.")
    return boundary.encode("ascii")


def _parse_part(raw: bytes, max_header: int) -> tuple[str, str | UploadedFile]:
    head, separator, data = raw.partition(b"\r\n\r\n")
    if not separator or len(head) > max_header:
        raise MultipartError("Parça başlığı eksik ya da çok büyük.")
    headers: dict[str, str] = {}
    for line in head.split(b"\r\n"):
        name, colon, value = line.decode("utf-8", "replace").partition(":")
        if not colon:
            raise MultipartError("Parça başlık satırı bozuk.")
        headers[name.strip().lower()] = value.strip()
    kind, params = header_params(headers.get("content-disposition", ""))
    if kind != "form-data" or "name" not in params:
        raise MultipartError("Parçada Content-Disposition: form-data; name=… yok.")
    if "filename" in params:
        content_type = headers.get("content-type", "application/octet-stream")
        return params["name"], UploadedFile(safe_filename(params["filename"]), content_type, data)
    try:
        return params["name"], data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise MultipartError("Form alanı geçerli UTF-8 değil.") from exc


def parse_multipart(
    body: bytes, content_type: str, max_parts: int = 100, max_header: int = 8192
) -> tuple[MultiDict, dict[str, list[UploadedFile]]]:
    delimiter = b"--" + boundary_of(content_type)
    start = 0 if body.startswith(delimiter) else body.find(b"\r\n" + delimiter)
    if start < 0:
        raise MultipartError("Gövdede sınır bulunamadı.")
    position = body.index(delimiter, start) + len(delimiter)
    fields = MultiDict()
    files: dict[str, list[UploadedFile]] = {}
    for _ in range(max_parts + 1):
        if body[position : position + 2] == b"--":
            return fields, files
        if body[position : position + 2] != b"\r\n":
            raise MultipartError("Sınırdan sonra CRLF gelmeli.")
        end = body.find(b"\r\n" + delimiter, position + 2)
        if end < 0:
            raise MultipartError("Kapanış sınırı bulunamadı.")
        name, value = _parse_part(body[position + 2 : end], max_header)
        if isinstance(value, UploadedFile):
            files.setdefault(name, []).append(value)
        else:
            fields.add(name, value)
        position = end + 2 + len(delimiter)
    raise MultipartError("Çok fazla parça.")
