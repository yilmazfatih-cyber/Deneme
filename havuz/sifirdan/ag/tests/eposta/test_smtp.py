"""SMTP sunucusu + istemcisi: gidiş-dönüş, stdlib smtplib uyumu, protokol hataları, sınırlar,
yakalayıcı.
"""

from __future__ import annotations

import asyncio
import smtplib
import socket
from collections.abc import Iterator
from email.message import EmailMessage
from pathlib import Path

import pytest

from destek import HOST, BackgroundLoop, recv_until
from eposta import MailCatcher, SmtpError, SmtpServer, build_message, parse_message, send_mail
from eposta.smtp_client import dot_stuff


@pytest.fixture
def smtp(loop_thread: BackgroundLoop, tmp_path: Path) -> Iterator[tuple[SmtpServer, MailCatcher]]:
    catcher = MailCatcher(tmp_path / "yakalanan")
    server = SmtpServer(catcher, max_size=2000, max_recipients=3, timeout=2)
    loop_thread.run(server.start())
    yield server, catcher
    loop_thread.run(server.close())


def test_kendi_istemcimizle_gonderim_ve_yakalama(
    smtp: tuple[SmtpServer, MailCatcher], loop_thread: BackgroundLoop
) -> None:
    server, catcher = smtp
    message = build_message(
        sender=("Ayşe", "ayse@ornek.test"),
        to=[("", "mehmet@ornek.test")],
        subject="Şifre sıfırlama",
        text="Bağlantı:\n.http://ornek.test/sifirla\n",
        message_id="<x@ornek.test>",
    )
    accepted = loop_thread.run(
        send_mail(
            HOST,
            server.port,
            "ayse@ornek.test",
            ["mehmet@ornek.test", "zeynep@ornek.test"],
            message,
        )
    )
    assert accepted == ["mehmet@ornek.test", "zeynep@ornek.test"]
    envelope = catcher.messages[0]
    assert (envelope.sender, envelope.recipients) == ("ayse@ornek.test", accepted)
    parsed = parse_message(envelope.data)
    assert parsed.subject == "Şifre sıfırlama"
    assert ".http://ornek.test/sifirla" in parsed.text  # nokta doldurması geri alındı
    files = list((catcher.folder or Path()).glob("*.eml"))
    assert len(files) == 1 and parse_message(files[0].read_bytes()).subject == "Şifre sıfırlama"


def test_stdlib_smtplib_ile_uyum(smtp: tuple[SmtpServer, MailCatcher]) -> None:
    server, catcher = smtp
    message = EmailMessage()
    message["Subject"] = "smtplib'den Türkçe konu"
    message["From"] = "gonderen@ornek.test"
    message["To"] = "alici@ornek.test"
    message.set_content("Gövde: ığüşöç\n")
    with smtplib.SMTP(HOST, server.port, timeout=5) as client:
        code, features = client.ehlo()
        assert code == 250 and b"PIPELINING" in features
        client.send_message(message)
        assert client.verify("biri")[0] == 252
    parsed = parse_message(catcher.messages[0].data)
    assert parsed.subject == "smtplib'den Türkçe konu"
    assert parsed.text == "Gövde: ığüşöç\n"


def dialogue(port: int, lines: list[bytes]) -> list[str]:
    """Ham soketle komutları sırayla gönderir, her birinin yanıt kodunu toplar."""
    with socket.create_connection((HOST, port), timeout=5) as sock:
        codes = [recv_until(sock, b"\r\n").decode()[:3]]
        for line in lines:
            sock.sendall(line)
            codes.append(recv_until(sock, b"\r\n").decode()[:3])
        return codes


def test_protokol_sirasi_ve_hatalar(smtp: tuple[SmtpServer, MailCatcher]) -> None:
    port = smtp[0].port
    assert dialogue(port, [b"MAIL FROM:<a@ornek.test>\r\n"]) == ["220", "503"]  # EHLO yok
    assert dialogue(port, [b"HELO x\r\n", b"RCPT TO:<b@ornek.test>\r\n"]) == ["220", "250", "503"]
    assert dialogue(port, [b"HELO x\r\n", b"DATA\r\n"]) == ["220", "250", "503"]
    assert dialogue(port, [b"HELO x\r\n", b"MAIL FROM:adres-yok\r\n"]) == ["220", "250", "501"]
    assert dialogue(port, [b"BILMECE\r\n", b"NOOP\r\n", b"RSET\r\n"]) == [
        "220",
        "500",
        "250",
        "250",
    ]
    assert dialogue(port, [b"HELO x\r\n", b"MAIL FROM:<a@o.test> SIZE=999999\r\n"]) == [
        "220",
        "250",
        "552",
    ]
    rcpts = [b"HELO x\r\n", b"MAIL FROM:<a@o.test>\r\n"] + [b"RCPT TO:<b@o.test>\r\n"] * 4
    assert dialogue(port, rcpts)[-1] == "452"  # en çok 3 alıcı
    assert dialogue(port, [b"QUIT\r\n"]) == ["220", "221"]


def test_boyut_siniri_ve_boru_hatti(smtp: tuple[SmtpServer, MailCatcher]) -> None:
    server, catcher = smtp
    big = b"HELO x\r\nMAIL FROM:<a@o.test>\r\nRCPT TO:<b@o.test>\r\nDATA\r\n" + b"x" * 80 + b"\r\n"
    with socket.create_connection((HOST, server.port), timeout=5) as sock:
        sock.sendall(big + (b"y" * 80 + b"\r\n") * 30 + b".\r\n")  # PIPELINING: hepsi bir arada
        replies = recv_until(sock, b"552", limit=4096).decode()
    assert [line[:3] for line in replies.split("\r\n") if line[:3].isdigit()][-1] == "552"
    assert catcher.messages == []


def test_bosta_bekleyen_baglanti_kapanir(smtp: tuple[SmtpServer, MailCatcher]) -> None:
    with socket.create_connection((HOST, smtp[0].port), timeout=5) as sock:
        greeting = recv_until(sock, b"\r\n")
        assert greeting.startswith(b"220")
        assert recv_until(sock, b"\r\n").startswith(b"421")  # 2 sn boşta → kapanış


def test_hicbir_alici_kabul_edilmezse_hata(
    smtp: tuple[SmtpServer, MailCatcher], loop_thread: BackgroundLoop
) -> None:
    with pytest.raises(SmtpError) as info:
        loop_thread.run(send_mail(HOST, smtp[0].port, "a@ornek.test", ["gecersiz adres"], b"x"))
    assert info.value.code == 550


def test_nokta_doldurma() -> None:
    assert dot_stuff(b"a\n.b\n..c\n") == b"a\r\n..b\r\n...c\r\n.\r\n"
    assert dot_stuff(b".") == b"..\r\n.\r\n"
    assert asyncio.iscoroutinefunction(send_mail)
