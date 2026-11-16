"""MIME ileti ayrıştırma: başlıkları açar ve çözer, çok parçalı ağacı gezer, metin/HTML/ekleri
çıkarır.

    parse_message(ham_bayt) → ParsedMessage(subject="Toplantı özeti", text=…, html=…,
    attachments=[…])
Karakter kümeleri: utf-8, iso-8859-9 (Türkçe Latin-5), windows-1254 ve Python'un bildiği diğerleri;
bilinmeyen küme utf-8 + "replace" ile okunur (çökme yok). Aktarım kodlamaları: base64,
quoted-printable, 7bit, 8bit.
Sınırlar: iç içe derinlik (10), parça sayısı (100), başlık bölümü boyutu (64 KB) — kötü niyetli
iletiler ayrıştırıcıyı kilitleyemez. Ek adı (`filename*=`, RFC 2231 dahil) yalnız taban ada
indirgenir.
Genişletme: yeni bir alan (ör. Cc listesi) için `ParsedMessage`'a alan + `parse_message`'ta
doldurma.
"""

from __future__ import annotations

import base64
import binascii
import codecs
import re
from dataclasses import dataclass, field
from urllib.parse import unquote

from eposta.headers import decode_words
from eposta.mime import qp_decode

_PARAM_RE = re.compile(r';\s*([A-Za-z0-9_\-*]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)')


class MessageFormatError(ValueError):
    """İleti sınırları aştı ya da çözülemedi."""


@dataclass(frozen=True)
class ParsedAttachment:
    filename: str
    content_type: str
    data: bytes


@dataclass
class ParsedMessage:
    headers: list[tuple[str, str]]
    text: str = ""
    html: str = ""
    attachments: list[ParsedAttachment] = field(default_factory=list)

    def header(self, name: str) -> str | None:
        lowered = name.lower()
        return next((v for n, v in self.headers if n.lower() == lowered), None)

    @property
    def subject(self) -> str:
        return self.header("subject") or ""


def _split_head(raw: bytes, limit: int) -> tuple[bytes, bytes]:
    normalized = raw.replace(b"\r\n", b"\n")
    head, separator, body = normalized.partition(b"\n\n")
    if len(head) > limit:
        raise MessageFormatError("Başlık bölümü çok büyük.")
    return head, body if separator else b""


def parse_headers(head: bytes) -> list[tuple[str, str]]:
    """Katlanmış satırları birleştirir, kodlu sözcükleri çözer."""
    lines: list[str] = []
    for line in head.decode("utf-8", errors="replace").split("\n"):
        if line[:1] in (" ", "\t") and lines:
            lines[-1] += " " + line.strip()
        elif line:
            lines.append(line)
    headers: list[tuple[str, str]] = []
    for line in lines:
        name, colon, value = line.partition(":")
        if colon and name.strip():
            headers.append((name.strip(), decode_words(value.strip())))
    return headers


def params(value: str) -> tuple[str, dict[str, str]]:
    """'text/plain; charset="utf-8"' → ("text/plain", {"charset": "utf-8"}); RFC 2231 'ad*='
    çözülür.
    """
    main, _, rest = value.partition(";")
    result: dict[str, str] = {}
    for match in _PARAM_RE.finditer(";" + rest):
        key, raw = match.group(1).lower(), match.group(2).strip()
        raw = re.sub(r"\\(.)", r"\1", raw[1:-1]) if raw.startswith('"') else raw
        if key.endswith("*"):
            charset, _, encoded = raw.partition("'")
            encoded = encoded.partition("'")[2]
            try:
                raw = unquote(encoded, encoding=charset or "utf-8", errors="replace")
            except LookupError:
                raw = unquote(encoded)
            key = key[:-1]
        result[key] = raw
    return main.strip().lower(), result


def _split_parts(body: bytes, boundary: bytes) -> list[bytes]:
    """Çok parçalı gövdeyi parçalara böler (giriş metni ve kapanıştan sonrası atılır)."""
    # Sınır satırı: "--sınır" ardından YALNIZ "--", boşluk ya da satır sonu (RFC 2046 §5.1.1);
    # aksi hâlde "--b1" sınırı "--b10" satırının ön ekiyle de eşleşirdi.
    delimiter = rb"(?:^|\n)" + re.escape(b"--" + boundary) + rb"(?=--|[ \t]*(?:\n|$))"
    pieces = re.split(delimiter, body)
    parts: list[bytes] = []
    for piece in pieces[1:]:
        if piece.startswith(b"--"):
            break  # kapanış sınırı
        piece = piece.lstrip(b" \t")  # aktarım dolgusu
        parts.append(piece[1:] if piece.startswith(b"\n") else piece)
    return parts


def _transfer_decode(body: bytes, encoding: str) -> bytes:
    if encoding == "base64":
        cleaned = re.sub(rb"[^A-Za-z0-9+/]", b"", body)  # satır sonları, boşluk ve dolgu atılır
        try:
            return base64.b64decode(cleaned + b"=" * (-len(cleaned) % 4))
        except (binascii.Error, ValueError):
            return body
    if encoding == "quoted-printable":
        return qp_decode(body)
    return body


def _text(data: bytes, charset: str) -> str:
    try:
        codecs.lookup(charset)
    except LookupError:
        charset = "utf-8"
    return data.decode(charset, errors="replace")


class _Walker:
    def __init__(self, max_depth: int, max_parts: int, max_header: int) -> None:
        self.max_depth, self.max_parts, self.max_header = max_depth, max_parts, max_header
        self.parts = 0

    def walk(
        self, headers: list[tuple[str, str]], body: bytes, depth: int, result: ParsedMessage
    ) -> None:
        self.parts += 1
        if depth > self.max_depth or self.parts > self.max_parts:
            raise MessageFormatError("İleti çok derin ya da çok parçalı.")
        lookup = {n.lower(): v for n, v in reversed(headers)}
        kind, options = params(lookup.get("content-type", "text/plain"))
        if kind.startswith("multipart/") and options.get("boundary"):
            for part in _split_parts(body, options["boundary"].encode("utf-8", "replace")):
                if part.startswith(b"\n"):  # başlıksız parça
                    head, part_body = b"", part[1:]
                else:
                    head, part_body = _split_head(part, self.max_header)
                self.walk(parse_headers(head), part_body, depth + 1, result)
            return
        data = _transfer_decode(
            body, lookup.get("content-transfer-encoding", "7bit").strip().lower()
        )
        disposition, disp_options = params(lookup.get("content-disposition", ""))
        filename = disp_options.get("filename") or options.get("name")
        if disposition == "attachment" or filename:
            safe = re.split(r"[/\\]", filename or "ek")[-1] or "ek"
            result.attachments.append(ParsedAttachment(safe, kind, data))
        elif kind == "text/plain" and not result.text:
            result.text = _text(data, options.get("charset", "us-ascii")).replace("\r\n", "\n")
        elif kind == "text/html" and not result.html:
            result.html = _text(data, options.get("charset", "us-ascii")).replace("\r\n", "\n")


def parse_message(
    raw: bytes, *, max_depth: int = 10, max_parts: int = 100, max_header: int = 65536
) -> ParsedMessage:
    head, body = _split_head(raw, max_header)
    headers = parse_headers(head)
    result = ParsedMessage(headers)
    _Walker(max_depth, max_parts, max_header).walk(headers, body, 0, result)
    return result
