"""DNS iletisi kodlayıcı/çözücü (RFC 1035 §4): başlık, soru, kaynak kayıtları, AD SIKIŞTIRMA.

    +--------+------------+----------------+-------------------+----------------+
    | başlık | sorular    | yanıtlar       | yetki (authority) | ek (additional)|
    | 12 bayt| ad tür sınıf| ad tür sınıf TTL uzunluk veri (her bölümde N kayıt)  |
Ad: uzunluk-önekli etiketler ("\\x03www\\x05ornek\\x04test\\x00"). Sıkıştırma: daha önce yazılmış
bir son ek yerine 2 baytlık işaretçi (0xC000 | konum). Çözücü işaretçilerin YALNIZ GERİYE
gösterdiğini denetler (sonsuz döngü saldırısı), toplam ad uzunluğunu (≤ 255) ve her sınırı denetler;
bozuk girdide yalnız `DnsFormatError` fırlatır.
Genişletme: yeni bir kayıt türü için `TYPES`'a kod, `_encode_rdata`/`_decode_rdata`'ya birer dal
ekleyin.
"""

from __future__ import annotations

import ipaddress
import struct
from dataclasses import dataclass, field
from typing import Any

TYPES = {
    "A": 1,
    "NS": 2,
    "CNAME": 5,
    "SOA": 6,
    "PTR": 12,
    "MX": 15,
    "TXT": 16,
    "AAAA": 28,
    "ANY": 255,
}
TYPE_NAMES = {code: name for name, code in TYPES.items()}
CLASS_IN = 1
RCODES = {"NOERROR": 0, "FORMERR": 1, "SERVFAIL": 2, "NXDOMAIN": 3, "NOTIMP": 4, "REFUSED": 5}
_NAME_TYPES = {TYPES["NS"], TYPES["CNAME"], TYPES["PTR"]}


class DnsFormatError(ValueError):
    """İleti DNS biçimine uymuyor (sunucu FORMERR döner)."""


@dataclass(frozen=True)
class Soa:
    mname: str
    rname: str
    serial: int
    refresh: int
    retry: int
    expire: int
    minimum: int


@dataclass(frozen=True)
class Question:
    name: str
    type: int
    klass: int = CLASS_IN


@dataclass(frozen=True)
class Record:
    name: str
    type: int
    ttl: int
    # A/AAAA: str adres; NS/CNAME/PTR: str ad; MX: (öncelik, ad); TXT: tuple[bytes]; SOA: Soa
    data: Any
    klass: int = CLASS_IN


@dataclass
class Message:
    id: int
    qr: bool = False
    opcode: int = 0
    aa: bool = False
    tc: bool = False
    rd: bool = False
    ra: bool = False
    rcode: int = 0
    questions: list[Question] = field(default_factory=list)
    answers: list[Record] = field(default_factory=list)
    authority: list[Record] = field(default_factory=list)
    additional: list[Record] = field(default_factory=list)

    def flags(self) -> int:
        bits = (self.qr << 15) | (self.opcode << 11) | (self.aa << 10) | (self.tc << 9)
        return bits | (self.rd << 8) | (self.ra << 7) | self.rcode

    def encode(self, max_size: int | None = None) -> bytes:
        """İkili ileti. `max_size` aşılırsa (UDP 512) yalnız başlık+soru, TC=1 ile döner."""
        out = bytearray()
        names: dict[str, int] = {}
        sections = (self.questions, self.answers, self.authority, self.additional)
        out += struct.pack("!HHHHHH", self.id, self.flags(), *(len(s) for s in sections))
        for question in self.questions:
            encode_name(question.name, out, names)
            out += struct.pack("!HH", question.type, question.klass)
        for record in (*self.answers, *self.authority, *self.additional):
            encode_name(record.name, out, names)
            out += struct.pack("!HHI", record.type, record.klass, record.ttl)
            length_at = len(out)
            out += b"\x00\x00"
            _encode_rdata(record, out, names)
            struct.pack_into("!H", out, length_at, len(out) - length_at - 2)
        if max_size is not None and len(out) > max_size:
            short = Message(
                self.id, self.qr, self.opcode, self.aa, True, self.rd, self.ra, self.rcode
            )
            short.questions = list(self.questions)
            return short.encode()
        return bytes(out)

    @classmethod
    def decode(cls, data: bytes) -> Message:
        if len(data) < 12:
            raise DnsFormatError("İleti 12 baytlık başlıktan kısa.")
        ident, flags, qd, an, ns, ar = struct.unpack("!HHHHHH", data[:12])
        message = cls(
            ident,
            bool(flags & 0x8000),
            (flags >> 11) & 0xF,
            bool(flags & 0x400),
            bool(flags & 0x200),
            bool(flags & 0x100),
            bool(flags & 0x80),
            flags & 0xF,
        )
        offset = 12
        for _ in range(qd):
            name, offset = decode_name(data, offset)
            qtype, qclass = _unpack("!HH", data, offset)
            message.questions.append(Question(name, qtype, qclass))
            offset += 4
        for section, count in (
            (message.answers, an),
            (message.authority, ns),
            (message.additional, ar),
        ):
            for _ in range(count):
                record, offset = _decode_record(data, offset)
                section.append(record)
        if offset != len(data):
            raise DnsFormatError("İletinin sonunda fazladan bayt var.")
        return message


def _unpack(fmt: str, data: bytes, offset: int) -> tuple[int, ...]:
    size = struct.calcsize(fmt)
    if offset + size > len(data):
        raise DnsFormatError("İleti beklenenden kısa.")
    return struct.unpack(fmt, data[offset : offset + size])


def encode_name(name: str, out: bytearray, names: dict[str, int]) -> None:
    labels = (
        [label for label in name.rstrip(".").split(".") if label] if name not in ("", ".") else []
    )
    if sum(len(label) + 1 for label in labels) + 1 > 255:
        raise DnsFormatError(f"Ad 255 baytı aşıyor: {name}")
    for index in range(len(labels)):
        suffix = ".".join(labels[index:]).lower()
        if suffix in names:
            out += struct.pack("!H", 0xC000 | names[suffix])
            return
        if len(out) < 0x3FFF:
            names[suffix] = len(out)
        raw = labels[index].encode("ascii")
        if not 0 < len(raw) < 64:
            raise DnsFormatError(f"Etiket 1–63 bayt olmalı: {labels[index]!r}")
        out += bytes([len(raw)]) + raw
    out += b"\x00"


def decode_name(data: bytes, offset: int) -> tuple[str, int]:
    """(ad, adın ardındaki konum). İşaretçiler yalnız geriye gidebilir: döngü imkânsızdır."""
    labels: list[str] = []
    position, end, total = offset, -1, 1
    while True:
        if position >= len(data):
            raise DnsFormatError("Ad iletinin sonunu aşıyor.")
        length = data[position]
        if length & 0xC0 == 0xC0:
            if position + 1 >= len(data):
                raise DnsFormatError("Yarım sıkıştırma işaretçisi.")
            pointer = ((length & 0x3F) << 8) | data[position + 1]
            if pointer >= position:
                raise DnsFormatError("İşaretçi geriye göstermeli (döngü engellendi).")
            end = position + 2 if end < 0 else end
            position = pointer
            continue
        if length & 0xC0:
            raise DnsFormatError("Desteklenmeyen etiket türü.")
        position += 1
        if length == 0:
            return ".".join(labels), position if end < 0 else end
        label = data[position : position + length]
        total += length + 1
        if len(label) < length or total > 255:
            raise DnsFormatError("Etiket kesik ya da ad 255 baytı aşıyor.")
        if any(b <= 0x20 or b >= 0x7F or b == 0x2E for b in label):
            raise DnsFormatError("Etikette yazdırılamaz karakter ya da nokta var.")
        labels.append(label.decode("ascii"))
        position += length


def _encode_rdata(record: Record, out: bytearray, names: dict[str, int]) -> None:
    kind, data = record.type, record.data
    if kind == TYPES["A"]:
        out += ipaddress.IPv4Address(data).packed
    elif kind == TYPES["AAAA"]:
        out += ipaddress.IPv6Address(data).packed
    elif kind in _NAME_TYPES:
        encode_name(data, out, names)
    elif kind == TYPES["MX"]:
        out += struct.pack("!H", data[0])
        encode_name(data[1], out, names)
    elif kind == TYPES["TXT"]:
        for chunk in data:
            if len(chunk) > 255:
                raise DnsFormatError("TXT parçası en çok 255 bayt olabilir.")
            out += bytes([len(chunk)]) + chunk
    elif kind == TYPES["SOA"]:
        encode_name(data.mname, out, names)
        encode_name(data.rname, out, names)
        out += struct.pack(
            "!IIIII", data.serial, data.refresh, data.retry, data.expire, data.minimum
        )
    else:
        out += bytes(data)


def _decode_record(data: bytes, offset: int) -> tuple[Record, int]:
    name, offset = decode_name(data, offset)
    kind, klass, ttl, length = _unpack("!HHIH", data, offset)
    start, end = offset + 10, offset + 10 + length
    if end > len(data):
        raise DnsFormatError("Kayıt verisi iletinin sonunu aşıyor.")
    return Record(name, kind, ttl, _decode_rdata(kind, data, start, end), klass), end


def _decode_rdata(kind: int, data: bytes, start: int, end: int) -> Any:
    raw = data[start:end]
    if kind in (TYPES["A"], TYPES["AAAA"]):
        if len(raw) != (4 if kind == TYPES["A"] else 16):
            raise DnsFormatError("Adres kaydının uzunluğu yanlış.")
        return str(ipaddress.ip_address(raw))
    if kind in _NAME_TYPES or kind in (TYPES["MX"], TYPES["SOA"]):
        position = start + 2 if kind == TYPES["MX"] else start
        first, position = decode_name(data, position)
        if kind == TYPES["SOA"]:
            second, position = decode_name(data, position)
            numbers = _unpack("!IIIII", data, position)
            position += 20
            value: Any = Soa(first, second, *numbers)
        elif kind == TYPES["MX"]:
            value = (_unpack("!H", data, start)[0], first)
        else:
            value = first
        if position != end:
            raise DnsFormatError("Kayıt verisinin uzunluğu içeriğiyle tutmuyor.")
        return value
    if kind == TYPES["TXT"]:
        chunks, position = [], 0
        while position < len(raw):
            size = raw[position]
            chunk = raw[position + 1 : position + 1 + size]
            if len(chunk) < size:
                raise DnsFormatError("TXT parçası kesik.")
            chunks.append(chunk)
            position += 1 + size
        return tuple(chunks)
    return raw
