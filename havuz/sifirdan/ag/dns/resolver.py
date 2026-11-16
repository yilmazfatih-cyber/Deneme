"""Uç (stub) çözümleyici: bir DNS sunucusuna soru sorar, yanıtı doğrular, TTL'li önbellek tutar.

    çözümleyici = Resolver(("127.0.0.1", 8453))
    çözümleyici.resolve("www.ornek.test", "A")   → ["192.0.2.10"]
Sahte yanıt (DNS zehirleme) önlemleri: her soru RASTGELE 16 bitlik kimlik taşır (`secrets`);
kimliği, QR bitini ve SORUYU tutmayan paketler yok sayılır ve beklemeye devam edilir; soket sunucuya
`connect` edilir (başka adresten gelen paket çekirdekte elenir). Kesik (TC=1) yanıt gelirse TCP ile
yeniden sorulur.
Genişletme: kaynak kapıyı her soruda rastgele seçmek (ek zehirleme direnci) için soketi her sorguda
yeniden açın — burada zaten öyle yapılıyor; sıradaki adım DNSSEC doğrulamasıdır (kapsam dışı).
"""

from __future__ import annotations

import secrets
import socket
import struct
import time
from collections.abc import Callable

from dns.message import RCODES, TYPES, DnsFormatError, Message, Question


class ResolveError(Exception):
    """Ad çözülemedi (zaman aşımı, sunucu hatası)."""


class NameNotFoundError(ResolveError):
    """NXDOMAIN: böyle bir ad yok."""


class Resolver:
    def __init__(
        self,
        server: tuple[str, int],
        *,
        tcp_port: int | None = None,
        timeout: float = 2.0,
        retries: int = 2,
        clock: Callable[[], float] = time.monotonic,
        new_id: Callable[[], int] = lambda: secrets.randbits(16),
    ) -> None:
        self.server = server
        self.tcp_server = (server[0], tcp_port or server[1])
        self.timeout, self.retries, self.clock, self.new_id = timeout, retries, clock, new_id
        self._cache: dict[tuple[str, int], tuple[float, Message]] = {}

    @staticmethod
    def _matches(query: Message, reply: Message) -> bool:
        if not reply.qr or reply.id != query.id or len(reply.questions) != 1:
            return False
        asked, got = query.questions[0], reply.questions[0]
        return (got.name.lower(), got.type, got.klass) == (
            asked.name.lower(),
            asked.type,
            asked.klass,
        )

    def _udp(self, query: Message) -> Message:
        packet = query.encode()
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(self.server)
            for _ in range(self.retries + 1):
                sock.send(packet)
                deadline = self.clock() + self.timeout
                while (left := deadline - self.clock()) > 0:
                    sock.settimeout(left)
                    try:
                        data = sock.recv(4096)
                    except TimeoutError:
                        break
                    except ConnectionRefusedError as exc:
                        raise ResolveError(f"{self.server} adresinde DNS sunucusu yok.") from exc
                    try:
                        reply = Message.decode(data)
                    except DnsFormatError:
                        continue  # bozuk paket: gerçek yanıtı beklemeye devam
                    if self._matches(query, reply):
                        return reply
        raise ResolveError(f"{self.server} {self.retries + 1} denemede yanıt vermedi.")

    def _tcp(self, query: Message) -> Message:
        packet = query.encode()
        with socket.create_connection(self.tcp_server, timeout=self.timeout) as sock:
            sock.sendall(struct.pack("!H", len(packet)) + packet)
            file = sock.makefile("rb")
            header = file.read(2)
            if len(header) < 2:
                raise ResolveError("TCP yanıtı yarıda kesildi.")
            data = file.read(struct.unpack("!H", header)[0])
        reply = Message.decode(data)
        if not self._matches(query, reply):
            raise ResolveError("TCP yanıtı soruyla eşleşmiyor.")
        return reply

    def query(self, name: str, kind: str = "A") -> Message:
        code = TYPES[kind.upper()]
        key = (name.lower().rstrip("."), code)
        cached = self._cache.get(key)
        if cached and cached[0] > self.clock():
            return cached[1]
        query = Message(self.new_id() & 0xFFFF, rd=True, questions=[Question(key[0], code)])
        reply = self._udp(query)
        if reply.tc:
            reply = self._tcp(query)
        records = reply.answers or reply.authority
        ttl = min((r.ttl for r in records), default=0)
        if reply.rcode in (RCODES["NOERROR"], RCODES["NXDOMAIN"]) and ttl > 0:
            self._cache[key] = (self.clock() + ttl, reply)
        return reply

    def resolve(self, name: str, kind: str = "A") -> list[str]:
        """İstenen türdeki kayıtların verisini metin olarak döndürür (CNAME zinciri yanıtta
        izlenir).
        """
        reply = self.query(name, kind)
        if reply.rcode == RCODES["NXDOMAIN"]:
            raise NameNotFoundError(f"'{name}' adında kayıt yok (NXDOMAIN).")
        if reply.rcode != RCODES["NOERROR"]:
            names = {code: label for label, code in RCODES.items()}
            raise ResolveError(f"Sunucu hata döndü: {names.get(reply.rcode, reply.rcode)}")
        code = TYPES[kind.upper()]
        return [_text(r.data) for r in reply.answers if r.type == code]


def _text(data: object) -> str:
    if isinstance(data, tuple) and data and isinstance(data[0], bytes):
        return " ".join(chunk.decode("utf-8", "replace") for chunk in data)
    if isinstance(data, tuple):
        return f"{data[0]} {data[1]}"
    return str(data)
