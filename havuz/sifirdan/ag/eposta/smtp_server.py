"""Küçük SMTP sunucusu (RFC 5321 alt kümesi, asyncio) ve geliştirme için posta YAKALAYICI.

Oturum:  220 karşılama → EHLO → MAIL FROM:<g> → RCPT TO:<a> (≤ N) → DATA → 354 → satırlar … "." →
250 → QUIT DATA sonu tek başına "." satırıdır; içerikte "." ile başlayan satır istemcide ".."
yapılır, burada geri alınır.
Sınırlar: komut satırı 512, veri satırı 1000 bayt; ileti boyutu (SIZE ile ilan edilir); alıcı
sayısı; boşta bekleme süresi; art arda 10 hatalı komutta bağlantı kesilir.
Güvenlik: bu bir AKTARICI değildir — postayı başka sunucuya iletmez, yalnız işleyiciye verir;
varsayılan olarak yalnız 127.0.0.1'e bağlanır. AUTH/STARTTLS yoktur (yerel geliştirme aracı). VRFY
kullanıcı listesini sızdırmaz (252). Yanıt metinleri protokol gereği ASCII'dir (Türkçe harf
yazılmaz).
Genişletme: yeni bir komut için `_COMMANDS`'a ad ve `_cmd_<ad>` yöntemi ekleyin.
"""

from __future__ import annotations

import asyncio
import contextlib
import re
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path

_ADDRESS_RE = re.compile(r"<([^<>\s@]+@[A-Za-z0-9.\-]+)?>")
_COMMANDS = ("HELO", "EHLO", "MAIL", "RCPT", "DATA", "RSET", "NOOP", "QUIT", "VRFY")


@dataclass
class Envelope:
    sender: str
    recipients: list[str]
    data: bytes
    peer: str = ""


Handler = Callable[[Envelope], Awaitable[None]]


class MailCatcher:
    """Gönderilen postaları bellekte (ve istenirse klasörde .eml olarak) toplar — geliştirme ortamı
    için.
    """

    def __init__(self, folder: Path | None = None) -> None:
        self.folder = folder
        self.messages: list[Envelope] = []

    async def __call__(self, envelope: Envelope) -> None:
        self.messages.append(envelope)
        if self.folder is not None:
            path = self.folder / f"{int(time.time())}-{len(self.messages):04d}.eml"
            await asyncio.to_thread(self._write, path, envelope.data)

    def _write(self, path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)


@dataclass
class _Session:
    helo: str | None = None
    sender: str | None = None
    recipients: list[str] = field(default_factory=list)
    errors: int = 0


class SmtpServer:
    def __init__(
        self,
        handler: Handler,
        host: str = "127.0.0.1",
        port: int = 0,
        *,
        hostname: str = "sifirdan.yerel",
        max_size: int = 10 * 1024 * 1024,
        max_recipients: int = 100,
        timeout: float = 30.0,
    ) -> None:
        self.handler, self.host, self.port, self.hostname = handler, host, port, hostname
        self.max_size, self.max_recipients, self.timeout = max_size, max_recipients, timeout
        self._server: asyncio.Server | None = None
        self._writers: set[asyncio.StreamWriter] = set()

    async def start(self) -> int:
        self._server = await asyncio.start_server(self._client, self.host, self.port, limit=1002)
        self.port = int(self._server.sockets[0].getsockname()[1])
        return self.port

    async def close(self) -> None:
        if self._server is not None:
            self._server.close()
            for writer in list(self._writers):
                writer.close()
            await self._server.wait_closed()

    async def _reply(self, writer: asyncio.StreamWriter, *lines: str) -> None:
        text = "".join(
            f"{line[:3]}{'-' if i < len(lines) - 1 else ' '}{line[4:]}\r\n"
            for i, line in enumerate(lines)
        )
        writer.write(text.encode("ascii"))
        await writer.drain()

    async def _client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self._writers.add(writer)
        peer = str(writer.get_extra_info("peername"))
        session = _Session()
        try:
            await self._reply(writer, f"220 {self.hostname} ESMTP sifirdan hazir")
            while session.errors < 10:
                try:
                    line = await asyncio.wait_for(reader.readuntil(b"\r\n"), self.timeout)
                except TimeoutError:
                    await self._reply(writer, "421 Zaman asimi, baglanti kapatiliyor")
                    return
                except asyncio.LimitOverrunError:
                    await self._reply(writer, "500 Satir cok uzun")
                    return
                if len(line) > 514:
                    session.errors += 1
                    await self._reply(writer, "500 Komut satiri 512 bayti asiyor")
                    continue
                command = line.decode("ascii", errors="replace").strip()
                verb = command.split(" ", 1)[0].upper()
                if verb == "QUIT":
                    await self._reply(writer, "221 Gule gule")
                    return
                if verb not in _COMMANDS:
                    session.errors += 1
                    await self._reply(writer, "500 Komut anlasilmadi")
                    continue
                handler = getattr(self, f"_cmd_{verb.lower()}")
                await handler(command, session, reader, writer, peer)
            await self._reply(writer, "421 Cok fazla hatali komut")
        except (asyncio.IncompleteReadError, ConnectionError):
            pass
        finally:
            self._writers.discard(writer)
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()

    async def _cmd_helo(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        s.helo, s.sender, s.recipients = command[5:].strip() or "?", None, []
        await self._reply(w, f"250 {self.hostname}")

    async def _cmd_ehlo(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        s.helo, s.sender, s.recipients = command[5:].strip() or "?", None, []
        await self._reply(
            w, f"250 {self.hostname}", f"250 SIZE {self.max_size}", "250 8BITMIME", "250 PIPELINING"
        )

    async def _cmd_mail(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        match = _ADDRESS_RE.search(command)
        size = re.search(r"\bSIZE=(\d{1,12})\b", command, re.IGNORECASE)
        if s.helo is None:
            await self._reply(w, "503 Once EHLO gonderin")
        elif s.sender is not None:
            await self._reply(w, "503 Gonderen zaten belirtildi")
        elif not command.upper().startswith("MAIL FROM:") or match is None:
            s.errors += 1
            await self._reply(w, "501 Bicim: MAIL FROM:<adres>")
        elif size and int(size.group(1)) > self.max_size:
            await self._reply(w, "552 Ileti boyut sinirini asiyor")
        else:
            s.sender = match.group(1) or ""  # "<>" boş geri dönüş adresidir (hata bildirimleri)
            await self._reply(w, "250 2.1.0 Tamam")

    async def _cmd_rcpt(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        match = _ADDRESS_RE.search(command)
        if s.sender is None:
            await self._reply(w, "503 Once MAIL FROM gonderin")
        elif not command.upper().startswith("RCPT TO:") or match is None or not match.group(1):
            s.errors += 1
            await self._reply(w, "501 Bicim: RCPT TO:<adres>")
        elif len(s.recipients) >= self.max_recipients:
            await self._reply(w, "452 Cok fazla alici")
        else:
            s.recipients.append(match.group(1))
            await self._reply(w, "250 2.1.5 Tamam")

    async def _cmd_data(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        if s.sender is None or not s.recipients:
            await self._reply(w, "503 Once MAIL FROM ve RCPT TO gonderin")
            return
        await self._reply(w, "354 Veriyi gonderin; tek basina '.' satiriyla bitirin")
        lines: list[bytes] = []
        size, too_big = 0, False
        while True:
            line = await asyncio.wait_for(r.readuntil(b"\r\n"), self.timeout)
            if line == b".\r\n":
                break
            if line.startswith(b"."):
                line = line[1:]  # nokta doldurmasını geri al
            size += len(line)
            too_big = too_big or size > self.max_size
            if not too_big:
                lines.append(line)
        if too_big:
            await self._reply(w, "552 Ileti boyut sinirini asiyor")
        else:
            await self.handler(Envelope(s.sender, list(s.recipients), b"".join(lines), peer))
            await self._reply(w, "250 2.0.0 Kabul edildi")
        s.sender, s.recipients = None, []

    async def _cmd_rset(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        s.sender, s.recipients = None, []
        await self._reply(w, "250 Tamam")

    async def _cmd_noop(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        await self._reply(w, "250 Tamam")

    async def _cmd_vrfy(
        self, command: str, s: _Session, r: asyncio.StreamReader, w: asyncio.StreamWriter, peer: str
    ) -> None:
        await self._reply(w, "252 Dogrulanamiyor; ileti yine de kabul edilir")
