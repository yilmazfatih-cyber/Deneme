"""Ağ üstünden: RESP, ardışık istekler, parçalı gelen baytlar, satır kipi, eşzamanlı istemciler,
redis-cli uyumu ve yeniden başlatmada anlık görüntü."""

from __future__ import annotations

import shutil
import socket
import subprocess
import threading
from pathlib import Path

import pytest

from onbellek_sunucu import CacheClient, CacheError, CacheServer, Store
from tests.onbellek_sunucu.harness import ServerThread


def _server(**options: object) -> CacheServer:
    return CacheServer(Store(), port=0, expire_interval=None, **options)  # type: ignore[arg-type]


def test_client_roundtrip_and_errors() -> None:
    with ServerThread(_server()) as port, CacheClient(port=port) as client:
        assert client.set("şehir", "İzmir", ex=60)
        assert client.get("şehir") == "İzmir".encode()
        assert client.incr("sayac") == 1 and client.incr("sayac") == 2
        assert client.delete("şehir", "yok") == 1
        with pytest.raises(CacheError, match="ERR"):
            client.execute("INCR", "x", "fazla")


def test_pipelining_partial_bytes_inline_and_protocol_error() -> None:
    with ServerThread(_server()) as port, socket.create_connection(("127.0.0.1", port)) as sock:
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # küçük paketleri birleştirme
        sock.sendall(
            b"*3\r\n$3\r\nSET\r\n$1\r\na\r\n$1\r\n1\r\n*2\r\n$4\r\nINCR\r\n$1\r\na\r\nPING\r\n"
        )
        expected = b"+OK\r\n:2\r\n+PONG\r\n"
        received = b""
        while len(received) < len(expected):
            received += sock.recv(100)
        assert received == expected  # üç istek tek paket: üç yanıt, sırayla
        for byte in b"*2\r\n$3\r\nGET\r\n$1\r\na\r\n":  # bayt bayt gelen istek
            sock.sendall(bytes([byte]))
        assert sock.recv(100) == b"$1\r\n2\r\n"
        sock.sendall(b"*1\r\n$abc\r\n")  # bozuk RESP: hata ve bağlantı kapanır
        assert sock.recv(100).startswith(b"-ERR protokol")


def test_concurrent_clients_do_not_lose_increments() -> None:
    with ServerThread(_server()) as port:

        def worker() -> None:
            with CacheClient(port=port) as client:
                for _ in range(200):
                    client.incr("ortak")

        threads = [threading.Thread(target=worker) for _ in range(5)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        with CacheClient(port=port) as client:
            assert client.get("ortak") == b"1000"


@pytest.mark.skipif(shutil.which("redis-cli") is None, reason="redis-cli kurulu değil")
def test_real_redis_cli_can_talk_to_us() -> None:
    with ServerThread(_server()) as port:

        def cli(*args: str) -> str:
            command = ["redis-cli", "-p", str(port), *args]
            return subprocess.run(
                command, capture_output=True, check=True, text=True
            ).stdout.strip()

        assert cli("SET", "şehir", "İzmir") == "OK"
        assert cli("GET", "şehir") == "İzmir"
        assert cli("INCRBY", "n", "5") == "5"
        assert cli("TTL", "şehir") == "-1"


def test_snapshot_survives_restart(tmp_path: Path) -> None:
    path = tmp_path / "onbellek.snap"
    with ServerThread(_server(snapshot_path=path)) as port, CacheClient(port=port) as client:
        client.set("kalici", "evet")
        assert client.execute("SAVE") is not None
        client.set("kapanista", "da kaydedilir")
    with ServerThread(_server(snapshot_path=path)) as port, CacheClient(port=port) as client:
        assert client.get("kalici") == b"evet"
        assert client.get("kapanista") == b"da kaydedilir"
