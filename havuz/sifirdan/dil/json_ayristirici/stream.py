"""Akışla (olay tabanlı) JSON ayrıştırma: metni parça parça besleyip olay almak.

Özyineleme YOK: açık yapılar bir yığında tutulur (derinlik sınırı yine geçerli). Bir belirteç
(dizgi, sayı, true…) parça sınırında bölünürse tampon o belirteçten itibaren saklanır ve sonraki
parça gelince yeniden taranır. Olaylar: nesne/dizi başı-sonu, anahtar, değer. Hatalar özyinelemeli
ayrıştırıcıyla (parser.py) aynı ileti ve satır/sütunla verilir (ortak scanner.py; testle korunur).
Kullanım: `for olay in iter_events(open("büyük.json"))` ya da `EventParser().feed(parça)`.
Genişletme: yol (JSON Pointer) izleyen olaylar için `Frame`'e geçerli anahtar/dizin ekleyin.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from enum import Enum

from .parser import JsonError, Options
from .scanner import (
    WHITESPACE,
    Incomplete,
    ScanError,
    advance_position,
    after_item,
    bom_error,
    duplicate_key,
    expected_colon,
    expected_key,
    extra_data,
    scan_literal,
    scan_number,
    scan_string,
    too_deep,
    trailing_comma,
    unclosed,
    unexpected_value,
)


class EventKind(Enum):
    START_OBJECT = "nesne_basi"
    END_OBJECT = "nesne_sonu"
    START_ARRAY = "dizi_basi"
    END_ARRAY = "dizi_sonu"
    KEY = "anahtar"
    VALUE = "deger"


@dataclass(frozen=True)
class Event:
    kind: EventKind
    value: object = None


# Yapı durumları. Dizi: FIRST → NEXT ⇄ AFTER_COMMA.
# Nesne: FIRST → COLON → VALUE → NEXT ⇄ AFTER_COMMA → COLON …
FIRST, NEXT, AFTER_COMMA, COLON, VALUE = "ilk", "sonraki", "virgül", "iki_nokta", "değer"


@dataclass
class Frame:
    kind: str  # "dizi" ya da "nesne"
    state: str
    opened: tuple[int, int]
    keys: set[str] = field(default_factory=set)


class EventParser:
    """Parça parça beslenen ayrıştırıcı: `feed(parça)` ve en sonda `close()` olay listesi verir."""

    def __init__(self, options: Options | None = None) -> None:
        self.opt = options or Options()
        self.buf = ""
        self.line, self.col = 1, 1  # tamponun ilk karakterinin konumu
        self.stack: list[Frame] = []
        self.top_done = False
        self.started = False
        self.closed = False
        self._cursor = (0, 1, 1)  # (tampon dizini, satır, sütun) — _pos için

    def feed(self, chunk: str) -> list[Event]:
        if self.closed:
            raise RuntimeError("close() sonrası feed() çağrılamaz")
        self.buf += chunk
        return self._run(final=False)

    def close(self) -> list[Event]:
        events = self._run(final=True)
        self.closed = True
        return events

    # --- iç işleyiş ----------------------------------------------------------
    def _error(self, err: ScanError) -> JsonError:
        line, col = self._pos(err.index)
        return JsonError(err.message, line, col, err.hint)

    def _pos(self, index: int) -> tuple[int, int]:
        """Tampondaki konumun satır/sütunu; imleç ileri doğru ilerler (toplam iş doğrusal)."""
        at, line, col = self._cursor
        if index < at:
            at, line, col = 0, self.line, self.col
        line, col = advance_position(line, col, self.buf[at:index])
        self._cursor = (index, line, col)
        return line, col

    def _run(self, final: bool) -> list[Event]:
        events: list[Event] = []
        self._cursor = (0, self.line, self.col)
        i = 0
        try:
            i = self._loop(events, final)
        except ScanError as err:
            raise self._error(err) from None
        finally:
            consumed = self.buf[:i]
            self.line, self.col = advance_position(self.line, self.col, consumed)
            self.buf = self.buf[i:]
        return events

    def _loop(self, events: list[Event], final: bool) -> int:
        buf, n, i = self.buf, len(self.buf), 0
        if not self.started and n:
            if buf.startswith("﻿"):
                raise bom_error()
            self.started = True
        while True:
            while i < n and buf[i] in WHITESPACE:
                i += 1
            c = buf[i] if i < n else ""
            if c == "" and not final:
                return i
            try:
                i = self._step(events, c, i, final)
            except Incomplete:
                return i
            if i < 0:
                return n

    def _step(self, events: list[Event], c: str, i: int, final: bool) -> int:
        """Tek adım: geçerli duruma göre bir belirteç işler; yeni konumu döndürür (-1: bitti)."""
        if not self.stack:
            if self.top_done:
                if c == "":
                    return -1
                raise extra_data(i)
            return self._value(events, c, i, final)
        frame = self.stack[-1]
        if c == "":
            raise unclosed(frame.kind, i, frame.opened)
        if frame.kind == "dizi":
            return self._array(events, frame, c, i, final)
        return self._object(events, frame, c, i, final)

    def _array(self, events: list[Event], frame: Frame, c: str, i: int, final: bool) -> int:
        if c == "]" and frame.state == FIRST:
            return self._close(events, i)
        if frame.state == NEXT:
            if c == "]":
                return self._close(events, i)
            if c != ",":
                raise after_item("dizi", c, i)
            frame.state = AFTER_COMMA
            return i + 1
        if c == "]":
            raise trailing_comma("]", i)
        return self._value(events, c, i, final)

    def _object(self, events: list[Event], frame: Frame, c: str, i: int, final: bool) -> int:
        state = frame.state
        if state in (FIRST, AFTER_COMMA):
            if c == "}":
                if state == FIRST:
                    return self._close(events, i)
                raise trailing_comma("}", i)
            if c != '"':
                raise expected_key(c, i)
            key, end = scan_string(self.buf, i, final, self.opt.allow_lone_surrogates)
            if self.opt.reject_duplicate_keys and key in frame.keys:
                raise duplicate_key(key, i)
            frame.keys.add(key)
            events.append(Event(EventKind.KEY, key))
            frame.state = COLON
            return end
        if state == COLON:
            if c != ":":
                raise expected_colon(c, i)
            frame.state = VALUE
            return i + 1
        if state == VALUE:
            return self._value(events, c, i, final)
        if c == "}":
            return self._close(events, i)
        if c != ",":
            raise after_item("nesne", c, i)
        frame.state = AFTER_COMMA
        return i + 1

    def _value(self, events: list[Event], c: str, i: int, final: bool) -> int:
        if c in ("[", "{"):
            if len(self.stack) + 1 > self.opt.max_depth:
                raise too_deep(self.opt.max_depth, i)
            kind = "dizi" if c == "[" else "nesne"
            self.stack.append(Frame(kind, FIRST, self._pos(i)))
            start = EventKind.START_ARRAY if c == "[" else EventKind.START_OBJECT
            events.append(Event(start))
            return i + 1
        value: object
        if c == '"':
            value, end = scan_string(self.buf, i, final, self.opt.allow_lone_surrogates)
        elif c == "-" or "0" <= c <= "9":
            value, end = scan_number(self.buf, i, final, self.opt.max_number_length)
        elif c in ("t", "f", "n"):
            value, end = scan_literal(self.buf, i, final)
        else:
            raise unexpected_value(self.buf, i)
        events.append(Event(EventKind.VALUE, value))
        self._value_done()
        return end

    def _value_done(self) -> None:
        if not self.stack:
            self.top_done = True
        else:
            self.stack[-1].state = NEXT

    def _close(self, events: list[Event], i: int) -> int:
        frame = self.stack.pop()
        events.append(Event(EventKind.END_ARRAY if frame.kind == "dizi" else EventKind.END_OBJECT))
        self._value_done()
        return i + 1


def iter_events(chunks: Iterable[str], options: Options | None = None) -> Iterator[Event]:
    """Metin parçalarından (ör. açık bir dosya) olayları sırayla üretir."""
    parser = EventParser(options)
    for chunk in chunks:
        yield from parser.feed(chunk)
    yield from parser.close()


def build(events: Iterable[Event]) -> object:
    """Olaylardan değeri yeniden kurar (akışın doğruluğunu sınamak için)."""
    stack: list[list[object] | dict[str, object]] = []
    keys: list[str | None] = []
    result: object = None

    def put(value: object) -> None:
        nonlocal result
        if not stack:
            result = value
        elif isinstance(stack[-1], list):
            stack[-1].append(value)
        else:
            key = keys[-1]
            assert key is not None
            stack[-1][key] = value

    for event in events:
        if event.kind in (EventKind.START_ARRAY, EventKind.START_OBJECT):
            container: list[object] | dict[str, object] = (
                [] if event.kind is EventKind.START_ARRAY else {}
            )
            put(container)
            stack.append(container)
            keys.append(None)
        elif event.kind in (EventKind.END_ARRAY, EventKind.END_OBJECT):
            stack.pop()
            keys.pop()
        elif event.kind is EventKind.KEY:
            assert isinstance(event.value, str)
            keys[-1] = event.value
        else:
            put(event.value)
    return result
