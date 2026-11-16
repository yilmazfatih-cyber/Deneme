"""Sunucu bütünleşme testleri: stdlib `http.client` ve ham soketle; kötü niyetli istekler dahil."""

from __future__ import annotations

import asyncio
import http.client
import json
import socket
import ssl
import threading
import time
from collections.abc import AsyncIterator, Callable
from pathlib import Path

import pytest

from destek import (
    HOST,
    BackgroundLoop,
    make_self_signed_cert,
    raw_exchange,
    recv_until,
    server_tls_context,
)
from http_sunucu import Headers, HttpServer, Limits, Request, Response

ServeFn = Callable[..., HttpServer]


async def echo(request: Request) -> Response:
    body = await request.read()
    return Response.json(
        {
            "method": request.method,
            "path": request.path,
            "query": request.query,
            "host": request.host,
            "body": body.decode("utf-8", "replace"),
            "client_port": request.client[1] if request.client else None,
        }
    )


async def stream(request: Request) -> Response:
    async def parts() -> AsyncIterator[bytes]:
        for word in ("bir ", "iki ", "üç"):
            yield word.encode()

    return Response(200, Headers([("Content-Type", "text/plain; charset=utf-8")]), parts())


def get(
    server: HttpServer, method: str = "GET", path: str = "/", **kwargs: object
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection(HOST, server.port, timeout=5)
    try:
        conn.request(method, path, **kwargs)  # type: ignore[arg-type]
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        conn.close()


def test_get_head_ve_json(serve: ServeFn) -> None:
    server = serve(echo)
    status, headers, body = get(server, path="/yol?x=%C3%A7")
    assert status == 200
    assert json.loads(body)["query"] == "x=%C3%A7"
    assert headers["Content-Type"] == "application/json"

    async def fixed(request: Request) -> Response:
        return Response.text("merhaba dünya")

    fixed_server = serve(fixed)
    _, get_headers, _ = get(fixed_server)
    head_status, head_headers, head_body = get(fixed_server, "HEAD")
    assert (head_status, head_body) == (200, b"")
    assert head_headers["Content-Length"] == get_headers["Content-Length"] == "14"


def test_post_govdesi_ve_parcali_istek(serve: ServeFn) -> None:
    server = serve(echo)
    _, _, body = get(server, "POST", "/", body="merhaba dünya".encode())
    assert json.loads(body)["body"] == "merhaba dünya"
    _, _, body = get(server, "POST", "/", body=iter([b"par", b"cal", b"i"]), encode_chunked=True)
    assert json.loads(body)["body"] == "parcali"


def test_kalici_baglanti_ayni_soketi_kullanir(serve: ServeFn) -> None:
    server = serve(echo)
    conn = http.client.HTTPConnection(HOST, server.port, timeout=5)
    ports = set()
    for index in range(5):
        conn.request("GET", f"/{index}")
        ports.add(json.loads(conn.getresponse().read())["client_port"])
    conn.close()
    assert len(ports) == 1


def test_boru_hatti_sirali_yanitlar(serve: ServeFn) -> None:
    server = serve(echo)
    requests = b"".join(
        b"GET /%d HTTP/1.1\r\nHost: x\r\n%b\r\n" % (i, b"Connection: close\r\n" if i == 3 else b"")
        for i in (1, 2, 3)
    )
    data = raw_exchange(server.port, requests)
    assert data.count(b"HTTP/1.1 200 OK") == 3
    assert data.index(b'"/1"') < data.index(b'"/2"') < data.index(b'"/3"')


def test_parcali_yanit_ve_http10(serve: ServeFn) -> None:
    server = serve(stream)
    status, headers, body = get(server)
    assert (status, body.decode()) == (200, "bir iki üç")
    assert headers["Transfer-Encoding"] == "chunked"
    raw = raw_exchange(server.port, b"GET / HTTP/1.0\r\n\r\n")
    head, _, rest = raw.partition(b"\r\n\r\n")
    assert b"Connection: close" in head
    assert b"chunked" not in head
    assert rest.decode() == "bir iki üç"


def test_expect_100_continue(serve: ServeFn) -> None:
    server = serve(echo)
    with socket.create_connection((HOST, server.port), timeout=5) as sock:
        sock.sendall(
            b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nExpect: 100-continue\r\n\r\n"
        )
        assert recv_until(sock, b"\r\n\r\n") == b"HTTP/1.1 100 Continue\r\n\r\n"
        sock.sendall(b"selam")
        assert b'"body":"selam"' in recv_until(sock, b"}")


def test_expect_100_okumadan_reddeden_isleyici(serve: ServeFn) -> None:
    async def deny(request: Request) -> Response:
        return Response.error(401)

    server = serve(deny)
    head = b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 5\r\nExpect: 100-continue\r\n\r\n"
    data = raw_exchange(server.port, head)
    assert data.startswith(b"HTTP/1.1 401")
    assert b"100 Continue" not in data
    assert b"Connection: close" in data


SMUGGLING = [
    b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n"
    b"0\r\n\r\nGET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
    b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 0\r\nContent-Length: 30\r\n\r\n"
    b"GET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
    b"POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n"
    b"Transfer-Encoding: identity\r\n\r\n"
    b"0\r\n\r\nGET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
    b"POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n"
    b"0x1e\r\nGET /gizli HTTP/1.1\r\nHost: x\r\n\r\n\r\n0\r\n\r\n",
    b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: \xd9\xa4\r\n\r\n"
    b"GET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
    b"POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding : chunked\r\nContent-Length: 4\r\n\r\n"
    b"GET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
    b"GET / HTTP/1.1\nHost: x\n\nGET /gizli HTTP/1.1\r\nHost: x\r\n\r\n",
]


@pytest.mark.parametrize("payload", SMUGGLING)
def test_istek_kacakciligi_denemeleri_reddedilir(serve: ServeFn, payload: bytes) -> None:
    server = serve(echo)
    data = raw_exchange(server.port, payload)
    assert data.startswith(b"HTTP/1.1 400")
    assert data.count(b"HTTP/1.1") == 1  # ikinci (kaçak) istek asla işlenmez
    assert b"/gizli" not in data
    assert b"Connection: close" in data


@pytest.mark.parametrize(
    ("payload", "status"),
    [
        (b"GET / HTTP/1.1\r\n\r\n", b"400"),  # Host yok
        (b"GET / HTTP/2.0\r\nHost: x\r\n\r\n", b"505"),
        (b"POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: gzip\r\n\r\n", b"501"),
        (b"POST / HTTP/1.1\r\nHost: x\r\nExpect: bir-sey\r\n\r\n", b"417"),
    ],
)
def test_hatali_istekler(serve: ServeFn, payload: bytes, status: bytes) -> None:
    server = serve(echo)
    assert raw_exchange(server.port, payload).startswith(b"HTTP/1.1 " + status)


def test_sinirlar_414_431_413(serve: ServeFn) -> None:
    server = serve(echo, limits=Limits(max_line=256, max_headers=5, max_body=100))
    assert raw_exchange(server.port, b"GET /" + b"a" * 300 + b" HTTP/1.1\r\n\r\n")[9:12] == b"414"
    many = b"".join(b"X-%d: 1\r\n" % i for i in range(10))
    assert (
        raw_exchange(server.port, b"GET / HTTP/1.1\r\nHost: x\r\n" + many + b"\r\n")[9:12] == b"431"
    )
    big = b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 1000\r\n\r\n"
    assert raw_exchange(server.port, big)[9:12] == b"413"
    chunks = (
        b"POST / HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n" + b"40\r\n" + b"a" * 64
    )
    chunks += b"\r\n40\r\n" + b"a" * 64 + b"\r\n0\r\n\r\n"
    assert raw_exchange(server.port, chunks)[9:12] == b"413"


def test_yavas_istemci_408_alir(serve: ServeFn) -> None:
    server = serve(echo, limits=Limits(head_timeout=0.3, body_timeout=0.3))
    started = time.monotonic()
    data = raw_exchange(server.port, b"GET / HTTP/1.1\r\nHost: x\r\n")  # boş satır hiç gelmiyor
    assert data.startswith(b"HTTP/1.1 408")
    assert time.monotonic() - started < 3
    body_stall = b"POST / HTTP/1.1\r\nHost: x\r\nContent-Length: 10\r\n\r\nab"
    assert raw_exchange(server.port, body_stall).startswith(b"HTTP/1.1 408")


def test_bosta_bekleyen_baglanti_kapanir(serve: ServeFn) -> None:
    server = serve(echo, limits=Limits(keepalive_timeout=0.2))
    with socket.create_connection((HOST, server.port), timeout=5) as sock:
        sock.sendall(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
        recv_until(sock, b"}")
        assert sock.recv(10) == b""  # sunucu boşta süre dolunca kapattı


def test_isleyici_hatasi_ayrinti_sizdirmaz(serve: ServeFn) -> None:
    async def broken(request: Request) -> Response:
        raise RuntimeError("gizli-veritabani-parolasi")

    async def inject(request: Request) -> Response:
        return Response(302, Headers([("Location", "/a\r\nSet-Cookie: oturum=ele-gecirildi")]))

    for handler in (broken, inject):
        server = serve(handler)
        status, headers, body = get(server)
        assert status == 500
        assert b"gizli" not in body
        assert "Set-Cookie" not in headers
        assert "Sunucuda beklenmeyen" in body.decode()


def test_baglanti_siniri_503(serve: ServeFn) -> None:
    server = serve(echo, limits=Limits(max_connections=1))
    with socket.create_connection((HOST, server.port), timeout=5) as first:
        first.sendall(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
        recv_until(first, b"}")  # ilk bağlantı açık ve kayıtlı
        assert raw_exchange(server.port, b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")[9:12] == b"503"


def test_duzgun_kapanis_suren_yaniti_tamamlar(loop_thread: BackgroundLoop) -> None:
    entered = threading.Event()

    async def slow(request: Request) -> Response:
        entered.set()
        await asyncio.sleep(0.3)
        return Response.text("bitti")

    server = HttpServer(slow)
    loop_thread.run(server.start())
    result: dict[str, object] = {}

    def client() -> None:
        conn = http.client.HTTPConnection(HOST, server.port, timeout=5)
        conn.request("GET", "/")
        response = conn.getresponse()
        result.update(
            status=response.status, body=response.read(), conn=response.getheader("Connection")
        )
        conn.close()

    with socket.create_connection((HOST, server.port), timeout=5) as idle:
        thread = threading.Thread(target=client)
        thread.start()
        assert entered.wait(5)
        started = time.monotonic()
        loop_thread.run(server.close(grace=5))
        thread.join(5)
        assert idle.recv(10) == b""  # boştaki bağlantı kapanışta hemen kapatıldı
    assert result == {"status": 200, "body": b"bitti", "conn": "close"}
    assert time.monotonic() - started < 3
    with pytest.raises(ConnectionRefusedError):
        socket.create_connection((HOST, server.port), timeout=2).close()


def test_tls_ile_sunum(serve: ServeFn, tmp_path: Path) -> None:
    cert, key = make_self_signed_cert(tmp_path)
    server = serve(echo, ssl_context=server_tls_context(cert, key))
    context = ssl.create_default_context(cafile=str(cert))
    conn = http.client.HTTPSConnection(HOST, server.port, timeout=5, context=context)
    conn.request("GET", "/guvenli")
    assert json.loads(conn.getresponse().read())["path"] == "/guvenli"
    conn.close()
    assert server.url.startswith("https://")
