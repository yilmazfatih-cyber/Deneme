"""URL ayrıştırma, RFC 3986 §5.4 göreli adres örnekleri ve çerez kavanozu (RFC 6265) testleri."""

from __future__ import annotations

import contextlib
from urllib.parse import urljoin

import pytest
from hypothesis import given
from hypothesis import strategies as st

from http_istemci import CookieJar, InvalidUrlError, parse_url, resolve_reference
from http_istemci.cookies import default_path, domain_match, path_match
from http_istemci.url import remove_dot_segments

BASE = "http://a/b/c/d;p?q"
NORMAL = {
    "g:h": "g:h",
    "g": "http://a/b/c/g",
    "./g": "http://a/b/c/g",
    "g/": "http://a/b/c/g/",
    "/g": "http://a/g",
    "//g": "http://g",
    "?y": "http://a/b/c/d;p?y",
    "g?y": "http://a/b/c/g?y",
    "#s": "http://a/b/c/d;p?q#s",
    "g#s": "http://a/b/c/g#s",
    "g?y#s": "http://a/b/c/g?y#s",
    ";x": "http://a/b/c/;x",
    "g;x": "http://a/b/c/g;x",
    "g;x?y#s": "http://a/b/c/g;x?y#s",
    "": "http://a/b/c/d;p?q",
    ".": "http://a/b/c/",
    "./": "http://a/b/c/",
    "..": "http://a/b/",
    "../": "http://a/b/",
    "../g": "http://a/b/g",
    "../..": "http://a/",
    "../../": "http://a/",
    "../../g": "http://a/g",
}
ABNORMAL = {
    "../../../g": "http://a/g",
    "../../../../g": "http://a/g",
    "/./g": "http://a/g",
    "/../g": "http://a/g",
    "g.": "http://a/b/c/g.",
    ".g": "http://a/b/c/.g",
    "g..": "http://a/b/c/g..",
    "..g": "http://a/b/c/..g",
    "./../g": "http://a/b/g",
    "./g/.": "http://a/b/c/g/",
    "g/./h": "http://a/b/c/g/h",
    "g/../h": "http://a/b/c/h",
    "g;x=1/./y": "http://a/b/c/g;x=1/y",
    "g;x=1/../y": "http://a/b/c/y",
    "g?y/./x": "http://a/b/c/g?y/./x",
    "g?y/../x": "http://a/b/c/g?y/../x",
    "g#s/./x": "http://a/b/c/g#s/./x",
    "g#s/../x": "http://a/b/c/g#s/../x",
    "http:g": "http:g",
}


@pytest.mark.parametrize(("ref", "expected"), [*NORMAL.items(), *ABNORMAL.items()])
def test_rfc3986_ornekleri(ref: str, expected: str) -> None:
    assert resolve_reference(BASE, ref) == expected


@pytest.mark.parametrize(("ref", "expected"), NORMAL.items())
def test_normal_ornekler_urljoin_ile_ayni(ref: str, expected: str) -> None:
    assert urljoin(BASE, ref) == expected == resolve_reference(BASE, ref)


def test_nokta_parcalari() -> None:
    assert remove_dot_segments("/a/b/c/./../../g") == "/a/g"
    assert remove_dot_segments("mid/content=5/../6") == "mid/6"


def test_url_ayristirma() -> None:
    url = parse_url("HTTPS://Örnek.Test:8443/a b/ç?x=ğ&y=1#bölüm")
    assert url.scheme == "https"
    assert url.host == "xn--rnek-4qa.test"
    assert url.port == 8443
    assert url.path == "/a%20b/%C3%A7"
    assert url.query == "x=%C4%9F&y=1"
    assert url.target == "/a%20b/%C3%A7?x=%C4%9F&y=1"
    assert url.host_header == "xn--rnek-4qa.test:8443"
    ipv6 = parse_url("http://[::1]:8080")
    assert (ipv6.host, ipv6.port, ipv6.path, ipv6.host_header) == ("::1", 8080, "/", "[::1]:8080")
    assert parse_url("http://ornek.test?q=1").target == "/?q=1"
    assert str(parse_url("http://ornek.test:80/a")) == "http://ornek.test/a"
    assert parse_url("http://a/%C3%A7").path == "/%C3%A7"  # var olan yüzde-kodlar korunur


@pytest.mark.parametrize(
    "bad",
    [
        "ftp://ornek.test/",
        "ornek.test/yol",
        "http://kullanici:parola@ornek.test/",
        "https://banka.com@kotu.site/",
        "http://ornek.test/a\r\nX-Enjeksiyon: 1",
        "http://ornek.test:0/",
        "http://ornek.test:70000/",
        "http://ornek.test:8a/",
        "http://[::1/",
        "http://[zz::1]/",
        "http://kötü ad/",
        "http:///yol",
    ],
)
def test_gecersiz_adresler(bad: str) -> None:
    with pytest.raises(InvalidUrlError):
        parse_url(bad)


@given(st.text(max_size=60))
def test_rastgele_adres_cokertmez(text: str) -> None:
    with contextlib.suppress(InvalidUrlError):
        parse_url(text)


@given(st.text(alphabet="ab./?#;=g:", max_size=20))
def test_cozumleme_her_zaman_dizgi_doner(ref: str) -> None:
    assert isinstance(resolve_reference(BASE, ref), str)


class Clock:
    def __init__(self) -> None:
        self.now = 1_700_000_000.0

    def __call__(self) -> float:
        return self.now


def test_cerez_saklama_ve_gonderme() -> None:
    clock = Clock()
    jar = CookieJar(clock)
    site = parse_url("https://www.ornek.test/hesap/giris")
    assert jar.set_from_header(site, "oturum=abc; Path=/; Secure; HttpOnly; Max-Age=60")
    assert jar.set_from_header(site, "tema=koyu")  # varsayılan yol: /hesap
    assert jar.set_from_header(site, "dil=tr; Domain=.ornek.test; Path=/")
    assert jar.cookie_header(parse_url("https://www.ornek.test/hesap/ayar")) == (
        "tema=koyu; oturum=abc; dil=tr"
    )
    assert jar.cookie_header(parse_url("http://www.ornek.test/")) == "dil=tr"  # Secure gitmez
    assert jar.cookie_header(parse_url("https://api.ornek.test/")) == "dil=tr"  # alan çerezi
    assert jar.cookie_header(parse_url("https://ornek.test.kotu.site/")) is None
    clock.now += 61
    assert jar.cookie_header(parse_url("https://www.ornek.test/")) == "dil=tr"


@pytest.mark.parametrize(
    ("url", "header"),
    [
        ("https://www.ornek.test/", "a=1; Domain=baska.test"),  # başka siteye çerez yazma
        ("https://www.ornek.test/", "a=1; Domain=test"),  # tek etiketli üst alan
        ("https://www.ornek.test/", "a=1; Domain=ww.ornek.test"),
        ("http://www.ornek.test/", "a=1; Secure"),  # http üzerinden Secure
        ("https://www.ornek.test/", "__Secure-a=1"),
        ("https://www.ornek.test/", "__Host-a=1; Secure; Path=/; Domain=ornek.test"),
        ("https://www.ornek.test/", "__Host-a=1; Secure; Path=/alt"),
        ("https://127.0.0.1/", "a=1; Domain=0.0.1"),
        ("https://www.ornek.test/", "adsiz"),
        ("https://www.ornek.test/", "=deger"),
    ],
)
def test_reddedilen_cerezler(url: str, header: str) -> None:
    jar = CookieJar(Clock())
    assert not jar.set_from_header(parse_url(url), header)
    assert len(jar) == 0


def test_cerez_silme_ve_guncelleme() -> None:
    jar = CookieJar(Clock())
    site = parse_url("https://ornek.test/")
    jar.set_from_header(site, "a=1; Path=/")
    jar.set_from_header(site, "a=2; Path=/")
    assert jar.cookie_header(site) == "a=2"
    jar.set_from_header(site, "a=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT")
    assert jar.cookie_header(site) is None
    jar.set_from_header(site, "b=1; Max-Age=0")
    assert len(jar) == 0
    assert jar.set_from_header(site, "__Host-c=1; Secure; Path=/")


def test_cerez_yardimcilari() -> None:
    assert domain_match("www.ornek.test", "ornek.test")
    assert not domain_match("kotuornek.test", "ornek.test")
    assert not domain_match("1.2.3.4", "2.3.4")
    assert default_path("/a/b/c") == "/a/b"
    assert default_path("/a") == default_path("") == "/"
    assert path_match("/a/b", "/a")
    assert path_match("/a/", "/a/")
    assert not path_match("/ab", "/a")
