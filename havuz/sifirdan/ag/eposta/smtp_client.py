"""SMTP istemcisi (asyncio): EHLO → MAIL → RCPT (her alıcı) → DATA (nokta doldurmalı) → QUIT.

    await send_mail("127.0.0.1", 8459, "ayse@ornek.test", ["mehmet@ornek.test"], ileti_baytlari)
Çok satırlı yanıtlar ("250-…" … "250 …") sonuna dek okunur. Her adımda beklenmeyen kod `SmtpError`
olur; ileti kod ve sunucunun metnini taşır. Gövdede "." ile başlayan her satırın başına bir "." daha
eklenir, yoksa tek "." satırı iletiyi erken bitirirdi.
Genişletme: STARTTLS için EHLO yanıtında STARTTLS varsa `writer.start_tls(...)` ve yeniden EHLO.
"""

from __future__ import annotations

import asyncio
import contextlib


class SmtpError(Exception):
    def __init__(self, code: int, message: str) -> None:
        super().__init__(f"SMTP {code}: {message}")
        self.code = code


async def read_reply(reader: asyncio.StreamReader) -> tuple[int, list[str]]:
    lines: list[str] = []
    while True:
        raw = (await reader.readuntil(b"\r\n")).decode("ascii", errors="replace").rstrip("\r\n")
        if len(raw) < 3 or not raw[:3].isdigit():
            raise SmtpError(0, f"Geçersiz yanıt: {raw!r}")
        lines.append(raw[4:])
        if raw[3:4] != "-":
            return int(raw[:3]), lines


def dot_stuff(message: bytes) -> bytes:
    """Satır sonlarını CRLF yapar, '.' ile başlayan satırları '..' yapar, sonuna '.' satırını
    ekler.
    """
    lines = message.replace(b"\r\n", b"\n").split(b"\n")
    if lines and lines[-1] == b"":
        lines.pop()
    stuffed = [b"." + line if line.startswith(b".") else line for line in lines]
    return b"\r\n".join(stuffed) + b"\r\n.\r\n"


async def send_mail(
    host: str,
    port: int,
    sender: str,
    recipients: list[str],
    message: bytes,
    *,
    hostname: str = "sifirdan.istemci",
    step_timeout: float = 10.0,
) -> list[str]:
    """İletiyi gönderir; kabul edilen alıcıları döndürür (hiçbiri kabul edilmezse SmtpError)."""
    reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), step_timeout)

    async def command(line: str | None, expected: tuple[int, ...]) -> tuple[int, list[str]]:
        if line is not None:
            writer.write(line.encode("ascii") + b"\r\n")
            await writer.drain()
        code, text = await asyncio.wait_for(read_reply(reader), step_timeout)
        if code not in expected:
            raise SmtpError(code, " ".join(text))
        return code, text

    try:
        await command(None, (220,))
        try:
            await command(f"EHLO {hostname}", (250,))
        except SmtpError:
            await command(f"HELO {hostname}", (250,))
        await command(f"MAIL FROM:<{sender}>", (250,))
        accepted = []
        for recipient in recipients:
            with contextlib.suppress(SmtpError):
                await command(f"RCPT TO:<{recipient}>", (250, 251))
                accepted.append(recipient)
        if not accepted:
            raise SmtpError(550, "Hiçbir alıcı kabul edilmedi.")
        await command("DATA", (354,))
        writer.write(dot_stuff(message))
        await command(None, (250,))
        await command("QUIT", (221,))
        return accepted
    finally:
        writer.close()
        with contextlib.suppress(Exception):
            await writer.wait_closed()
