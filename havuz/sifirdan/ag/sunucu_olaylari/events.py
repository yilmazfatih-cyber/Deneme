"""Sunucu Olayları (SSE, WHATWG HTML §9.2) tel biçimi: olay yazma ve artımlı (akış) ayrıştırma.

    id: 42                 ← istemci yeniden bağlanınca "Last-Event-ID: 42" yollar
    event: siparis         ← olay adı (yoksa "message")
    data: {"no": 7}        ← çok satırlı veri her satır için ayrı "data:" ile
    retry: 3000            ← yeniden bağlanma beklemesi (ms)
    (boş satır: olayı gönder)      ": yorum" satırları (kalp atışı) yok sayılır
Güvenlik: `id` ve `event` alanına satır sonu konursa saldırgan sahte alanlar/olaylar ekleyebilir; bu
yüzden CR/LF/NUL içeren değer reddedilir. Veri içindeki satır sonları ayrı "data:" satırlarına
bölünür.
Genişletme: yeni bir alan gerekirse ayrıştırıcıda bilinmeyen alanlar zaten yok sayılır (ileriye
uyumlu).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Event:
    data: str
    event: str = "message"
    id: str | None = None
    retry: int | None = None


def _check(value: str, field: str) -> str:
    if any(ch in value for ch in "\r\n\x00"):
        raise ValueError(f"SSE '{field}' alanı satır sonu ya da NUL içeremez (olay enjeksiyonu).")
    return value


def format_event(event: Event) -> bytes:
    lines = []
    if event.id is not None:
        lines.append(f"id: {_check(event.id, 'id')}")
    if event.event != "message":
        lines.append(f"event: {_check(event.event, 'event')}")
    if event.retry is not None:
        lines.append(f"retry: {int(event.retry)}")
    for line in event.data.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        lines.append(f"data: {line}")
    return ("\n".join(lines) + "\n\n").encode("utf-8")


def comment(text: str = "") -> bytes:
    """Kalp atışı: bağlantıyı ara vekillerin zaman aşımına karşı canlı tutar; istemci yok sayar."""
    return f": {_check(text, 'yorum')}\n\n".encode()


class EventParser:
    """Bayt parçalarını besleyin, tamamlanan olayları alın. Satır sonu: CRLF, LF ya da tek CR."""

    def __init__(self, max_line: int = 64 * 1024) -> None:
        self.max_line = max_line
        self.last_id: str | None = None
        self.retry: int | None = None
        self._buffer = ""
        self._decoder_tail = b""
        self._data: list[str] = []
        self._event = ""
        self._first = True
        self._pending_cr = False

    def feed(self, chunk: bytes) -> list[Event]:
        raw = self._decoder_tail + chunk
        try:
            text = raw.decode("utf-8")
            self._decoder_tail = b""
        except UnicodeDecodeError as exc:  # parça ortasında bölünmüş çok baytlı harf
            text, self._decoder_tail = raw[: exc.start].decode("utf-8"), raw[exc.start :]
            if len(self._decoder_tail) > 3:
                text += self._decoder_tail.decode("utf-8", "replace")
                self._decoder_tail = b""
        if self._first and text:
            text, self._first = text.removeprefix("﻿"), False
        if self._pending_cr and text.startswith("\n"):
            text = text[1:]
        self._pending_cr = text.endswith("\r")
        self._buffer += text
        lines = self._buffer.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        self._buffer = lines.pop()
        if len(self._buffer) > self.max_line:
            raise ValueError("SSE satırı çok uzun.")
        events: list[Event] = []
        for line in lines:
            event = self._line(line)
            if event is not None:
                events.append(event)
        return events

    def _line(self, line: str) -> Event | None:
        if not line:
            if not self._data:
                self._event = ""
                return None
            event = Event("\n".join(self._data), self._event or "message", self.last_id, self.retry)
            self._data, self._event = [], ""
            return event
        if line.startswith(":"):
            return None
        name, _, value = line.partition(":")
        value = value.removeprefix(" ")
        if name == "data":
            self._data.append(value)
        elif name == "event":
            self._event = value
        elif name == "id" and "\x00" not in value:
            self.last_id = value
        elif name == "retry" and value.isascii() and value.isdigit():
            self.retry = int(value)
        return None
