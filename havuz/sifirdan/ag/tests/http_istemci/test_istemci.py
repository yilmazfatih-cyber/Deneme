"""İstemci bütünleşme testleri: kendi sunucumuz (http_sunucu), stdlib `http.server` ve ham soket
sunucuları.
"""

from __future__ import annotations

import asyncio
import contextlib
import functools
import gzip
import json
import socket
import threading
import zlib
from collections.abc import AsyncIterator, Callable, Iterator
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st

from destek import HOST, BackgroundLoop, make_self_signed_cert, recv_until, server_tls_context
from http_istemci import (
    Client,
    ConnectError,
    HttpClientError,
    InsecureRedirectError,
    ProtocolViolationError,
    RequestTimeoutError,
    ResponseTooLargeError,
    Retry,
    TooManyRedirectsError,
    parse_url,
    tls_context,
)
from http_istemci.connection import Connection
from http_istemci.response import Response
from http_sunucu import Headers, HttpServer, Limits, Request
from http_sunucu import Response as ServerResponse

BOMB = gzip.compress(bytes(5 * 1024 * 1024))  # 5 MB sıfır → birkaç KB


def make_app(state: dict[str, int], other_port: Callable[[], int]) -> Callable[[Request], object]:
    async def app(request: Request) -> ServerResponse:
        path = request.path
        if path == "/merhaba":
            return ServerResponse.text("merhaba dünya")
        if path.startswith("/yonlendir/"):
            left = int(path.rsplit("/", 1)[1])
            return ServerResponse.redirect(
                "/merhaba" if left == 0 else f"/yonlendir/{left - 1}", 302
            )
        if path == "/dongu":
            return ServerResponse.redirect("/dongu", 302)
        if path in ("/303", "/307"):
            return ServerResponse.redirect("/yanki", int(path[1:]))
        if path == "/dis-kaynak":
            return ServerResponse.redirect(f"http://{HOST}:{other_port()}/yanki", 302)
        if path == "/yanki":
            body = (await request.read()).decode()
            info = {
                "method": request.method,
                "body": body,
                "port": request.client and request.client[1],
            }
            for name in ("authorization", "cookie", "content-type"):
                info[name] = request.headers.get(name)
            return ServerResponse.json(info)
        if path == "/parcali":

            async def parts() -> AsyncIterator[bytes]:
                for index in range(5):
                    yield f"parça-{index};".encode()
                    await asyncio.sleep(0)

            return ServerResponse(200, Headers(), parts())
        if path in ("/gzip", "/deflate", "/ham-deflate", "/bomba"):
            text = "sıkıştırılmış içerik " * 100
            data = {
                "/gzip": gzip.compress(text.encode()),
                "/deflate": zlib.compress(text.encode()),
                "/ham-deflate": zlib.compress(text.encode())[2:-4],
                "/bomba": BOMB,
            }[path]
            encoding = "gzip" if path in ("/gzip", "/bomba") else "deflate"
            return ServerResponse(200, Headers([("Content-Encoding", encoding)]), data)
        if path == "/yavas":
            await asyncio.sleep(1)
            return ServerResponse.text("geç kaldım")
        if path == "/cerez-ver":
            response = ServerResponse.text("çerezler verildi")
            response.headers.add("Set-Cookie", "oturum=abc123; Path=/; HttpOnly")
            response.headers.add("Set-Cookie", "tema=koyu; Path=/ayarlar")
            return response
        if path == "/kararsiz":
            state["kararsiz"] = state.get("kararsiz", 0) + 1
            if state["kararsiz"] < 3:
                return ServerResponse(503, Headers([("Retry-After", "0")]), b"yogun")
            return ServerResponse.text("sonunda")
        return ServerResponse.error(404)

    return app


@pytest.fixture
def servers(loop_thread: BackgroundLoop) -> Iterator[tuple[HttpServer, HttpServer]]:
    state: dict[str, int] = {}
    holder: list[HttpServer] = []
    main = HttpServer(make_app(state, lambda: holder[0].port))  # type: ignore[arg-type]
    other = HttpServer(make_app(state, lambda: main.port))  # type: ignore[arg-type]
    holder.append(other)
    for server in (main, other):
        loop_thread.run(server.start())
    yield main, other
    for server in (main, other):
        loop_thread.run(server.close(grace=1))


def base(server: HttpServer) -> str:
    return f"http://{HOST}:{server.port}"


def test_get_ve_baglanti_havuzu(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client() as client:
        assert client.get(base(main) + "/merhaba").text() == "merhaba dünya"
        ports = {client.get(base(main) + "/yanki").json()["port"] for _ in range(4)}
        assert len(ports) == 1  # hep aynı bağlantı
        assert client.pool.created == 1


def test_yonlendirmeler(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client(max_redirects=5) as client:
        response = client.get(base(main) + "/yonlendir/3")
        assert response.text() == "merhaba dünya"
        assert [r.status for r in response.history] == [302, 302, 302, 302]
        assert str(response.url).endswith("/merhaba")
        with pytest.raises(TooManyRedirectsError):
            client.get(base(main) + "/dongu")
        moved = client.post(base(main) + "/303", body=b"form")
        assert (moved.json()["method"], moved.json()["body"]) == ("GET", "")
        kept = client.post(base(main) + "/307", body="aynı gövde".encode())
        assert (kept.json()["method"], kept.json()["body"]) == ("POST", "aynı gövde")


def test_baska_kokene_kimlik_bilgisi_tasinmaz(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client() as client:
        same = client.get(base(main) + "/yanki", headers={"Authorization": "Bearer gizli"})
        assert same.json()["authorization"] == "Bearer gizli"
        moved = client.get(base(main) + "/dis-kaynak", headers={"Authorization": "Bearer gizli"})
        assert moved.json()["authorization"] is None


def test_parcali_ve_sikistirilmis_yanitlar(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    expected = "sıkıştırılmış içerik " * 100
    with Client() as client:
        assert client.get(base(main) + "/parcali").text() == "".join(
            f"parça-{i};" for i in range(5)
        )
        for path in ("/gzip", "/deflate", "/ham-deflate"):
            assert client.get(base(main) + path).text() == expected
        streamed = client.get(base(main) + "/parcali", stream=True)
        pieces = list(streamed.iter_bytes(4))
        assert len(pieces) > 1
        assert b"".join(pieces).decode().startswith("parça-0;")


def test_sikistirma_bombasi_ve_govde_siniri(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client(max_decompressed=1024 * 1024) as client, pytest.raises(ResponseTooLargeError):
        client.get(base(main) + "/bomba")
    with Client(max_body=10) as client, pytest.raises(ResponseTooLargeError):
        client.get(base(main) + "/merhaba")


def test_zaman_asimi(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client(timeout=0.2, retry=Retry(total=0)) as client, pytest.raises(RequestTimeoutError):
        client.get(base(main) + "/yavas")


def test_yeniden_deneme_retry_after_ile(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    sleeps: list[float] = []
    with Client(sleep=sleeps.append) as client:
        assert client.get(base(main) + "/kararsiz").text() == "sonunda"
    assert sleeps == [0.0, 0.0]  # Retry-After: 0 → beklemeden ama sayılarak


def test_post_yeniden_denenmez(loop_thread: BackgroundLoop) -> None:
    sleeps: list[float] = []
    with socket.socket() as probe:
        probe.bind((HOST, 0))
        port = probe.getsockname()[1]  # kapalı kapı
    with Client(sleep=sleeps.append) as client:
        with pytest.raises(ConnectError):
            client.post(f"http://{HOST}:{port}/", body=b"x")
        assert sleeps == []
        with pytest.raises(ConnectError):
            client.get(f"http://{HOST}:{port}/")
        assert sleeps == [0.2, 0.4]  # üstel geri çekilme


def test_cerez_kavanozu_ile_oturum(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client() as client:
        client.get(base(main) + "/cerez-ver")
        assert client.get(base(main) + "/yanki").json()["cookie"] == "oturum=abc123"
        assert len(client.cookies) == 2


def test_bayat_baglanti_fark_edilir(loop_thread: BackgroundLoop) -> None:
    # type: ignore[arg-type]
    server = HttpServer(make_app({}, lambda: 0), limits=Limits(keepalive_timeout=0.1))
    loop_thread.run(server.start())
    try:
        with Client() as client:
            assert client.get(base(server) + "/merhaba").status == 200
            threading.Event().wait(0.4)  # sunucu boştaki bağlantıyı kapatsın
            assert client.get(base(server) + "/merhaba").status == 200
            assert client.pool.created == 2
    finally:
        loop_thread.run(server.close(grace=1))


def test_kapanis_yarisinda_taze_baglantiyla_yeniden_dener() -> None:
    """Sunucu havuzdaki bağlantıyı tam istek sırasında kapatırsa (POST bile) bir kez yeniden
    denenir.
    """
    listener = socket.create_server((HOST, 0))
    port = listener.getsockname()[1]

    def run() -> None:
        first, _ = listener.accept()
        recv_until(first, b"\r\n\r\n")
        first.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok")
        recv_until(first, b"\r\n\r\n")
        first.close()  # ikinci isteği okuyup yanıtsız kapat
        second, _ = listener.accept()
        recv_until(second, b"\r\n\r\n")
        second.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 6\r\nConnection: close\r\n\r\ntekrar")
        second.close()

    thread = threading.Thread(target=run)
    thread.start()
    try:
        with Client() as client:
            assert client.get(f"http://{HOST}:{port}/").text() == "ok"
            assert client.post(f"http://{HOST}:{port}/", body=b"").text() == "tekrar"
    finally:
        thread.join(5)
        listener.close()


def test_stdlib_http_server_karsisinda(tmp_path: Path) -> None:
    (tmp_path / "dosya.txt").write_text("stdlib sunucusundan merhaba", encoding="utf-8")
    handler = functools.partial(SimpleHTTPRequestHandler, directory=str(tmp_path))
    handler.log_message = lambda *args: None  # type: ignore[method-assign]
    server = ThreadingHTTPServer((HOST, 0), handler)
    thread = threading.Thread(target=server.serve_forever, kwargs={"poll_interval": 0.05})
    thread.start()
    try:
        with Client() as client:
            url = f"http://{HOST}:{server.server_address[1]}"
            assert client.get(url + "/dosya.txt").text() == "stdlib sunucusundan merhaba"
            assert client.get(url + "/yok.txt").status == 404
            assert client.head(url + "/dosya.txt").read() == b""
    finally:
        server.shutdown()
        server.server_close()
        thread.join(5)


def test_tls_dogrulamasi_ve_inis_engeli(loop_thread: BackgroundLoop, tmp_path: Path) -> None:
    cert, key = make_self_signed_cert(tmp_path)
    plain = HttpServer(make_app({}, lambda: 0))  # type: ignore[arg-type]
    loop_thread.run(plain.start())

    async def secure_app(request: Request) -> ServerResponse:
        if request.path == "/inis":
            return ServerResponse.redirect(f"http://{HOST}:{plain.port}/merhaba", 302)
        return ServerResponse.text("güvenli merhaba")

    secure = HttpServer(secure_app, ssl_context=server_tls_context(cert, key))
    loop_thread.run(secure.start())
    try:
        with Client(ssl_context=tls_context(str(cert))) as client:
            assert client.get(f"https://{HOST}:{secure.port}/").text() == "güvenli merhaba"
            with pytest.raises(InsecureRedirectError):
                client.get(f"https://{HOST}:{secure.port}/inis")
        with Client() as client, pytest.raises(ConnectError, match="sertifika"):
            client.get(f"https://{HOST}:{secure.port}/")
    finally:
        loop_thread.run(secure.close(grace=1))
        loop_thread.run(plain.close(grace=1))


def parse_raw(data: bytes, method: str = "GET") -> Response:
    """Ham yanıt baytlarını gerçek bir soket çifti üzerinden ayrıştırır."""
    ours, theirs = socket.socketpair()
    theirs.sendall(data)
    theirs.close()
    conn = Connection.from_socket(ours, parse_url("http://ornek.test/"))
    try:
        version, status, reason, headers = conn.read_head()
        response = Response(
            method,
            parse_url("http://ornek.test/"),
            version,
            status,
            reason,
            headers,
            conn,
            lambda c, ok: c.close(),
            1 << 20,
            1 << 20,
        )
        response.read()
        return response
    finally:
        conn.close()


def test_ham_yanit_cesitleri() -> None:
    interim = b"HTTP/1.1 100 Continue\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nok"
    assert parse_raw(interim).read() == b"ok"
    until_close = b"HTTP/1.0 200 OK\r\n\r\nkapanana kadar"
    assert parse_raw(until_close).read() == b"kapanana kadar"
    trailers = (
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nab\r\n0\r\nX-Son: 1\r\n\r\n"
    )
    assert parse_raw(trailers).read() == b"ab"
    assert parse_raw(b"HTTP/1.1 204 No Content\r\nContent-Length: 5\r\n\r\n").read() == b""
    assert parse_raw(b"HTTP/1.1 200 OK\r\nContent-Length: 3\r\n\r\nabc", "HEAD").read() == b""


@pytest.mark.parametrize(
    "data",
    [
        b"ICY 200 OK\r\n\r\n",
        b"HTTP/1.1 2000 OK\r\n\r\n",
        b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Length: 3\r\n\r\nabc",
        b"HTTP/1.1 200 OK\r\nContent-Length: +3\r\n\r\nabc",
        b"HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nabc",
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0x2\r\nab\r\n0\r\n\r\n",
        b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nabXX0\r\n\r\n",
        b"HTTP/1.1 200 OK\r\nBozuk Baslik\r\n\r\n",
        b"HTTP/1.1 200 OK\r\nContent-Encoding: gzip\r\nContent-Length: 4\r\n\r\nbozk",
    ],
)
def test_bozuk_yanitlar(data: bytes) -> None:
    with pytest.raises(ProtocolViolationError):
        parse_raw(data)


@given(st.binary(max_size=200))
def test_rastgele_yanit_istemciyi_cokertmez(data: bytes) -> None:
    with contextlib.suppress(HttpClientError):
        parse_raw(b"HTTP/1.1 200 OK\r\n" + data)


def test_json_ve_form_govdesi(servers: tuple[HttpServer, HttpServer]) -> None:
    main, _ = servers
    with Client() as client:
        sent = client.post(base(main) + "/yanki", json={"ad": "Ayşe"}).json()
        assert json.loads(sent["body"]) == {"ad": "Ayşe"}
        assert sent["content-type"] == "application/json"
        form = client.post(base(main) + "/yanki", data={"ad": "Ayşe", "not": "a&b"}).json()
        assert form["body"] == "ad=Ay%C5%9Fe&not=a%26b"
