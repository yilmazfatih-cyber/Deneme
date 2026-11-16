"""Durağan dosya sunumu: türler, ETag/304, aralıklar, dizin yönlendirmesi ve yol geçişi
denemeleri.
"""

from __future__ import annotations

import http.client
from collections.abc import Callable
from email.utils import formatdate
from pathlib import Path

import pytest

from destek import HOST, raw_exchange
from http_sunucu import HttpServer, StaticFiles
from http_sunucu.static import content_type, etag_matches, parse_range

ServeFn = Callable[..., HttpServer]
TEXT = "merhaba dünya\n" * 50


@pytest.fixture
def site(tmp_path: Path) -> Path:
    root = tmp_path / "kok"
    (root / "alt").mkdir(parents=True)
    (root / "metin.txt").write_text(TEXT, encoding="utf-8")
    (root / "index.html").write_text("<h1>Ana sayfa</h1>", encoding="utf-8")
    (root / "alt" / "index.html").write_text("<h1>Alt</h1>", encoding="utf-8")
    (root / "boşluklu ad.txt").write_text("türkçe ad", encoding="utf-8")
    (root / ".env").write_text("PAROLA=gizli", encoding="utf-8")
    (tmp_path / "disari.txt").write_text("KÖK DIŞI GİZLİ", encoding="utf-8")
    (root / "bag").symlink_to(tmp_path / "disari.txt")
    return root


def fetch(
    port: int, path: str, method: str = "GET", headers: dict[str, str] | None = None
) -> tuple[int, dict[str, str], bytes]:
    conn = http.client.HTTPConnection(HOST, port, timeout=5)
    try:
        conn.request(method, path, headers=headers or {})
        response = conn.getresponse()
        return response.status, dict(response.getheaders()), response.read()
    finally:
        conn.close()


def test_dosya_turu_ve_on_bellek_basliklari(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    status, headers, body = fetch(port, "/metin.txt")
    assert status == 200
    assert body.decode() == TEXT
    assert headers["Content-Type"] == "text/plain; charset=utf-8"
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["Accept-Ranges"] == "bytes"
    head_status, head_headers, head_body = fetch(port, "/metin.txt", "HEAD")
    assert (head_status, head_body) == (200, b"")
    assert head_headers["Content-Length"] == str(len(TEXT.encode()))
    assert fetch(port, "/bo%C5%9Fluklu%20ad.txt")[2].decode() == "türkçe ad"


def test_etag_ve_degisiklik_tarihiyle_304(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    _, headers, _ = fetch(port, "/metin.txt")
    etag = headers["ETag"]
    assert fetch(port, "/metin.txt", headers={"If-None-Match": etag})[0] == 304
    assert fetch(port, "/metin.txt", headers={"If-None-Match": f'"baska", W/{etag}'})[0] == 304
    assert fetch(port, "/metin.txt", headers={"If-None-Match": '"baska"'})[0] == 200
    future = formatdate(4102444800, usegmt=True)  # 2100 yılı
    assert fetch(port, "/metin.txt", headers={"If-Modified-Since": future})[0] == 304
    past = formatdate(0, usegmt=True)
    assert fetch(port, "/metin.txt", headers={"If-Modified-Since": past})[0] == 200
    assert fetch(port, "/metin.txt", headers={"If-Modified-Since": "bozuk tarih"})[0] == 200


def test_aralik_istekleri(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    size = len(TEXT.encode())
    status, headers, body = fetch(port, "/metin.txt", headers={"Range": "bytes=0-6"})
    assert (status, body) == (206, b"merhaba")
    assert headers["Content-Range"] == f"bytes 0-6/{size}"
    status, _, body = fetch(port, "/metin.txt", headers={"Range": "bytes=-3"})
    assert (status, body) == (206, b"ya\n")
    status, _, body = fetch(port, "/metin.txt", headers={"Range": f"bytes={size - 2}-"})
    assert (status, body) == (206, b"a\n")
    status, headers, _ = fetch(port, "/metin.txt", headers={"Range": f"bytes={size}-"})
    assert status == 416
    assert headers["Content-Range"] == f"bytes */{size}"
    assert fetch(port, "/metin.txt", headers={"Range": "bytes=0-1,4-5"})[0] == 200
    _, headers, _ = fetch(port, "/metin.txt")
    if_range = {"Range": "bytes=0-6", "If-Range": headers["ETag"]}
    assert fetch(port, "/metin.txt", headers=if_range)[0] == 206
    stale = {"Range": "bytes=0-6", "If-Range": '"eski"'}
    assert fetch(port, "/metin.txt", headers=stale)[0] == 200


def test_dizin_yonlendirmesi_ve_dizin_sayfasi(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    status, headers, _ = fetch(port, "/alt?x=1")
    assert (status, headers["Location"]) == (301, "/alt/?x=1")
    assert fetch(port, "/alt/")[2] == b"<h1>Alt</h1>"
    assert fetch(port, "/")[2] == b"<h1>Ana sayfa</h1>"


@pytest.mark.parametrize(
    "path",
    [
        "/../disari.txt",
        "/%2e%2e/disari.txt",
        "/%2E%2E/disari.txt",
        "/..%2fdisari.txt",
        "/%2e%2e%2fdisari.txt",
        "/alt/%2e%2e/%2e%2e/disari.txt",
        "/%5c..%5cdisari.txt",
        "/alt/..%5c..%5cdisari.txt",
        "/.env",
        "/%2eenv",
        "/bag",  # kök dışını gösteren sembolik bağ
        "/metin.txt%00.html",
        "/%ff%fe",
        "/yok.txt",
    ],
)
def test_yol_gecisi_ve_gizli_dosyalar_404(serve: ServeFn, site: Path, path: str) -> None:
    port = serve(StaticFiles(site)).port
    status, _, body = fetch(port, path)
    assert status == 404
    assert "GİZLİ" not in body.decode()
    assert b"PAROLA" not in body


def test_ham_soketle_yol_gecisi(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    data = raw_exchange(
        port, b"GET /../../disari.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"
    )
    assert data.startswith(b"HTTP/1.1 404")


def test_yalniz_get_ve_head(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site)).port
    status, headers, _ = fetch(port, "/metin.txt", "POST")
    assert (status, headers["Allow"]) == (405, "GET, HEAD")


def test_onek_altinda_yayin(serve: ServeFn, site: Path) -> None:
    port = serve(StaticFiles(site, prefix="/statik")).port
    assert fetch(port, "/statik/metin.txt")[0] == 200
    assert fetch(port, "/metin.txt")[0] == 404
    assert fetch(port, "/statik")[1]["Location"] == "/statik/"


@pytest.mark.parametrize(
    ("header", "expected"),
    [
        ("bytes=0-9", (0, 9)),
        ("bytes=5-", (5, 99)),
        ("bytes=-10", (90, 99)),
        ("bytes=-500", (0, 99)),
        ("bytes=90-500", (90, 99)),
        ("bytes=100-", "unsatisfiable"),
        ("bytes=150-200", "unsatisfiable"),
        ("bytes=-0", "unsatisfiable"),
        ("bytes=9-5", None),
        ("bytes=a-5", None),
        ("bytes=+1-5", None),
        ("items=0-5", None),
        ("bytes=0-1,3-4", None),
    ],
)
def test_aralik_ayristirici(header: str, expected: object) -> None:
    assert parse_range(header, 100) == expected


def test_yardimcilar() -> None:
    assert content_type("a.json") == "application/json; charset=utf-8"
    assert content_type("a.png") == "image/png"
    assert content_type("bilinmeyen.uzanti") == "application/octet-stream"
    assert etag_matches("*", '"a"')
    assert etag_matches('W/"a"', '"a"')
    assert not etag_matches('"b"', '"a"')
