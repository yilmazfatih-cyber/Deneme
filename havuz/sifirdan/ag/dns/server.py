"""Küçük YETKİLİ DNS sunucusu (UDP + TCP): yerel bir bölgeyi yanıtlar, özyineleme yapmaz.

Yanıt mantığı (`answer`):
    soru bölgede değil → REFUSED (açık özyinelemeli çözümleyici DEĞİLİZ)
    ad + tür var → yanıt (AA=1); CNAME varsa bölge içinde izlenir (en çok 8 adım)
    ad var, tür yok → NODATA (boş yanıt + yetki bölümünde SOA)
    ad yok → NXDOMAIN + SOA;  MX/NS hedeflerinin adresleri "ek" bölümüne (glue)
UDP yanıtı 512 baytı aşarsa TC=1 ile kesilir; istemci TCP ile yeniden sorar (2 baytlık uzunluk
önekiyle).
Güvenlik: yanıt bitli (QR=1) paketlere hiç yanıt verilmez (yansıma döngüsü); bozuk pakete FORMERR;
yalnız yerel adrese bağlanır. Hız sınırı YOKTUR (yansıtma/çoğaltma saldırısına karşı internete
açmayın).
Genişletme: yeni bir yanıt kuralı (ör. joker kayıt *.ornek.test) `answer` içine dal olarak eklenir.
"""

from __future__ import annotations

import asyncio
import contextlib
import struct

from dns.message import RCODES, TYPES, DnsFormatError, Message, Record
from dns.zone import Zone

UDP_LIMIT = 512


def _add_glue(zone: Zone, response: Message) -> None:
    for record in response.answers:
        target = record.data[1] if record.type == TYPES["MX"] else record.data
        if record.type in (TYPES["MX"], TYPES["NS"]):
            for kind in (TYPES["A"], TYPES["AAAA"]):
                response.additional += zone.lookup(target, kind)


def answer(zone: Zone, query: Message) -> Message:
    response = Message(
        query.id, qr=True, opcode=query.opcode, rd=query.rd, questions=query.questions
    )
    if query.opcode != 0:
        response.rcode = RCODES["NOTIMP"]
        return response
    if len(query.questions) != 1:
        response.rcode = RCODES["FORMERR"]
        return response
    question = query.questions[0]
    name = question.name.lower()
    if question.klass != 1 or not zone.contains(name):
        response.rcode = RCODES["REFUSED"]
        return response
    response.aa = True
    for _ in range(8):
        found = zone.lookup(name, question.type)
        if found:
            response.answers += found
            _add_glue(zone, response)
            return response
        cname = zone.lookup(name, TYPES["CNAME"])
        if not cname or question.type == TYPES["CNAME"]:
            break
        response.answers += cname
        name = cname[0].data
        if not zone.contains(name):
            return response  # bölge dışına giden CNAME: istemci kendisi izler
    if not response.answers and not zone.has_name(name):
        response.rcode = RCODES["NXDOMAIN"]
    soa = zone.soa
    if soa is not None:
        response.authority.append(Record(soa.name, soa.type, soa.data.minimum, soa.data))
    return response


def handle_packet(zone: Zone, data: bytes, limit: int | None) -> bytes | None:
    """Ham paket → ham yanıt (yanıt verilmeyecekse None)."""
    try:
        query = Message.decode(data)
    except DnsFormatError:
        if len(data) < 12 or data[2] & 0x80:
            return None
        ident = struct.unpack("!H", data[:2])[0]
        return Message(ident, qr=True, rcode=RCODES["FORMERR"]).encode()
    if query.qr:
        return None  # yanıtlara yanıt verilmez (yansıma döngüsü)
    return answer(zone, query).encode(limit)


class _UdpProtocol(asyncio.DatagramProtocol):
    def __init__(self, zone: Zone) -> None:
        self.zone = zone
        self.transport: asyncio.DatagramTransport | None = None

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        assert isinstance(transport, asyncio.DatagramTransport)
        self.transport = transport

    def datagram_received(self, data: bytes, addr: tuple[str | object, int]) -> None:
        reply = handle_packet(self.zone, data, UDP_LIMIT)
        if reply is not None and self.transport is not None:
            self.transport.sendto(reply, addr)


class DnsServer:
    """`await DnsServer(zone).start()` → (udp_port, tcp_port). Testlerde kapı 0 (boş kapı)
    verilir.
    """

    def __init__(
        self, zone: Zone, host: str = "127.0.0.1", port: int = 0, idle_timeout: float = 5.0
    ) -> None:
        self.zone, self.host, self.port, self.idle_timeout = zone, host, port, idle_timeout
        self._udp: asyncio.DatagramTransport | None = None
        self._tcp: asyncio.Server | None = None
        self._writers: set[asyncio.StreamWriter] = (
            set()
        )  # kapanışta açık TCP bağlantılarını kapatmak için
        self.udp_port = self.tcp_port = 0

    async def start(self) -> tuple[int, int]:
        loop = asyncio.get_running_loop()
        transport, _ = await loop.create_datagram_endpoint(
            lambda: _UdpProtocol(self.zone), local_addr=(self.host, self.port)
        )
        self._udp = transport
        self.udp_port = int(transport.get_extra_info("sockname")[1])
        tcp_port = self.port or self.udp_port  # aynı kapı numarası denenir
        try:
            self._tcp = await asyncio.start_server(self._tcp_client, self.host, tcp_port)
        except OSError:
            self._tcp = await asyncio.start_server(self._tcp_client, self.host, 0)
        self.tcp_port = int(self._tcp.sockets[0].getsockname()[1])
        return self.udp_port, self.tcp_port

    async def _tcp_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self._writers.add(writer)
        try:
            while True:
                size = struct.unpack(
                    "!H", await asyncio.wait_for(reader.readexactly(2), self.idle_timeout)
                )[0]
                data = await asyncio.wait_for(reader.readexactly(size), self.idle_timeout)
                reply = handle_packet(self.zone, data, None)
                if reply is None:
                    break
                writer.write(struct.pack("!H", len(reply)) + reply)
                await writer.drain()
        except (asyncio.IncompleteReadError, TimeoutError, ConnectionError):
            pass
        finally:
            self._writers.discard(writer)
            writer.close()
            with contextlib.suppress(Exception):
                await writer.wait_closed()

    async def close(self) -> None:
        if self._udp is not None:
            self._udp.close()
        if self._tcp is not None:
            self._tcp.close()
            for writer in list(self._writers):
                writer.close()
            await self._tcp.wait_closed()
