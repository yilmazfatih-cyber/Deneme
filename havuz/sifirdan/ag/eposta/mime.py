"""MIME ileti kurma: düz metin + HTML (multipart/alternative) + ekler (multipart/mixed), Türkçe
başlıklar.

    multipart/mixed
    ├─ multipart/alternative
    │  ├─ text/plain; charset=utf-8   (quoted-printable)
    │  └─ text/html;  charset=utf-8   (quoted-printable)
    └─ application/pdf; ek: filename*=utf-8''Fatura%20%C5%9Eubat.pdf   (base64, 76 karakterlik
    satırlar)
Satır sonları her yerde CRLF; satırlar ≤ 76 karakter (RFC 2045). Sınır dizgisi rastgeledir ve hiçbir
parçanın içinde geçmediği denetlenir. Tarih ve ileti kimliği dışarıdan verilebilir (testler
belirlenimci olsun).
Genişletme: satır içi resim (cid:) için multipart/related katmanı; `_alternative`'e benzer bir
yardımcı ekleyin.
"""

from __future__ import annotations

import base64
import datetime
import secrets
from collections.abc import Callable
from dataclasses import dataclass
from email.utils import format_datetime
from urllib.parse import quote

from eposta.headers import check_value, encode_word, fold, format_address

_QP_SAFE = set(range(33, 61)) | set(range(62, 127))  # yazdırılabilir ASCII ('=' hariç)


@dataclass(frozen=True)
class Attachment:
    filename: str
    data: bytes
    content_type: str = "application/octet-stream"


def qp_encode(data: bytes) -> bytes:
    """Quoted-printable (RFC 2045 §6.7): satırlar ≤ 76, sondaki boşluk kodlanır, yumuşak kesme
    "=\\r\\n".
    """
    out: list[bytes] = []
    for raw_line in data.replace(b"\r\n", b"\n").split(b"\n"):
        pieces = [chr(b) if b in _QP_SAFE else f"={b:02X}" for b in raw_line]
        if pieces and pieces[-1] in (" ", "\t"):
            pieces[-1] = f"={ord(pieces[-1]):02X}"
        line = ""
        for piece in pieces:
            if len(line) + len(piece) > 75:
                out.append(line.encode("ascii") + b"=")
                line = ""
            line += piece
        out.append(line.encode("ascii"))
    return b"\r\n".join(out)


def qp_decode(data: bytes) -> bytes:
    out = bytearray()
    lines = data.replace(b"\r\n", b"\n").split(b"\n")
    for number, line in enumerate(lines):
        soft = line.rstrip(b" \t").endswith(b"=")
        line = line.rstrip(b" \t")[:-1] if soft else line.rstrip(b" \t")
        index = 0
        while index < len(line):
            if line[index : index + 1] == b"=" and index + 2 < len(line) + 1:
                hex_pair = line[index + 1 : index + 3]
                if len(hex_pair) == 2 and all(c in b"0123456789ABCDEFabcdef" for c in hex_pair):
                    out.append(int(hex_pair, 16))
                    index += 3
                    continue
            out.append(line[index])
            index += 1
        if not soft and number < len(lines) - 1:
            out += b"\r\n"
    return bytes(out)


def base64_lines(data: bytes) -> bytes:
    encoded = base64.b64encode(data)
    return b"\r\n".join(encoded[i : i + 76] for i in range(0, len(encoded), 76))


def _filename_params(name: str) -> str:
    check_value(name)
    if name.isascii() and '"' not in name and "\\" not in name:
        return f'filename="{name}"'
    return f"filename*=utf-8''{quote(name, safe='')}"  # RFC 2231 / 6266


def _leaf(
    content_type: str, body: bytes, extra: list[str] | None = None, binary: bool = False
) -> bytes:
    encoding = "base64" if binary else "quoted-printable"
    payload = base64_lines(body) if binary else qp_encode(body)
    head = [
        f"Content-Type: {content_type}",
        *(extra or []),
        f"Content-Transfer-Encoding: {encoding}",
    ]
    return ("\r\n".join(head) + "\r\n\r\n").encode("ascii") + payload


def _multipart(kind: str, parts: list[bytes], boundary: str) -> bytes:
    if any(boundary.encode() in part for part in parts):
        raise ValueError("Sınır dizgisi içerikte geçiyor; yeniden üretin.")
    head = f'Content-Type: multipart/{kind}; boundary="{boundary}"\r\n\r\n'.encode("ascii")
    body = b"".join(b"--" + boundary.encode() + b"\r\n" + part + b"\r\n" for part in parts)
    return head + body + b"--" + boundary.encode() + b"--\r\n"


def build_message(
    *,
    sender: tuple[str, str],
    to: list[tuple[str, str]],
    subject: str,
    text: str,
    html: str | None = None,
    attachments: list[Attachment] | None = None,
    date: datetime.datetime | None = None,
    message_id: str | None = None,
    new_boundary: Callable[[], str] = lambda: "=_sifirdan_" + secrets.token_hex(12),
) -> bytes:
    """Gönderime hazır ileti baytları (SMTP DATA'ya verilir)."""
    sent = date or datetime.datetime.now(datetime.UTC)
    domain = sender[1].rpartition("@")[2]
    headers = [
        fold("From", format_address(*sender)),
        fold("To", ", ".join(format_address(*recipient) for recipient in to)),
        fold("Subject", encode_word(subject)),
        f"Date: {format_datetime(sent)}",
        f"Message-ID: {check_value(message_id or f'<{secrets.token_hex(16)}@{domain}>')}",
        "MIME-Version: 1.0",
    ]
    body = _leaf("text/plain; charset=utf-8", text.encode("utf-8"))
    if html is not None:
        html_part = _leaf("text/html; charset=utf-8", html.encode("utf-8"))
        body = _multipart("alternative", [body, html_part], new_boundary())
    if attachments:
        parts = [body]
        for item in attachments:
            disposition = f"Content-Disposition: attachment; {_filename_params(item.filename)}"
            kind = check_value(item.content_type)
            if kind.startswith("text/") and "charset" not in kind:
                kind += "; charset=utf-8"  # belirtilmezse alıcı US-ASCII varsayar, Türkçe bozulur
            parts.append(_leaf(kind, item.data, [disposition], binary=True))
        body = _multipart("mixed", parts, new_boundary())
    return ("\r\n".join(headers) + "\r\n").encode("ascii") + body
