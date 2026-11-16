"""Yönlendirme, istek ayrıştırma (sorgu, form, çok parçalı, JSON, çerez), hata sayfaları, durağan
dosyalar.
"""

from __future__ import annotations

import contextlib
from pathlib import Path

import pytest
from hypothesis import given
from hypothesis import strategies as st
from web_demo import KEY, csrf, make_app

from http_sunucu.headers import Headers
from web_catisi import App, Request
from web_catisi.multipart import MultipartError, parse_multipart, safe_filename
from web_catisi.routing import MethodNotAllowedError, NotFoundError, Router
from web_catisi.testing import TestClient, encode_multipart


def test_yol_desenleri_ve_ters_cevirme() -> None:
    router = Router()
    router.add("/kullanici/<int:id>", lambda r, id: None, name="kullanici")
    router.add("/blog/<slug:baslik>", lambda r, baslik: None, name="blog")
    router.add("/dosya/<path:yol>", lambda r, yol: None, ("GET", "POST"), name="dosya")
    assert router.match("GET", "/kullanici/42")[1] == {"id": 42}
    assert router.match("HEAD", "/kullanici/42")[1] == {"id": 42}  # GET → HEAD da
    assert router.match("POST", "/dosya/a/b c.txt")[1] == {"yol": "a/b c.txt"}
    with pytest.raises(NotFoundError):
        router.match("GET", "/kullanici/abc")
    with pytest.raises(NotFoundError):
        router.match("GET", "/kullanici/" + "9" * 19)  # dev sayı: 404, çökme değil
    with pytest.raises(NotFoundError):
        router.match("GET", "/blog/Büyük-Harf")
    with pytest.raises(MethodNotAllowedError) as info:
        router.match("DELETE", "/kullanici/1")
    assert info.value.allowed == {"GET", "HEAD"}
    assert router.url_for("kullanici", id=7) == "/kullanici/7"
    assert router.url_for("dosya", yol="a b/ç?.txt") == "/dosya/a%20b/%C3%A7%3F.txt"
    with pytest.raises(ValueError, match="eksik"):
        router.url_for("kullanici")
    with pytest.raises(ValueError, match="Aynı adla"):
        router.add("/x", lambda r: None, name="blog")


def test_uygulama_yollari_ve_hata_sayfalari() -> None:
    client = TestClient(make_app())
    assert client.get("/").text == "ana sayfa"
    assert client.get("/kullanici/7").json() == {"id": 7}
    assert client.get("/dosya/klasör/ç.txt").json() == {"yol": "klasör/ç.txt"}
    missing = client.get("/olmayan")
    assert missing.status == 404
    assert "bulunamadı" in missing.text
    not_allowed = client.post("/kullanici/7", data={"_csrf": csrf(client)})
    assert (not_allowed.status, not_allowed.headers.get("allow")) == (405, "GET, HEAD")
    assert client.get("/yok").status == 404
    error = client.get("/hata")
    assert error.status == 500
    assert "gizli" not in error.text
    assert "Beklenmeyen" in error.text


def test_ozel_hata_sayfasi() -> None:
    app = make_app()

    @app.error_page(404)
    def not_found(request: Request, status: int) -> str:
        return "özel 404"

    response = TestClient(app).get("/olmayan")
    assert (response.status, response.text) == (404, "özel 404")


def test_sorgu_form_ve_json() -> None:
    client = TestClient(make_app())
    assert "Aranan: köprü" in client.get("/ara?q=k%C3%B6pr%C3%BC").text
    assert client.get("/ara?q=%FF").status == 400  # bozuk UTF-8
    token = csrf(client)
    sent = client.post("/form", data={"_csrf": token, "ad": "Ayşe", "not": "a&b=c"})
    assert sent.json() == {"_csrf": token, "ad": "Ayşe", "not": "a&b=c"}
    headers = {"X-CSRF-Token": token}
    assert client.post("/json", json={"şehir": "İzmir"}, headers=headers).json() == {
        "şehir": "İzmir"
    }
    bad = client.request("POST", "/json", data={"x": "1"}, headers=headers)
    assert bad.status == 415
    broken = client.post("/json", headers={**headers, "Content-Type": "application/json"})
    assert broken.status == 400


def test_cok_parcali_dosya_yukleme() -> None:
    client = TestClient(make_app())
    files = {"dosya": ("../../etc/passwd", "kök".encode(), "text/plain")}
    response = client.post("/yukle", data={"_csrf": csrf(client), "baslik": "Şubat"}, files=files)
    assert response.json() == {"ad": "passwd", "boyut": 4, "baslik": "Şubat"}


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\a\\rapor.pdf", "rapor.pdf"),
        (".htaccess", "htaccess"),
        ("a\x00b\nc.txt", "abc.txt"),
        ("", "dosya"),
        ("..", "dosya"),
    ],
)
def test_dosya_adi_temizleme(name: str, expected: str) -> None:
    assert safe_filename(name) == expected


@pytest.mark.parametrize(
    ("body", "content_type"),
    [
        (
            b"--a\r\nContent-Disposition: form-data\r\n\r\nx\r\n--a--",
            "multipart/form-data; boundary=a",
        ),
        (b"--a\r\nbozuk\r\n\r\nx\r\n--a--", "multipart/form-data; boundary=a"),
        (
            b"--a\r\nContent-Disposition: form-data; name=x\r\n\r\nx",
            "multipart/form-data; boundary=a",
        ),
        (b"sinir yok", "multipart/form-data; boundary=a"),
        (b"--a--", "multipart/form-data"),
        (b"--a--", "multipart/form-data; boundary=" + "a" * 71),
        (
            b'--a\r\nContent-Disposition: form-data; name="x"\r\n\r\n\xff\r\n--a--',
            "multipart/form-data; boundary=a",
        ),
    ],
)
def test_bozuk_cok_parcali(body: bytes, content_type: str) -> None:
    with pytest.raises(MultipartError):
        parse_multipart(body, content_type)


def test_parca_sayisi_siniri() -> None:
    body, kind = encode_multipart({f"a{i}": "x" for i in range(5)}, {})
    assert len(parse_multipart(body, kind)[0]) == 5
    with pytest.raises(MultipartError, match="fazla"):
        parse_multipart(body, kind, max_parts=3)


@given(st.binary(max_size=300))
def test_rastgele_cok_parcali_cokertmez(body: bytes) -> None:
    with contextlib.suppress(MultipartError):
        parse_multipart(b"--s\r\n" + body, "multipart/form-data; boundary=s")


def test_cerez_ayristirma_ilk_deger_kazanir() -> None:
    request = Request("GET", "/", headers=Headers([("Cookie", 'a=1; b="iki"; a=3; bozuk; =x')]))
    assert request.cookies == {"a": "1", "b": "iki"}


def test_durgun_dosyalar_ve_yol_gecisi(tmp_path: Path) -> None:
    folder = tmp_path / "statik"
    folder.mkdir()
    (folder / "stil.css").write_text("body{}", encoding="utf-8")
    (tmp_path / "gizli.txt").write_text("GİZLİ", encoding="utf-8")
    client = TestClient(make_app(static=folder))
    response = client.get("/statik/stil.css")
    assert (response.status, response.body) == (200, b"body{}")
    assert response.headers.get("content-type") == "text/css; charset=utf-8"
    again = client.get(
        "/statik/stil.css", headers={"If-None-Match": response.headers.get("etag") or ""}
    )
    assert again.status == 304
    for path in ("/statik/../gizli.txt", "/statik/%2e%2e/gizli.txt", "/statik/..%5cgizli.txt"):
        assert client.get(path).status == 404


def test_govde_siniri_ve_anahtar_uzunlugu() -> None:
    with pytest.raises(ValueError, match="32 bayt"):
        App([b"kisa"])
    assert make_app().max_body == 64 * 1024
    assert len(KEY) == 32
