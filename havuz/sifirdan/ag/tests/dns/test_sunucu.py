"""Yetkili sunucu + çözümleyici, gerçek UDP/TCP üzerinden (yalnız 127.0.0.1, boş kapı)."""

from __future__ import annotations

import socket
import threading
from collections.abc import Iterator
from pathlib import Path

import pytest

from destek import HOST, BackgroundLoop
from dns import (
    DnsServer,
    Message,
    NameNotFoundError,
    Question,
    Record,
    ResolveError,
    Resolver,
    parse_zone,
)
from dns.message import RCODES, TYPES

ZONE = Path(__file__).parents[2] / "dns" / "ornek.zone"


@pytest.fixture
def server(loop_thread: BackgroundLoop) -> Iterator[DnsServer]:
    text = ZONE.read_text(encoding="utf-8")
    text += "\n" + "\n".join(f'buyuk IN TXT "{"x" * 200}"' for _ in range(5))
    dns_server = DnsServer(parse_zone(text))
    loop_thread.run(dns_server.start())
    yield dns_server
    loop_thread.run(dns_server.close())


def resolver(server: DnsServer, **kwargs: object) -> Resolver:
    # type: ignore[arg-type]
    return Resolver((HOST, server.udp_port), tcp_port=server.tcp_port, timeout=1.0, **kwargs)


def test_temel_sorgular(server: DnsServer) -> None:
    ask = resolver(server)
    assert ask.resolve("www.ornek.test") == ["192.0.2.10"]
    assert ask.resolve("WWW.Ornek.TEST.", "AAAA") == ["2001:db8::10"]  # büyük/küçük harf duyarsız
    assert ask.resolve("ornek.test", "TXT") == ["v=spf1 -all"]
    reply = ask.query("ornek.test", "MX")
    assert reply.aa and reply.answers[0].data == (10, "posta.ornek.test")
    assert [r.data for r in reply.additional] == ["192.0.2.20"]  # ek bölümde adres (glue)


def test_cname_zinciri_nxdomain_nodata(server: DnsServer) -> None:
    ask = resolver(server)
    reply = ask.query("blog.ornek.test", "A")
    assert [(r.type, r.data) for r in reply.answers] == [
        (TYPES["CNAME"], "www.ornek.test"),
        (TYPES["A"], "192.0.2.10"),
    ]
    with pytest.raises(NameNotFoundError):
        ask.resolve("yok.ornek.test")
    missing = ask.query("yok.ornek.test")
    assert missing.authority[0].type == TYPES["SOA"]  # olumsuz önbellek için SOA
    nodata = ask.query("posta.ornek.test", "AAAA")
    assert nodata.rcode == RCODES["NOERROR"] and not nodata.answers and nodata.authority


def test_bolge_disi_soru_reddedilir(server: DnsServer) -> None:
    reply = resolver(server).query("ornek.com")
    assert reply.rcode == RCODES["REFUSED"] and not reply.aa
    with pytest.raises(ResolveError, match="REFUSED"):
        resolver(server).resolve("ornek.com")


def test_kesik_udp_yaniti_tcp_ile_tamamlanir(server: DnsServer) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(2)
        sock.sendto(
            Message(9, questions=[Question("buyuk.ornek.test", TYPES["TXT"])]).encode(),
            (HOST, server.udp_port),
        )
        udp_reply = Message.decode(sock.recv(4096))
    assert udp_reply.tc and not udp_reply.answers
    assert len(resolver(server).resolve("buyuk.ornek.test", "TXT")) == 5  # TCP ile hepsi


def test_bozuk_paket_formerr_yanit_paketi_sessiz(server: DnsServer) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.settimeout(1)
        sock.sendto(
            b"\x12\x34\x01\x00\x00\x01\x00\x00\x00\x00\x00\x00\xc0\x0c", (HOST, server.udp_port)
        )
        reply = Message.decode(sock.recv(512))
        assert (reply.id, reply.rcode, reply.qr) == (0x1234, RCODES["FORMERR"], True)
        sock.sendto(Message(1, qr=True).encode(), (HOST, server.udp_port))  # yanıta yanıt verilmez
        with pytest.raises(TimeoutError):
            sock.recv(512)


def test_onbellek_ttl_ile_dolar(server: DnsServer) -> None:
    now = [1000.0]
    ask = resolver(server, clock=lambda: now[0])
    first = ask.query("www.ornek.test")
    assert ask.query("www.ornek.test") is first  # önbellekten
    now[0] += 301
    assert ask.query("www.ornek.test") is not first  # TTL (300) doldu


def a_record(name: str, address: str) -> Record:
    return Record(name, TYPES["A"], 60, address)


def test_sahte_yanitlar_yok_sayilir() -> None:
    """Önce yanlış kimlikli, sonra yanlış sorulu, en son doğru yanıt: yalnız sonuncusu kabul
    edilir.
    """
    fake = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    fake.bind((HOST, 0))
    fake.settimeout(5)

    def respond() -> None:
        data, addr = fake.recvfrom(512)
        query = Message.decode(data)
        wrong_id = Message(query.id ^ 1, qr=True, questions=query.questions)
        wrong_q = Message(query.id, qr=True, questions=[Question("kotu.site", TYPES["A"])])
        right = Message(query.id, qr=True, questions=query.questions)
        for reply in (wrong_id, wrong_q):
            reply.answers.append(a_record(query.questions[0].name, "6.6.6.6"))
            fake.sendto(reply.encode(), addr)
        fake.sendto(b"\xff" * 5, addr)  # çöp paket
        right.answers.append(a_record(query.questions[0].name, "192.0.2.99"))
        fake.sendto(right.encode(), addr)

    thread = threading.Thread(target=respond)
    thread.start()
    try:
        assert Resolver(fake.getsockname(), timeout=3).resolve("www.ornek.test") == ["192.0.2.99"]
    finally:
        thread.join(5)
        fake.close()


def test_kapali_sunucu_anlasilir_hata(server: DnsServer) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
        probe.bind((HOST, 0))
        port = probe.getsockname()[1]
    with pytest.raises(ResolveError):
        Resolver((HOST, port), timeout=0.3, retries=0).resolve("www.ornek.test")
