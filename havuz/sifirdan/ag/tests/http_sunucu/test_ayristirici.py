"""Ayrıştırıcı ve gövde okuyucu birim testleri (soketsiz): sıkı kurallar, sınırlar, rastgele
bayt.
"""

from __future__ import annotations

import asyncio
import contextlib

import pytest
from hypothesis import given
from hypothesis import strategies as st

from http_sunucu.body import BodyReader
from http_sunucu.headers import Headers
from http_sunucu.parser import (
    HttpError,
    Limits,
    PeerClosedError,
    body_framing,
    parse_request_line,
    read_head,
    split_target,
    validate_host,
)


def _reader(data: bytes, limits: Limits) -> asyncio.StreamReader:
    reader = asyncio.StreamReader(limit=limits.max_line + 2)
    reader.feed_data(data)
    reader.feed_eof()
    return reader


def parse_head(data: bytes, limits: Limits | None = None) -> tuple[bytes, Headers]:
    chosen = limits or Limits()

    async def run() -> tuple[bytes, Headers]:
        return await read_head(_reader(data, chosen), chosen)

    return asyncio.run(run())


def read_body(data: bytes, framing: str, length: int = 0, limits: Limits | None = None) -> bytes:
    chosen = limits or Limits()

    async def run() -> bytes:
        return await BodyReader(_reader(data, chosen), framing, length, chosen).read_all()

    return asyncio.run(run())


def status_of(error: pytest.ExceptionInfo[HttpError]) -> int:
    return error.value.status


def test_gecerli_baslik_okunur() -> None:
    line, headers = parse_head(b"GET /a?b=1 HTTP/1.1\r\nHost: ornek\r\nX-Liste: a, b\r\n\r\n")
    assert line == b"GET /a?b=1 HTTP/1.1"
    assert headers.get("HOST") == "ornek"
    assert headers.has_token("x-liste", "B")


def test_ondeki_bos_satirlar_atlanir() -> None:
    line, _ = parse_head(b"\r\n\r\nGET / HTTP/1.1\r\nHost: x\r\n\r\n")
    assert line == b"GET / HTTP/1.1"


@pytest.mark.parametrize(
    ("data", "status"),
    [
        (b"GET / HTTP/1.1\nHost: x\n\n", 400),  # çıplak LF
        (b"GET / HTTP/1.1\r\nHost: x\rY: z\r\n\r\n", 400),  # çıplak CR
        (b"GET / HTTP/1.1\r\nHost : x\r\n\r\n", 400),  # adla ':' arasında boşluk
        (b"GET / HTTP/1.1\r\nHost: x\r\nX-A: 1\r\n devam\r\n\r\n", 400),  # obs-fold
        (b"GET / HTTP/1.1\r\nX\x00Y: 1\r\n\r\n", 400),
        (b"GET / HTTP/1.1\r\nX: a\x00b\r\n\r\n", 400),
        (b"GET / HTTP/1.1\r\nBaslikSatiri\r\n\r\n", 400),
        (b"GET / HTTP/1.1\r\nHost: x\r\n", 400),  # başlıklar yarıda kesildi
    ],
)
def test_bozuk_basliklar_reddedilir(data: bytes, status: int) -> None:
    with pytest.raises(HttpError) as info:
        parse_head(data)
    assert status_of(info) == status


def test_bos_baglanti_peer_closed() -> None:
    with pytest.raises(PeerClosedError):
        parse_head(b"")


def test_satir_ve_baslik_sinirlari() -> None:
    limits = Limits(max_line=64, max_headers=3, max_head_bytes=200)
    with pytest.raises(HttpError) as info:
        parse_head(b"GET /" + b"a" * 100 + b" HTTP/1.1\r\n\r\n", limits)
    assert status_of(info) == 414
    with pytest.raises(HttpError) as info:
        parse_head(b"GET / HTTP/1.1\r\nX: " + b"a" * 100 + b"\r\n\r\n", limits)
    assert status_of(info) == 431
    many = b"".join(b"X%d: 1\r\n" % i for i in range(5))
    with pytest.raises(HttpError) as info:
        parse_head(b"GET / HTTP/1.1\r\n" + many + b"\r\n", limits)
    assert status_of(info) == 431


@pytest.mark.parametrize(
    ("line", "status"),
    [
        (b"GET / HTTP/2.0", 505),
        (b"GET / HTTPS/1.1", 400),
        (b"GET  / HTTP/1.1", 400),
        (b"GET / HTTP/1.1 fazla", 400),
        (b"G(T / HTTP/1.1", 400),
        (b"GET /a#parca HTTP/1.1", 400),
        (b"GET /\xc3\xa7 HTTP/1.1", 400),
    ],
)
def test_istek_satiri_reddi(line: bytes, status: int) -> None:
    with pytest.raises(HttpError) as info:
        parse_request_line(line)
    assert status_of(info) == status


def test_hedef_bicimleri() -> None:
    assert split_target("GET", "/a/b?c=1") == ("/a/b", "c=1", None)
    assert split_target("GET", "http://ornek:81/yol?x") == ("/yol", "x", "ornek:81")
    assert split_target("GET", "http://ornek?x=1") == ("/", "x=1", "ornek")
    assert split_target("OPTIONS", "*") == ("*", "", None)
    for method, target in (("GET", "*"), ("GET", "yol")):
        with pytest.raises(HttpError):
            split_target(method, target)


def test_host_denetimi() -> None:
    assert validate_host("HTTP/1.1", Headers([("Host", "ornek:8080")]), None) == "ornek:8080"
    assert validate_host("HTTP/1.0", Headers(), None) == ""
    for headers in (Headers(), Headers([("Host", "a"), ("Host", "b")]), Headers([("Host", "a b")])):
        with pytest.raises(HttpError):
            validate_host("HTTP/1.1", headers, None)
    with pytest.raises(HttpError):
        validate_host("HTTP/1.1", Headers([("Host", "x")]), "kullanici@kotu")


@pytest.mark.parametrize(
    ("headers", "expected"),
    [
        ([], ("none", 0)),
        ([("Content-Length", "12")], ("length", 12)),
        ([("Transfer-Encoding", "Chunked")], ("chunked", 0)),
    ],
)
def test_govde_cercevesi(headers: list[tuple[str, str]], expected: tuple[str, int]) -> None:
    assert body_framing("HTTP/1.1", Headers(headers)) == expected


@pytest.mark.parametrize(
    ("headers", "status"),
    [
        ([("Content-Length", "4"), ("Transfer-Encoding", "chunked")], 400),
        ([("Content-Length", "4"), ("Content-Length", "5")], 400),
        ([("Content-Length", "4"), ("Content-Length", "4")], 400),
        ([("Content-Length", "4, 5")], 400),
        ([("Content-Length", "+4")], 400),
        ([("Content-Length", "0x4")], 400),
        ([("Content-Length", "4_0")], 400),
        ([("Content-Length", "٤".encode().decode("latin-1"))], 400),  # tel üstündeki UTF-8 '٤'
        ([("Content-Length", "1" * 19)], 400),
        ([("Transfer-Encoding", "chunked, chunked")], 400),
        ([("Transfer-Encoding", "chunked"), ("Transfer-Encoding", "identity")], 400),
        ([("Transfer-Encoding", "gzip")], 501),
        ([("Transfer-Encoding", "xchunked")], 501),
    ],
)
def test_kacakcilik_cerceveleri_reddedilir(headers: list[tuple[str, str]], status: int) -> None:
    with pytest.raises(HttpError) as info:
        body_framing("HTTP/1.1", Headers(headers))
    assert status_of(info) == status


def test_int_neden_tek_basina_yetmez() -> None:
    """Python'un int()'i bunların hepsini kabul eder; bu yüzden önce sıkı düzenli ifade
    denetlenir.
    """
    assert [int(x) for x in ("+4", " 4 ", "4_0", "٤")] == [4, 4, 40, 4]
    assert int("0x1a", 16) == 26


def test_http10_transfer_encoding_reddedilir() -> None:
    with pytest.raises(HttpError):
        body_framing("HTTP/1.0", Headers([("Transfer-Encoding", "chunked")]))


def test_parcali_govde_uzanti_ve_son_basliklar() -> None:
    data = b"5;ad=deger\r\nmerha\r\n3\r\nba!\r\n0\r\nX-Ozet: abc\r\n\r\n"
    limits = Limits()

    async def run() -> tuple[bytes, Headers]:
        body = BodyReader(_reader(data, limits), "chunked", 0, limits)
        return await body.read_all(), body.trailers

    payload, trailers = asyncio.run(run())
    assert payload == b"merhaba!"
    assert trailers.get("x-ozet") == "abc"


@pytest.mark.parametrize(
    "data",
    [
        b"0x5\r\nhello\r\n0\r\n\r\n",
        b"+5\r\nhello\r\n0\r\n\r\n",
        b" 5\r\nhello\r\n0\r\n\r\n",
        b"5 \r\nhello\r\n0\r\n\r\n",
        b"1_0\r\n" + b"a" * 16 + b"\r\n0\r\n\r\n",
        b"5\r\nhelloXX0\r\n\r\n",  # veriden sonra CRLF yok
        b"5\nhello\r\n0\r\n\r\n",  # çıplak LF
        b"5;a=\x01\r\nhello\r\n0\r\n\r\n",
        b"5\r\nhel",  # yarıda kesildi
        b"12345678901234567\r\n",  # 16 haneden uzun boyut
    ],
)
def test_bozuk_parcali_govde(data: bytes) -> None:
    with pytest.raises(HttpError) as info:
        read_body(data, "chunked")
    assert status_of(info) == 400


def test_govde_siniri_413() -> None:
    limits = Limits(max_body=10)
    with pytest.raises(HttpError) as info:
        read_body(b"8\r\n12345678\r\n8\r\n12345678\r\n0\r\n\r\n", "chunked", limits=limits)
    assert status_of(info) == 413
    with pytest.raises(HttpError) as info:
        read_body(b"x" * 20, "length", 20, limits)
    assert status_of(info) == 413


def test_eksik_content_length_govdesi() -> None:
    with pytest.raises(HttpError) as info:
        read_body(b"abc", "length", 10)
    assert status_of(info) == 400


@given(st.lists(st.binary(min_size=1, max_size=40), max_size=6))
def test_parcali_kodlama_gidis_donus(chunks: list[bytes]) -> None:
    encoded = b"".join(b"%x\r\n%b\r\n" % (len(c), c) for c in chunks) + b"0\r\n\r\n"
    assert read_body(encoded, "chunked") == b"".join(chunks)


@given(st.binary(max_size=300))
def test_rastgele_bayt_baslik_ayristiriciyi_cokertmez(data: bytes) -> None:
    with contextlib.suppress(HttpError, PeerClosedError):
        parse_head(data, Limits(max_line=128, max_headers=8))


@given(st.binary(max_size=200))
def test_rastgele_bayt_parcali_okuyucuyu_cokertmez(data: bytes) -> None:
    with contextlib.suppress(HttpError):
        read_body(data, "chunked", limits=Limits(max_line=64, max_body=1000))


def test_basliklar_yanit_bolmeyi_engeller() -> None:
    headers = Headers()
    for bad in ("a\r\nSet-Cookie: x=1", "a\nb", "a\x00b"):
        with pytest.raises(ValueError, match="denetim"):
            headers.add("Location", bad)
    with pytest.raises(ValueError, match="Latin-1"):
        headers.add("X-Ad", "Şükrü")
    with pytest.raises(ValueError, match="başlık adı"):
        headers.add("Kötü Ad", "x")


def test_baslik_listesi_islemleri() -> None:
    headers = Headers([("Set-Cookie", "a=1"), ("set-cookie", "b=2"), ("X", "1")])
    assert headers.get_all("SET-COOKIE") == ["a=1", "b=2"]
    headers.set("x", "2")
    assert headers.get("X") == "2"
    headers.remove("set-cookie")
    assert "Set-Cookie" not in headers
    headers.setdefault("X", "3")
    assert headers.items() == [("x", "2")]
