"""Güvenlik testleri: XSS kaçışı, CSRF, imzalı oturum, oturum sabitleme, açık yönlendirme,
başlıklar, parola.
"""

from __future__ import annotations

import pytest
from web_demo import Clock, csrf, make_app

from web_catisi import (
    Markup,
    Response,
    SessionSigner,
    escape,
    hash_password,
    render,
    render_each,
    safe_redirect_target,
    safe_url,
    verify_password,
)
from web_catisi.testing import TestClient


def test_xss_kacisi() -> None:
    attack = "<script>alert(\"x\")</script>' onmouseover='kotu()"
    rendered = render('<p title="{v}">{v}</p>', v=attack)
    assert "<script>" not in rendered
    assert '"x"' not in rendered and "'kotu" not in rendered
    assert "&lt;script&gt;" in rendered
    assert render("{v}", v=Markup("<b>güvenli</b>")) == "<b>güvenli</b>"
    assert escape(escape("<")) == "&lt;"  # iki kez kaçışlanmaz
    assert (
        render_each("<li>{ad}</li>", [{"ad": "<i>"}, {"ad": "b"}]) == "<li>&lt;i&gt;</li><li>b</li>"
    )
    client = TestClient(make_app())
    page = client.get("/ara?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E").text
    assert "<script>" not in page


@pytest.mark.parametrize("template", ["{v.__class__}", "{v[0]}", "{0}", "{v.__init__.__globals__}"])
def test_bicim_dizgisiyle_nesneye_uzanilamaz(template: str) -> None:
    with pytest.raises((ValueError, IndexError)):
        render(template, v="x")


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("javascript:alert(1)", "#"),
        ("JaVaScRiPt:alert(1)", "#"),
        ("java\tscript:alert(1)", "#"),
        (" javascript:alert(1)", "#"),
        ("data:text/html,<script>", "#"),
        ("https://ornek.test/a", "https://ornek.test/a"),
        ("/notlar/7", "/notlar/7"),
        ("notlar?a=b:c", "notlar?a=b:c"),
        ("mailto:a@ornek.test", "mailto:a@ornek.test"),
    ],
)
def test_guvenli_baglanti(url: str, expected: str) -> None:
    assert safe_url(url) == expected


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("/notlar", "/notlar"),
        ("/notlar?x=1#a", "/notlar?x=1#a"),
        ("//kotu.site", "/"),
        ("/\\kotu.site", "/"),
        ("/\t/kotu.site", "/"),
        ("/%0a/kotu.site", "/%0a/kotu.site"),  # yüzde-kodlu kalır: tarayıcı yol sayar
        ("https://kotu.site", "/"),
        ("javascript:alert(1)", "/"),
        ("kotu.site", "/"),
        ("", "/"),
        (None, "/"),
    ],
)
def test_acik_yonlendirme_engellenir(target: str | None, expected: str) -> None:
    assert safe_redirect_target(target) == expected


def test_giris_sonrasi_yonlendirme_dis_siteye_gitmez() -> None:
    client = TestClient(make_app())
    response = client.post("/giris", data={"_csrf": csrf(client), "sonra": "//kotu.site/yakala"})
    assert response.location == "/"


def test_csrf_korumasi() -> None:
    client = TestClient(make_app())
    token = csrf(client)
    assert client.post("/form", data={"ad": "x"}).status == 403  # belirteç yok
    assert client.post("/form", data={"_csrf": "yanlis", "ad": "x"}).status == 403
    cross = {"Sec-Fetch-Site": "cross-site"}
    assert client.post("/form", data={"_csrf": token}, headers=cross).status == 403
    foreign = {"Origin": "https://kotu.site"}
    assert client.post("/form", data={"_csrf": token}, headers=foreign).status == 403
    same = {"Origin": "http://test.yerel"}
    assert client.post("/form", data={"_csrf": token}, headers=same).status == 200
    other = TestClient(make_app())  # başka oturumun belirteci işe yaramaz
    other.get("/form")
    assert other.post("/form", data={"_csrf": token}).status == 403


def test_imzali_oturum_kurcalama_sure_ve_anahtar_donusumu() -> None:
    clock = Clock()
    signer = SessionSigner([b"a" * 32], max_age=60, clock=clock)
    value = signer.sign({"uid": 7})
    assert signer.unsign(value) == {"uid": 7}
    payload, stamp, signature = value.split(".")
    forged = SessionSigner([b"b" * 32], clock=clock).sign({"uid": 1}).split(".")[0]
    assert signer.unsign(f"{forged}.{stamp}.{signature}") is None  # veri değişti
    assert signer.unsign(f"{payload}.{int(stamp) + 1000}.{signature}") is None  # süre uzatma
    assert signer.unsign(value + "x") is None
    assert signer.unsign("tamamen.bozuk") is None
    clock.now += 61
    assert signer.unsign(value) is None  # süresi doldu
    rotated = SessionSigner([b"c" * 32, b"a" * 32], max_age=120, clock=clock)
    assert rotated.unsign(value) == {"uid": 7}  # eski anahtar hâlâ doğrular
    assert SessionSigner([b"a" * 32], clock=clock).unsign(rotated.sign({"x": 1})) is None


def test_oturum_cerezi_guvenli_bayraklarla() -> None:
    client = TestClient(make_app())
    response = client.get("/form")
    cookie = response.headers.get("set-cookie") or ""
    assert "HttpOnly" in cookie and "SameSite=Lax" in cookie and "Path=/" in cookie
    secure_client = TestClient(make_app(), base_url="https://test.yerel")
    assert "Secure" in (secure_client.get("/form").headers.get("set-cookie") or "")


def test_oturum_sabitleme_engellenir() -> None:
    client = TestClient(make_app())
    token_before = csrf(client)
    planted = client.cookies["oturum"]  # saldırganın kurbana yerleştirdiği çerez
    client.post("/giris", data={"_csrf": token_before})
    assert client.cookies["oturum"] != planted
    assert client.get("/ben").json()["uid"] == 1
    attacker = TestClient(make_app())
    attacker.cookies["oturum"] = planted
    assert attacker.get("/ben").json()["uid"] is None  # eski çerez oturum açmış olmadı
    assert client.post("/form", data={"_csrf": token_before}).status == 403  # belirteç yenilendi


def test_flash_bir_kez_gosterilir() -> None:
    client = TestClient(make_app())
    client.post("/giris", data={"_csrf": csrf(client)})
    assert client.get("/ben").json()["flas"] == [["bilgi", "Hoş geldiniz!"]]
    assert client.get("/ben").json()["flas"] == []


def test_guvenlik_basliklari() -> None:
    headers = TestClient(make_app()).get("/").headers
    assert headers.get("x-content-type-options") == "nosniff"
    assert headers.get("x-frame-options") == "DENY"
    assert "frame-ancestors 'none'" in (headers.get("content-security-policy") or "")


def test_cerez_enjeksiyonu_reddedilir() -> None:
    response = Response()
    for value in ("a;b", "a b", 'a"b', "a\r\nSet-Cookie: x"):
        with pytest.raises(ValueError, match="Çerez"):
            response.set_cookie("ad", value)


def test_parola_ozeti() -> None:
    stored = hash_password("doğru parola 123", n=2**10)
    assert stored.startswith("scrypt$1024$8$1$")
    assert verify_password("doğru parola 123", stored)
    assert not verify_password("yanlış parola", stored)
    assert stored != hash_password("doğru parola 123", n=2**10)  # her seferinde yeni tuz
    for broken in ("", "md5$abc", "scrypt$x$8$1$aa$bb", "scrypt$1024$8$1$!!$!!"):
        assert not verify_password("p", broken)
